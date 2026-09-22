import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { participantCookieName, StudentResponseSubmissionSchema } from '@/lib/live';
import { handleStudentSessionAction } from '@/lib/student-session-server';

type RouteContext = { params: Promise<{ id: string }> };
type EdgeResponse = { error?: string; [key: string]: unknown };

export async function POST(req: Request, { params }: RouteContext) {
  const { id } = await params;
  const cookieStore = await cookies();
  const participantToken = cookieStore.get(participantCookieName(id))?.value;
  if (!participantToken) return NextResponse.json({ error: 'Účastník nebyl ověřen.' }, { status: 401 });

  let submission: ReturnType<typeof StudentResponseSubmissionSchema.parse>;
  try {
    submission = StudentResponseSubmissionSchema.parse(await req.json());
  } catch {
    return NextResponse.json({ error: 'Odpověď nemá platný formát.' }, { status: 400 });
  }

  try {
    const serviceResponse = await handleStudentSessionAction({
      action: 'respond',
      sessionId: id,
      participantToken,
      blockId: submission.blockId,
      answer: submission.answer,
      responseAction: submission.responseAction,
      operationId: submission.operationId,
    });
    const data = await serviceResponse.json() as EdgeResponse;
    return NextResponse.json(data, { status: serviceResponse.status });
  } catch (error) {
    console.error('student response upstream failed', error);
    return NextResponse.json(
      { error: 'Ukládací služba je dočasně nedostupná.' },
      { status: 503 },
    );
  }
}
