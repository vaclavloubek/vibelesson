import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { participantCookieName, StudentTeamChoiceSchema } from '@/lib/live';
import { handleStudentSessionAction } from '@/lib/student-session-server';

type RouteContext = { params: Promise<{ id: string }> };
type EdgeResponse = { error?: string; [key: string]: unknown };

export async function POST(req: Request, { params }: RouteContext) {
  const { id } = await params;
  const cookieStore = await cookies();
  const participantToken = cookieStore.get(participantCookieName(id))?.value;
  if (!participantToken) return NextResponse.json({ error: 'Účastník nebyl ověřen.' }, { status: 401 });

  try {
    const input = StudentTeamChoiceSchema.parse(await req.json());
    const serviceResponse = await handleStudentSessionAction({
      action: 'choose_team',
      sessionId: id,
      participantToken,
      teamId: input.teamId,
      operationId: input.operationId,
    });
    const data = await serviceResponse.json() as EdgeResponse;
    return NextResponse.json(data, { status: serviceResponse.status });
  } catch (error) {
    console.error('student choose team failed', error);
    return NextResponse.json({ error: 'Výběr týmu je dočasně nedostupný.' }, { status: 503 });
  }
}
