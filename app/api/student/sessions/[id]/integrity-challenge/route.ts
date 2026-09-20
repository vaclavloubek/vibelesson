import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { participantCookieName } from '@/lib/live';
import { fetchWithTimeout } from '@/lib/fetch-with-timeout';

type RouteContext = { params: Promise<{ id: string }> };
type EdgeResponse = { error?: string; [key: string]: unknown };

export async function POST(req: Request, { params }: RouteContext) {
  const { id } = await params;
  const cookieStore = await cookies();
  const participantToken = cookieStore.get(participantCookieName(id))?.value;
  if (!participantToken) return NextResponse.json({ error: 'Účastník nebyl ověřen.' }, { status: 401 });

  let evaluationId = '';
  let answer = '';
  try {
    const body = await req.json() as Record<string, unknown>;
    evaluationId = typeof body.evaluationId === 'string' ? body.evaluationId : '';
    answer = typeof body.answer === 'string' ? body.answer.trim() : '';
  } catch {
    return NextResponse.json({ error: 'Kontrolní odpověď nemá platný formát.' }, { status: 400 });
  }

  if (!/^[0-9a-f-]{36}$/i.test(evaluationId) || answer.length < 1 || answer.length > 1000) {
    return NextResponse.json({ error: 'Kontrolní odpověď nemá platný formát.' }, { status: 400 });
  }

  try {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
    if (!url || !key) throw new Error('Supabase environment is missing.');

    const edgeResponse = await fetchWithTimeout(`${url}/functions/v1/student-session`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: key,
      },
      body: JSON.stringify({
        action: 'integrity_challenge',
        sessionId: id,
        participantToken,
        evaluationId,
        answer,
      }),
      cache: 'no-store',
    }, 8_000);

    const data = await edgeResponse.json() as EdgeResponse;
    return NextResponse.json(data, { status: edgeResponse.status });
  } catch (error) {
    console.error('student integrity challenge upstream failed', error);
    return NextResponse.json(
      { error: 'Kontrolní odpověď se teď nepodařilo uložit.' },
      { status: 503 },
    );
  }
}
