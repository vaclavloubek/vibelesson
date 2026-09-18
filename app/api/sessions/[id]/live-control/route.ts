import { NextResponse } from 'next/server';
import { getAuthenticatedUserId } from '@/lib/auth';
import {
  bootstrapLiveControl,
  liveControlConfigured,
  mintLiveCapability,
  publicLessonSnapshot,
} from '@/lib/live-control-server';
import { LessonSchema } from '@/lib/schema';

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(_req: Request, { params }: RouteContext) {
  if (!liveControlConfigured()) return NextResponse.json({ enabled: false });

  const { id } = await params;
  const { supabase, userId } = await getAuthenticatedUserId();
  if (!userId) return NextResponse.json({ error: 'Nejdřív se přihlas.' }, { status: 401 });

  const { data: session, error } = await supabase
    .from('sessions')
    .select('id,status,active_block_id,lesson_snapshot,revealed_block_ids,timer_status,timer_started_at,timer_remaining_seconds')
    .eq('id', id)
    .eq('teacher_id', userId)
    .maybeSingle();
  if (error || !session) return NextResponse.json({ error: 'Hodina nebyla nalezena.' }, { status: 404 });

  const lesson = LessonSchema.safeParse(session.lesson_snapshot);
  if (!lesson.success) return NextResponse.json({ error: 'Snapshot lekce je neplatný.' }, { status: 500 });

  const [{ data: teams }, { data: participants }, { data: responses }, { data: teamResponses }] = await Promise.all([
    supabase.from('teams').select('id,name,sort_order').eq('session_id', id).order('sort_order'),
    supabase.from('participants').select('id,display_name,team_id').eq('session_id', id).order('joined_at'),
    supabase.from('responses').select('participant_id,block_id,answer,submitted_at').eq('session_id', id),
    supabase.from('team_responses').select('team_id,block_id,answer,submitted_at').eq('session_id', id),
  ]);

  await bootstrapLiveControl({
    sessionId: id,
    revision: 0,
    status: session.status,
    activeBlockId: session.active_block_id,
    lessonSnapshot: publicLessonSnapshot(lesson.data),
    teams: (teams ?? []).map((team) => ({ id: team.id, name: team.name, sortOrder: team.sort_order })),
    participants: (participants ?? []).map((participant) => ({
      id: participant.id,
      displayName: participant.display_name,
      teamId: participant.team_id,
    })),
    responses: (responses ?? []).map((response) => ({
      participantId: response.participant_id,
      blockId: response.block_id,
      answer: response.answer,
      submitted: Boolean(response.submitted_at),
    })),
    teamResponses: (teamResponses ?? []).flatMap((response) => {
      const answer = response.answer as { text?: unknown } | null;
      return typeof answer?.text === 'string'
        ? [{ teamId: response.team_id, blockId: response.block_id, text: answer.text, submitted: Boolean(response.submitted_at) }]
        : [];
    }),
    revealedBlockIds: Array.isArray(session.revealed_block_ids) ? session.revealed_block_ids : [],
    timer: {
      status: session.timer_status,
      startedAt: session.timer_started_at,
      remainingSeconds: session.timer_remaining_seconds,
    },
    updatedAt: new Date().toISOString(),
  });

  const access = mintLiveCapability({ sessionId: id, subject: userId, role: 'teacher' });
  return NextResponse.json({ enabled: Boolean(access), liveControl: access });
}
