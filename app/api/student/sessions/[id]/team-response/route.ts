import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { participantCookieName, TeamResponseSubmissionSchema } from '@/lib/live';

type RouteContext = { params: Promise<{ id: string }> };
type EdgeResponse = { error?: string; [key: string]: unknown };

export async function POST(req: Request, { params }: RouteContext) {
  const { id } = await params;
  const cookieStore = await cookies();
  const participantToken = cookieStore.get(participantCookieName(id))?.value;
  if (!participantToken) return NextResponse.json({ error: 'Účastník nebyl ověřen.' }, { status: 401 });

  try {
    const input = TeamResponseSubmissionSchema.parse(await req.json());
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
    if (!url || !key) throw new Error('Supabase environment is missing.');

    const edgeResponse = await fetch(`${url}/functions/v1/team-edit`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', apikey: key },
      body: JSON.stringify({
        action: 'save',
        sessionId: id,
        participantToken,
        blockId: input.blockId,
        text: input.text,
      }),
      cache: 'no-store',
    });
    const data = await edgeResponse.json() as EdgeResponse;
    return NextResponse.json(data, { status: edgeResponse.status });
  } catch (error) {
    console.error('student team response failed', error);
    return NextResponse.json({ error: 'Týmovou odpověď se nepodařilo odeslat.' }, { status: 400 });
  }
}
