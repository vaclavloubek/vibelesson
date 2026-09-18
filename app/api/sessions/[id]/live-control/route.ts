import { NextResponse } from 'next/server';
import { getAuthenticatedUserId } from '@/lib/auth';
import {
  bootstrapLiveControl,
  liveControlConfigured,
  mintLiveCapability,
  publicLessonSnapshot,
  type LiveControlRole,
} from '@/lib/live-control-server';
import { readLiveResume, setLiveResumeCookie } from '@/lib/live-resume';
import { LessonSchema } from '@/lib/schema';

type RouteContext = { params: Promise<{ id: string }> };

function requestedRole(req: Request): Extract<LiveControlRole, 'teacher' | 'presenter'> {
  return new URL(req.url).searchParams.get('role') === 'presenter' ? 'presenter' : 'teacher';
}

function degradedAccess(id: string, userId: string, role: Extract<LiveControlRole, 'teacher' | 'presenter'>) {
  const access = mintLiveCapability({ sessionId: id, subject: userId, role });
  return NextResponse.json({
    enabled: Boolean(access),
    degraded: true,
    liveControl: access,
  });
}

export async function GET(req: Request, { params }: RouteContext) {
  if (!liveControlConfigured()) return NextResponse.json({ enabled: false });

  const { id } = await params;
  const role = requestedRole(req);
  const resume = await readLiveResume(id);
  const { supabase, userId, error: authError } = await getAuthenticatedUserId();

  if (!userId) {
    if (authError && resume) {
      console.warn('live control capability restored from resume ticket after primary auth failure', {
        sessionId: id,
        authError: true,
      });
      return degradedAccess(id, resume.userId, role);
    }
    return NextResponse.json({ error: 'Nejdřív se přihlas.' }, { status: 401 });
  }

  const { data: session, error } = await supabase
    .from('sessions')
    .select('id,join_code,status,active_block_id,lesson_snapshot,revealed_block_ids,scoreboard_revealed,timer_status,timer_started_at,timer_remaining_seconds,live_control_revision')
    .eq('id', id)
    .eq('teacher_id', userId)
    .maybeSingle();

  if (error) {
    console.warn('live control primary session lookup failed', { sessionId: id, code: error.code });
    if (resume?.userId === userId) return degradedAccess(id, userId, role);
    return NextResponse.json({ error: 'Primární live služba je dočasně nedostupná.' }, { status: 503 });
  }
  if (!session) return NextResponse.json({ error: 'Hodina nebyla nalezena.' }, { status: 404 });

  const lesson = LessonSchema.safeParse(session.lesson_snapshot);
  if (!lesson.success) return NextResponse.json({ error: 'Snapshot lekce je neplatný.' }, { status: 500 });

  const [{ data: teams }, { data: participants }, { data: responses }, { data: teamResponses }] = await Promise.all([
    supabase.from('teams').select('id,name,sort_order').eq('session_id', id).order('sort_order'),
    supabase.from('participants').select('id,display_name,team_id,team_updated_at').eq('session_id', id).order('joined_at'),
    supabase.from('responses').select('participant_id,block_id,answer,updated_at,submitted_answer,submitted_at').eq('session_id', id),
    supabase.from('team_responses').select('team_id,block_id,answer,updated_by_participant_id,updated_at,submitted_answer,submitted_at').eq('session_id', id),
  ]);

  await bootstrapLiveControl({
    sessionId: id,
    joinCode: session.join_code,
    revision: Number(session.live_control_revision ?? 0),
    status: session.status,
    activeBlockId: session.active_block_id,
    lessonSnapshot: publicLessonSnapshot(lesson.data),
    teams: (teams ?? []).map((team) => ({ id: team.id, name: team.name, sortOrder: team.sort_order })),
    participants: (participants ?? []).map((participant) => ({
      id: participant.id,
      displayName: participant.display_name,
      teamId: participant.team_id,
      teamUpdatedAt: participant.team_updated_at,
    })),
    responses: (responses ?? []).map((response) => ({
      participantId: response.participant_id,
      blockId: response.block_id,
      answer: response.answer,
      submitted: Boolean(response.submitted_at),
      updatedAt: response.updated_at,
      submittedAnswer: response.submitted_answer,
      submittedAt: response.submitted_at,
      source: 'primary' as const,
      submissionSource: response.submitted_at ? 'primary' as const : undefined,
    })),
    teamResponses: (teamResponses ?? []).flatMap((response) => {
      const answer = response.answer as { text?: unknown } | null;
      const submitted = response.submitted_answer as { text?: unknown } | null;
      return typeof answer?.text === 'string'
        ? [{
            teamId: response.team_id,
            blockId: response.block_id,
            text: answer.text,
            submitted: Boolean(response.submitted_at),
            updatedAt: response.updated_at,
            submittedText: typeof submitted?.text === 'string' ? submitted.text : null,
            submittedAt: response.submitted_at,
            updatedByParticipantId: response.updated_by_participant_id,
            source: 'primary' as const,
            submissionSource: response.submitted_at ? 'primary' as const : undefined,
          }]
        : [];
    }),
    revealedBlockIds: Array.isArray(session.revealed_block_ids) ? session.revealed_block_ids : [],
    scoreboardRevealed: Boolean(session.scoreboard_revealed),
    timer: {
      status: session.timer_status,
      startedAt: session.timer_started_at,
      remainingSeconds: session.timer_remaining_seconds,
    },
    updatedAt: new Date().toISOString(),
  });

  await setLiveResumeCookie(id, userId);
  const access = mintLiveCapability({ sessionId: id, subject: userId, role });
  return NextResponse.json({ enabled: Boolean(access), degraded: false, liveControl: access });
}
