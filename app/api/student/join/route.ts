import { NextResponse } from 'next/server';
import { z } from 'zod';
import { participantCookieName } from '@/lib/live';

const JoinSchema = z.object({
  joinCode: z.string().trim().toUpperCase().regex(/^[A-HJ-NP-Z2-9]{7}$/),
  displayName: z.string().trim().min(1).max(60),
});

type EdgeJoinResponse = {
  sessionId?: string;
  participantId?: string;
  participantToken?: string;
  participantTokenExpiresAt?: string;
  error?: string;
};

export async function POST(req: Request) {
  try {
    const body = JoinSchema.parse(await req.json());
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
    if (!url || !key) throw new Error('Supabase environment is missing.');

    const edgeResponse = await fetch(`${url}/functions/v1/student-session`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: key,
      },
      body: JSON.stringify({ action: 'join', ...body }),
      cache: 'no-store',
    });
    const data = await edgeResponse.json() as EdgeJoinResponse;

    if (!edgeResponse.ok || !data.sessionId || !data.participantToken || !data.participantTokenExpiresAt) {
      return NextResponse.json({ error: data.error || 'Ke hodině se nepodařilo připojit.' }, { status: edgeResponse.status || 500 });
    }

    const expiresAt = new Date(data.participantTokenExpiresAt);
    if (!Number.isFinite(expiresAt.getTime()) || expiresAt.getTime() <= Date.now()) {
      console.error('student join returned invalid participant token expiry');
      return NextResponse.json({ error: 'Ke hodině se nepodařilo připojit.' }, { status: 502 });
    }

    const response = NextResponse.json({ sessionId: data.sessionId });
    response.cookies.set(participantCookieName(data.sessionId), data.participantToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      expires: expiresAt,
    });
    return response;
  } catch (error) {
    console.error('student join failed', error);
    return NextResponse.json({ error: 'Zkontroluj kód hodiny a jméno.' }, { status: 400 });
  }
}
