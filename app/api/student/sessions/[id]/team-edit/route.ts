import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { participantCookieName, TeamEditRequestSchema } from '@/lib/live';
import { fetchWithTimeout } from '@/lib/fetch-with-timeout';

type RouteContext = { params: Promise<{ id: string }> };
type EdgeResponse = { error?: string; [key: string]: unknown };

export async function POST(req: Request, { params }: RouteContext) {
  const { id } = await params;
  const cookieStore = await cookies();
  const participantToken = cookieStore.get(participantCookieName(id))?.value;
  if (!participantToken) return NextResponse.json({ error: 'Účastník nebyl ověřen.' }, { status: 401 });

  try {
    const input = TeamEditRequestSchema.parse(await req.json());
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
    if (!url || !key) throw new Error('Supabase environment is missing.');

    const edgeResponse = await fetchWithTimeout(`${url}/functions/v1/team-edit`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', apikey: key },
      body: JSON.stringify({
        ...input,
        sessionId: id,
        participantToken,
      }),
      cache: 'no-store',
    }, input.action === 'save' || input.action === 'submit' ? 10_000 : 5_000);
    const data = await edgeResponse.json() as EdgeResponse;
    return NextResponse.json(data, { status: edgeResponse.status });
  } catch (error) {
    console.error('student team edit failed', error);
    return NextResponse.json({ error: 'Týmový editor je dočasně nedostupný.' }, { status: 503 });
  }
}
