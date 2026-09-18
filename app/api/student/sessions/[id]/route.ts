import { createHash } from 'node:crypto';
import { after, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { participantCookieName, type PublicScoreboardState } from '@/lib/live';
import { mirrorLiveSnapshot } from '@/lib/live-control-plane';

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

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) return NextResponse.json({ error: 'Server není správně nakonfigurovaný.' }, { status: 500 });

  try {
    const response = await fetch(`${url}/functions/v1/student-session`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: key,
      },
      body: JSON.stringify({ action: 'state', sessionId: id, participantToken }),
      cache: 'no-store',
    });
    const data = await response.json() as Record<string, unknown>;
    if (!response.ok) return NextResponse.json(data, { status: response.status });

    const participantTokenHash = createHash('sha256').update(participantToken).digest('hex');
    let scoreboard: PublicScoreboardState | null = null;
    try {
      const scoreResponse = await fetch(`${url}/rest/v1/rpc/get_student_public_scoreboard`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          apikey: key,
        },
        body: JSON.stringify({
          p_session_id: id,
          p_participant_token_hash: participantTokenHash,
        }),
        cache: 'no-store',
      });

      if (scoreResponse.ok) {
        scoreboard = sanitizeScoreboard(await scoreResponse.json());
      } else {
        console.error('student public scoreboard RPC failed', scoreResponse.status, await scoreResponse.text());
      }
    } catch (scoreError) {
      console.error('student public scoreboard lookup failed', scoreError);
    }

    const payload = { ...data, scoreboard };
    after(async () => {
      await mirrorLiveSnapshot(id, `student:${participantTokenHash}`, payload);
    });
    return NextResponse.json(payload, { status: response.status });
  } catch (error) {
    console.error('student state proxy failed', error);
    return NextResponse.json({ error: 'Hodinu se nepodařilo načíst.' }, { status: 500 });
  }
}
