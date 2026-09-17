import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { participantCookieName, StudentResponseSubmissionSchema } from '@/lib/live';

type RouteContext = { params: Promise<{ id: string }> };
type EdgeResponse = { error?: string; [key: string]: unknown };

export async function POST(req: Request, { params }: RouteContext) {
  const { id } = await params;
  const cookieStore = await cookies();
  const participantToken = cookieStore.get(participantCookieName(id))?.value;
  if (!participantToken) return NextResponse.json({ error: 'Účastník nebyl ověřen.' }, { status: 401 });

  try {
    const submission = StudentResponseSubmissionSchema.parse(await req.json());
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
    if (!url || !key) throw new Error('Supabase environment is missing.');

    const edgeResponse = await fetch(`${url}/functions/v1/student-session`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: key,
      },
      body: JSON.stringify({
        action: 'respond',
        sessionId: id,
        participantToken,
        blockId: submission.blockId,
        answer: submission.answer,
        responseAction: submission.responseAction,
      }),
      cache: 'no-store',
    });
    const data = await edgeResponse.json() as EdgeResponse;
    return NextResponse.json(data, { status: edgeResponse.status });
  } catch (error) {
    console.error('student response failed', error);
    return NextResponse.json({ error: 'Odpověď se nepodařilo odeslat.' }, { status: 400 });
  }
}
