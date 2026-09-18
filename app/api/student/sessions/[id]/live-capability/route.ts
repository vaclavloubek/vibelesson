import { createHash } from 'node:crypto';
import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { participantCookieName } from '@/lib/live';
import { createLiveCapability } from '@/lib/live-control-plane';

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(_req: Request, { params }: RouteContext) {
  const { id } = await params;
  const cookieStore = await cookies();
  const participantToken = cookieStore.get(participantCookieName(id))?.value;
  if (!participantToken) return NextResponse.json({ error: 'Účastník nebyl ověřen.' }, { status: 401 });
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) return NextResponse.json({ enabled: false });
  try {
    const response = await fetch(`${url}/functions/v1/student-session`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', apikey: key },
      body: JSON.stringify({ action: 'state', sessionId: id, participantToken }),
      cache: 'no-store',
    });
    if (!response.ok) return NextResponse.json({ error: 'Účastník nebyl ověřen.' }, { status: response.status });
    const subject = createHash('sha256').update(participantToken).digest('hex');
    const capability = createLiveCapability(id, 'student', subject);
    return capability ? NextResponse.json({ enabled: true, ...capability }) : NextResponse.json({ enabled: false });
  } catch {
    return NextResponse.json({ enabled: false });
  }
}
