import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { participantCookieName } from '@/lib/live';

type RouteContext = { params: Promise<{ id: string }> };

type EdgeStateResponse = { error?: string; [key: string]: unknown };

export async function GET(_req: Request, { params }: RouteContext) {
  const { id } = await params;
  const cookieStore = await cookies();
  const participantToken = cookieStore.get(participantCookieName(id))?.value;
  if (!participantToken) return NextResponse.json({ error: 'Účastník nebyl ověřen.' }, { status: 401 });

  try {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
    if (!url || !key) throw new Error('Supabase environment is missing.');

    const edgeResponse = await fetch(`${url}/functions/v1/student-session`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: key,
      },
      body: JSON.stringify({ action: 'state', sessionId: id, participantToken }),
      cache: 'no-store',
    });
    const data = await edgeResponse.json() as EdgeStateResponse;
    return NextResponse.json(data, { status: edgeResponse.status });
  } catch (error) {
    console.error('student state failed', error);
    return NextResponse.json({ error: 'Stav hodiny se nepodařilo načíst.' }, { status: 500 });
  }
}
