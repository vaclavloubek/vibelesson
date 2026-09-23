import { createHash } from 'node:crypto';
import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { participantCookieName, type PublicScoreboardState } from '@/lib/live';
import { useNeonLiveSessionData } from '@/lib/neon/live-session-config';
import { readNeonStudentScoreboard } from '@/lib/neon/student-session-server';
import { handleStudentSessionAction } from '@/lib/student-session-server';

type RouteContext = { params: Promise<{ id: string }> };

function sanitizeScoreboard(value: unknown): PublicScoreboardState | null {
  if (!value || typeof value !== 'object') return null;
  const raw = value as Record<string, unknown>;
  if (
    typeof raw.score !== 'number' || !Number.isFinite(raw.score) || raw.score < 0
    || typeof raw.maxPoints !== 'number' || !Number.isFinite(raw.maxPoints) || raw.maxPoints < 0
    || typeof raw.rank !== 'number' || !Number.isInteger(raw.rank) || raw.rank < 1
  ) return null;
  return { score: raw.score, maxPoints: raw.maxPoints, rank: raw.rank };
}

export async function GET(_req: Request, { params }: RouteContext) {
  const { id } = await params;
  const cookieStore = await cookies();
  const participantToken = cookieStore.get(participantCookieName(id))?.value;
  if (!participantToken) return NextResponse.json({ error: 'Chybí participant identita.' }, { status: 401 });

  try {
    const response = await handleStudentSessionAction({ action: 'state', sessionId: id, participantToken });
    const data = await response.json() as Record<string, unknown>;
    if (!response.ok) return NextResponse.json(data, { status: response.status });

    let scoreboard: PublicScoreboardState | null = null;
    try {
      const participantTokenHash = createHash('sha256').update(participantToken).digest('hex');
      if (useNeonLiveSessionData()) {
        scoreboard = sanitizeScoreboard(await readNeonStudentScoreboard(id, participantTokenHash));
      } else {
        const { createAdminClient } = await import('@/lib/supabase/admin');
        const { data: score, error: scoreError } = await createAdminClient().rpc('get_student_public_scoreboard', {
          p_session_id: id,
          p_participant_token_hash: participantTokenHash,
        });
        if (scoreError) console.error('student public scoreboard RPC failed', scoreError);
        else scoreboard = sanitizeScoreboard(score);
      }
    } catch (scoreError) {
      console.error('student public scoreboard lookup failed', scoreError);
    }

    return NextResponse.json({ ...data, scoreboard }, { status: response.status });
  } catch (error) {
    console.error('student state proxy failed', error);
    return NextResponse.json({ error: 'Hodinu se nepodařilo načíst.' }, { status: 500 });
  }
}
