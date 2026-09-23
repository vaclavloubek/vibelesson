import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { participantCookieName, TeamEditRequestSchema } from '@/lib/live';
import { handleTeamEditAction } from '@/lib/team-edit-server';

type RouteContext = { params: Promise<{ id: string }> };
type EdgeResponse = { error?: string; [key: string]: unknown };

export async function POST(req: Request, { params }: RouteContext) {
  const { id } = await params;
  const cookieStore = await cookies();
  const participantToken = cookieStore.get(participantCookieName(id))?.value;
  if (!participantToken) return NextResponse.json({ error: 'Účastník nebyl ověřen.' }, { status: 401 });

  try {
    const input = TeamEditRequestSchema.parse(await req.json());
    const serviceResponse = await handleTeamEditAction({
      ...input,
      sessionId: id,
      participantToken,
    });
    const data = await serviceResponse.json() as EdgeResponse;
    return NextResponse.json(data, { status: serviceResponse.status });
  } catch (error) {
    console.error('student team edit failed', error);
    return NextResponse.json({ error: 'Týmový editor je dočasně nedostupný.' }, { status: 503 });
  }
}
