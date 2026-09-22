import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { participantCookieName, TeamResponseSubmissionSchema } from '@/lib/live';
import { handleTeamEditAction } from '@/lib/team-edit-server';

type RouteContext = { params: Promise<{ id: string }> };
type EdgeResponse = { error?: string; [key: string]: unknown };

export async function POST(req: Request, { params }: RouteContext) {
  const { id } = await params;
  const cookieStore = await cookies();
  const participantToken = cookieStore.get(participantCookieName(id))?.value;
  if (!participantToken) return NextResponse.json({ error: 'Účastník nebyl ověřen.' }, { status: 401 });

  try {
    const input = TeamResponseSubmissionSchema.parse(await req.json());
    const serviceResponse = await handleTeamEditAction({
      action: 'save',
      sessionId: id,
      participantToken,
      blockId: input.blockId,
      text: input.text,
    });
    const data = await serviceResponse.json() as EdgeResponse;
    return NextResponse.json(data, { status: serviceResponse.status });
  } catch (error) {
    console.error('student team response failed', error);
    return NextResponse.json({ error: 'Týmovou odpověď se nepodařilo odeslat.' }, { status: 400 });
  }
}
