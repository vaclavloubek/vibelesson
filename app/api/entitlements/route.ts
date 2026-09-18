import { NextResponse } from 'next/server';
import { getAuthenticatedUserId } from '@/lib/auth';

export async function GET() {
  const { supabase, userId } = await getAuthenticatedUserId();
  if (!userId) return NextResponse.json({ aiGradingEnabled: false }, { status: 401 });

  const { data: profile, error } = await supabase
    .from('profiles')
    .select('role, ai_grading_enabled')
    .eq('id', userId)
    .maybeSingle();

  if (error) {
    console.error('entitlement lookup failed', error);
    return NextResponse.json({ error: 'Oprávnění se nepodařilo načíst.' }, { status: 500 });
  }

  return NextResponse.json({
    aiGradingEnabled: Boolean(profile && (profile.role === 'admin' || profile.ai_grading_enabled)),
  });
}
