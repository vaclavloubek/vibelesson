import { NextResponse } from 'next/server';
import { getAuthenticatedUserId } from '@/lib/auth';
import { isIndividualAiBillingPaused } from '@/lib/individual-ai-billing';

export async function GET() {
  const { supabase, userId } = await getAuthenticatedUserId();
  if (!userId) {
    return NextResponse.json({
      aiGradingEnabled: false,
      multilingualLessonsEnabled: false,
      worksheetExportEnabled: false,
    }, { status: 401 });
  }

  const { data: profile, error } = await supabase
    .from('profiles')
    .select('role, ai_grading_enabled, multilingual_lessons_enabled, worksheet_export_enabled')
    .eq('id', userId)
    .maybeSingle();

  if (error) {
    console.error('entitlement lookup failed', error);
    return NextResponse.json({ error: 'Oprávnění se nepodařilo načíst.' }, { status: 500 });
  }

  let aiBillingPaused = false;
  try {
    aiBillingPaused = await isIndividualAiBillingPaused(userId);
  } catch {
    // Enforcement is also applied at the DB cost boundary; UI state should not
    // turn a transient status lookup into a broader entitlement outage.
  }

  return NextResponse.json({
    aiGradingEnabled: Boolean(profile && (profile.role === 'admin' || profile.ai_grading_enabled)),
    multilingualLessonsEnabled: Boolean(profile && (profile.role === 'admin' || profile.multilingual_lessons_enabled)),
    worksheetExportEnabled: Boolean(profile && (profile.role === 'admin' || profile.worksheet_export_enabled)),
    aiBillingPaused,
  });
}
