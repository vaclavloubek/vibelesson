import { NextResponse } from 'next/server';
import { getAuthenticatedUserId } from '@/lib/auth';
import { isEffectiveAiBillingPaused } from '@/lib/individual-ai-billing';

type RouteContext = { params: Promise<{ id: string }> };

const QUIET_PERIOD_MS = 2500;
const STALE_GRADING_MS = 5 * 60 * 1000;
const MAX_GRADES_PER_WAKE = 4;
const CANDIDATE_LIMIT = 16;

function parseTime(value: unknown) {
  if (typeof value !== 'string') return Number.NaN;
  return Date.parse(value);
}

export async function POST(_req: Request, { params }: RouteContext) {
  const { supabase, userId } = await getAuthenticatedUserId();
  if (!userId) return NextResponse.json({ error: 'Nejdřív se přihlas.' }, { status: 401 });

  try {
    if (await isEffectiveAiBillingPaused(userId)) {
      return NextResponse.json({ evaluationIds: [], aiBillingPaused: true });
    }
  } catch {
    return NextResponse.json({ error: 'Stav platby se nepodařilo ověřit.' }, { status: 503 });
  }

  const { id: sessionId } = await params;
  const { data: session, error: sessionError } = await supabase
    .from('sessions')
    .select('id')
    .eq('id', sessionId)
    .eq('teacher_id', userId)
    .maybeSingle();

  if (sessionError) {
    console.error('background grading session lookup failed', sessionError);
    return NextResponse.json({ error: 'Hodinu se nepodařilo načíst.' }, { status: 500 });
  }
  if (!session) return NextResponse.json({ error: 'Hodina nebyla nalezena.' }, { status: 404 });

  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('role, ai_grading_enabled')
    .eq('id', userId)
    .maybeSingle();

  if (profileError) {
    console.error('background grading entitlement lookup failed', profileError);
    return NextResponse.json({ error: 'Oprávnění pro AI hodnocení se nepodařilo ověřit.' }, { status: 500 });
  }

  const aiGradingEnabled = Boolean(profile && (profile.role === 'admin' || profile.ai_grading_enabled));
  if (!aiGradingEnabled) return NextResponse.json({ evaluationIds: [] });

  const { data: rows, error } = await supabase
    .from('response_evaluations')
    .select('id, status, source_updated_at, updated_at')
    .eq('session_id', sessionId)
    .in('status', ['pending', 'grading'])
    .order('source_updated_at', { ascending: true })
    .limit(CANDIDATE_LIMIT);

  if (error) {
    console.error('background grading queue load failed', error);
    return NextResponse.json({ error: 'Frontu AI hodnocení se nepodařilo načíst.' }, { status: 500 });
  }

  const now = Date.now();
  const quietCutoff = now - QUIET_PERIOD_MS;
  const staleCutoff = now - STALE_GRADING_MS;
  const evaluationIds = (rows ?? [])
    .filter((row) => {
      const status = row.status as string;
      if (status === 'pending') return parseTime(row.source_updated_at) <= quietCutoff;
      if (status === 'grading') return parseTime(row.updated_at) <= staleCutoff;
      return false;
    })
    .slice(0, MAX_GRADES_PER_WAKE)
    .map((row) => row.id as string);

  return NextResponse.json({ evaluationIds });
}
