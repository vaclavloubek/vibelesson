import { NextResponse } from 'next/server';
import { getAuthenticatedUserId } from '@/lib/auth';
import { getEffectiveAiBillingPauseState } from '@/lib/individual-ai-billing';

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

  let aiBillingState: Awaited<ReturnType<typeof getEffectiveAiBillingPauseState>> = {
    reason: null,
    scope: null,
    organizationId: null,
    manager: false,
  };
  try {
    aiBillingState = await getEffectiveAiBillingPauseState(userId);
  } catch {
    // Enforcement is also applied at the DB cost boundary; UI state should not
    // turn a transient status lookup into a broader entitlement outage.
  }

  return NextResponse.json({
    aiGradingEnabled: Boolean(profile && (profile.role === 'admin' || profile.ai_grading_enabled)),
    multilingualLessonsEnabled: Boolean(profile && (profile.role === 'admin' || profile.multilingual_lessons_enabled)),
    worksheetExportEnabled: Boolean(profile && (profile.role === 'admin' || profile.worksheet_export_enabled)),
    aiBillingPaused: aiBillingState.reason !== null,
    aiBillingPauseReason: aiBillingState.reason,
    aiBillingPauseScope: aiBillingState.scope,
    aiBillingPauseManager: aiBillingState.manager,
  });
}
