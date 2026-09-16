import { after, NextResponse } from 'next/server';
import { getAuthenticatedUserId } from '@/lib/auth';

export const maxDuration = 120;

type RouteContext = { params: Promise<{ id: string }> };

const QUIET_PERIOD_MS = 2500;
const STALE_GRADING_MS = 5 * 60 * 1000;
const MAX_GRADES_PER_WAKE = 4;
const CANDIDATE_LIMIT = 16;

function parseTime(value: unknown) {
  if (typeof value !== 'string') return Number.NaN;
  return Date.parse(value);
}

export async function POST(req: Request, { params }: RouteContext) {
  const { supabase, userId } = await getAuthenticatedUserId();
  if (!userId) return NextResponse.json({ error: 'Nejdřív se přihlas.' }, { status: 401 });

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

  const origin = new URL(req.url).origin;
  const cookie = req.headers.get('cookie') ?? '';
  const authorization = req.headers.get('authorization') ?? '';

  after(async () => {
    try {
      const now = Date.now();
      const quietCutoff = now - QUIET_PERIOD_MS;
      const staleCutoff = now - STALE_GRADING_MS;

      const { data: rows, error } = await supabase
        .from('response_evaluations')
        .select('id, status, source_updated_at, updated_at')
        .eq('session_id', sessionId)
        .in('status', ['pending', 'grading'])
        .order('source_updated_at', { ascending: true })
        .limit(CANDIDATE_LIMIT);

      if (error) {
        console.error('background grading queue load failed', error);
        return;
      }

      const candidates = (rows ?? [])
        .filter((row) => {
          const status = row.status as string;
          if (status === 'pending') return parseTime(row.source_updated_at) <= quietCutoff;
          if (status === 'grading') return parseTime(row.updated_at) <= staleCutoff;
          return false;
        })
        .slice(0, MAX_GRADES_PER_WAKE);

      if (!candidates.length) return;

      await Promise.allSettled(candidates.map(async (row) => {
        const headers: Record<string, string> = {};
        if (cookie) headers.cookie = cookie;
        if (authorization) headers.authorization = authorization;

        const response = await fetch(
          `${origin}/api/sessions/${sessionId}/evaluations/${row.id}/grade`,
          {
            method: 'POST',
            headers,
            cache: 'no-store',
          },
        );

        if (!response.ok && response.status !== 409) {
          const body = await response.text().catch(() => '');
          console.error('background evaluation grading request failed', {
            evaluationId: row.id,
            status: response.status,
            body: body.slice(0, 500),
          });
        }
      }));
    } catch (error) {
      console.error('background grading wake failed', error);
    }
  });

  return NextResponse.json({ accepted: true }, { status: 202 });
}
