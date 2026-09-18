import { after, NextResponse } from 'next/server';
import { getAuthenticatedUserId } from '@/lib/auth';
import { broadcastSessionInvalidate } from '@/lib/live-server';
import { mirrorLiveControlEvent } from '@/lib/live-control-server';
import { SessionActionSchema, StudentAnswerSchema, TeamAnswerSchema } from '@/lib/live';
import { LessonSchema, type LessonBlock } from '@/lib/schema';

type RouteContext = { params: Promise<{ id: string }> };
type SupabaseClient = Awaited<ReturnType<typeof getAuthenticatedUserId>>['supabase'];
type TimerStatus = 'idle' | 'running' | 'paused';

async function loadOwnedSession(id: string, userId: string, supabase: SupabaseClient) {
  return supabase
    .from('sessions')
    .select('id, lesson_id, teacher_id, join_code, status, active_block_id, lesson_snapshot, realtime_key, created_at, started_at, ended_at, revealed_block_ids, scoreboard_revealed, timer_status, timer_started_at, timer_remaining_seconds')
    .eq('id', id)
    .eq('teacher_id', userId)
    .single();
}

function defaultTimerSeconds(block: LessonBlock | null) {
  return block?.type === 'timer' ? block.durationMinutes * 60 : null;
}

function effectiveTimerRemaining(session: { timer_status: string; timer_started_at: string | null; timer_remaining_seconds: number | null }, nowMs = Date.now()) {
  const base = Math.max(0, session.timer_remaining_seconds ?? 0);
  if (session.timer_status !== 'running' || !session.timer_started_at) return base;
  const elapsed = Math.max(0, Math.floor((nowMs - Date.parse(session.timer_started_at)) / 1000));
  return Math.max(0, base - elapsed);
}

export async function GET(_req: Request, { params }: RouteContext) {
  const { supabase, userId } = await getAuthenticatedUserId();
  if (!userId) return NextResponse.json({ error: 'Nejdřív se přihlas.' }, { status: 401 });

  const { id } = await params;
  const { data: session, error } = await loadOwnedSession(id, userId, supabase);
  if (error || !session) return NextResponse.json({ error: 'Hodina nebyla nalezena.' }, { status: 404 });

  const parsedLesson = LessonSchema.safeParse(session.lesson_snapshot);
  if (!parsedLesson.success) return NextResponse.json({ error: 'Snapshot lekce je neplatný.' }, { status: 500 });

  const [{ data: participants, error: participantError }, { data: teams, error: teamsError }] = await Promise.all([
    supabase.from('participants').select('id, display_name, joined_at, team_id').eq('session_id', id).order('joined_at', { ascending: true }),
    supabase.from('teams').select('id, name, sort_order').eq('session_id', id).order('sort_order', { ascending: true }),
  ]);

  if (participantError) {
    console.error('participants load failed', participantError);
    return NextResponse.json({ error: 'Účastníky se nepodařilo načíst.' }, { status: 500 });
  }
  if (teamsError) {
    console.error('teams load failed', teamsError);
    return NextResponse.json({ error: 'Týmy se nepodařilo načíst.' }, { status: 500 });
  }

  const participantRows = participants ?? [];
  const participantNames = new Map(participantRows.map((participant) => [participant.id as string, participant.display_name as string]));
  const responses: Array<{ participantId: string; displayName: string; answer: unknown; updatedAt: string; submitted: boolean }> = [];
  const teamResponses: Array<{ teamId: string; text: string; updatedByParticipantId: string | null; updatedByDisplayName: string | null; updatedAt: string; submitted: boolean }> = [];

  const activeBlock = session.active_block_id
    ? parsedLesson.data.blocks.find((block) => block.id === session.active_block_id) ?? null
    : null;

  if (session.active_block_id && activeBlock?.type === 'team_task') {
    const { data: teamResponseRows, error: teamResponseError } = await supabase
      .from('team_responses')
      .select('team_id, answer, updated_by_participant_id, updated_at, submitted_at')
      .eq('session_id', id)
      .eq('block_id', session.active_block_id)
      .order('updated_at', { ascending: true });

    if (teamResponseError) {
      console.error('team responses load failed', teamResponseError);
      return NextResponse.json({ error: 'Týmové odpovědi se nepodařilo načíst.' }, { status: 500 });
    }

    for (const response of teamResponseRows ?? []) {
      const parsedAnswer = TeamAnswerSchema.safeParse(response.answer);
      if (!parsedAnswer.success) continue;
      const updaterId = response.updated_by_participant_id as string | null;
      teamResponses.push({
        teamId: response.team_id as string,
        text: parsedAnswer.data.text,
        updatedByParticipantId: updaterId,
        updatedByDisplayName: updaterId ? participantNames.get(updaterId) ?? 'Student' : null,
        updatedAt: response.updated_at as string,
        submitted: Boolean(response.submitted_at),
      });
    }
  } else if (session.active_block_id) {
    const { data: responseRows, error: responseError } = await supabase
      .from('responses')
      .select('participant_id, answer, updated_at, submitted_at')
      .eq('session_id', id)
      .eq('block_id', session.active_block_id)
      .order('updated_at', { ascending: true });

    if (responseError) {
      console.error('responses load failed', responseError);
      return NextResponse.json({ error: 'Odpovědi se nepodařilo načíst.' }, { status: 500 });
    }

    for (const response of responseRows ?? []) {
      const parsedAnswer = StudentAnswerSchema.safeParse(response.answer);
      if (!parsedAnswer.success) continue;
      responses.push({
        participantId: response.participant_id as string,
        displayName: participantNames.get(response.participant_id as string) ?? 'Student',
        answer: parsedAnswer.data,
        updatedAt: response.updated_at as string,
        submitted: Boolean(response.submitted_at),
      });
    }
  }

  const syncedAt = new Date().toISOString();
  const timer = activeBlock?.type === 'timer'
    ? {
        status: session.timer_status as TimerStatus,
        remainingSeconds: effectiveTimerRemaining(session, Date.parse(syncedAt)),
        syncedAt,
      }
    : null;

  return NextResponse.json({
    session: {
      id: session.id,
      lessonId: session.lesson_id,
      joinCode: session.join_code,
      status: session.status,
      activeBlockId: session.active_block_id,
      lessonSnapshot: parsedLesson.data,
      realtimeKey: session.realtime_key,
      createdAt: session.created_at,
      startedAt: session.started_at,
      endedAt: session.ended_at,
      resultsRevealed: Boolean(activeBlock && (session.revealed_block_ids ?? []).includes(activeBlock.id)),
      scoreboardRevealed: Boolean(session.scoreboard_revealed),
      timer,
      teams: (teams ?? []).map((team) => ({ id: team.id, name: team.name, sortOrder: team.sort_order })),
      participants: participantRows.map((participant) => ({
        id: participant.id,
        displayName: participant.display_name,
        joinedAt: participant.joined_at,
        teamId: participant.team_id,
      })),
      responses,
      teamResponses,
    },
  });
}

export async function PATCH(req: Request, { params }: RouteContext) {
  const { supabase, userId } = await getAuthenticatedUserId();
  if (!userId) return NextResponse.json({ error: 'Nejdřív se přihlas.' }, { status: 401 });

  try {
    const { id } = await params;
    const action = SessionActionSchema.parse(await req.json());
    const { data: session, error } = await loadOwnedSession(id, userId, supabase);
    if (error || !session) return NextResponse.json({ error: 'Hodina nebyla nalezena.' }, { status: 404 });

    const lesson = LessonSchema.parse(session.lesson_snapshot);
    const now = new Date().toISOString();
    const activeBlock = lesson.blocks.find((block) => block.id === session.active_block_id) ?? null;
    let update: Record<string, string | number | boolean | string[] | null> = {};

    if (action.action === 'start') {
      if (session.status !== 'lobby') return NextResponse.json({ error: 'Hodinu lze zahájit pouze z lobby.' }, { status: 409 });
      if (lesson.blocks.some((block) => block.type === 'team_task')) {
        const { count, error: teamCountError } = await supabase
          .from('teams')
          .select('id', { count: 'exact', head: true })
          .eq('session_id', id);
        if (teamCountError) throw teamCountError;
        if ((count ?? 0) < 2) {
          return NextResponse.json({ error: 'Lekce obsahuje týmový úkol. Před zahájením vytvoř alespoň 2 týmy.' }, { status: 409 });
        }
      }
      const firstBlock = lesson.blocks[0];
      update = {
        status: 'live',
        active_block_id: firstBlock.id,
        started_at: now,
        timer_status: 'idle',
        timer_started_at: null,
        timer_remaining_seconds: defaultTimerSeconds(firstBlock),
      };
    } else if (action.action === 'end') {
      if (session.status === 'ended') return NextResponse.json({ ok: true, status: 'ended', activeBlockId: session.active_block_id, scoreboardRevealed: Boolean(session.scoreboard_revealed) });
      update = { status: 'ended', ended_at: now, timer_status: 'idle', timer_started_at: null };
    } else if (action.action === 'reveal_results') {
      if (session.status !== 'live') return NextResponse.json({ error: 'Výsledky lze zveřejnit pouze během živé hodiny.' }, { status: 409 });
      if (!activeBlock || (activeBlock.type !== 'poll' && activeBlock.type !== 'quiz')) {
        return NextResponse.json({ error: 'Výsledky lze zveřejnit pouze u hlasování nebo kvízu.' }, { status: 409 });
      }
      const revealedBlockIds = (session.revealed_block_ids ?? []) as string[];
      if (revealedBlockIds.includes(activeBlock.id)) return NextResponse.json({ ok: true, status: session.status, activeBlockId: session.active_block_id, scoreboardRevealed: Boolean(session.scoreboard_revealed) });
      update = { revealed_block_ids: [...revealedBlockIds, activeBlock.id] };
    } else if (action.action === 'reveal_scoreboard' || action.action === 'hide_scoreboard') {
      if (session.status !== 'live' && session.status !== 'ended') {
        return NextResponse.json({ error: 'Pořadí lze měnit až po zahájení hodiny.' }, { status: 409 });
      }
      const scoreboardRevealed = action.action === 'reveal_scoreboard';
      if (Boolean(session.scoreboard_revealed) === scoreboardRevealed) {
        return NextResponse.json({ ok: true, status: session.status, activeBlockId: session.active_block_id, scoreboardRevealed });
      }
      update = { scoreboard_revealed: scoreboardRevealed };
    } else if (action.action === 'timer_start' || action.action === 'timer_pause' || action.action === 'timer_reset') {
      if (session.status !== 'live') return NextResponse.json({ error: 'Timer lze ovládat pouze během živé hodiny.' }, { status: 409 });
      if (!activeBlock || activeBlock.type !== 'timer') return NextResponse.json({ error: 'Aktuální blok není timer.' }, { status: 409 });
      const fullDuration = activeBlock.durationMinutes * 60;
      const currentRemaining = session.timer_remaining_seconds ?? fullDuration;

      if (action.action === 'timer_reset') {
        update = { timer_status: 'idle', timer_started_at: null, timer_remaining_seconds: fullDuration };
      } else if (action.action === 'timer_pause') {
        if (session.timer_status !== 'running') return NextResponse.json({ error: 'Timer právě neběží.' }, { status: 409 });
        update = {
          timer_status: 'paused',
          timer_started_at: null,
          timer_remaining_seconds: effectiveTimerRemaining(session),
        };
      } else {
        if (session.timer_status === 'running') return NextResponse.json({ ok: true, status: session.status, activeBlockId: session.active_block_id, scoreboardRevealed: Boolean(session.scoreboard_revealed) });
        if (currentRemaining <= 0) return NextResponse.json({ error: 'Čas vypršel. Nejdřív timer resetuj.' }, { status: 409 });
        update = { timer_status: 'running', timer_started_at: now, timer_remaining_seconds: currentRemaining };
      }
    } else {
      if (session.status !== 'live') return NextResponse.json({ error: 'Blok lze měnit pouze během živé hodiny.' }, { status: 409 });
      if (action.expectedActiveBlockId && action.expectedActiveBlockId !== session.active_block_id) {
        return NextResponse.json({
          ok: true,
          status: session.status,
          activeBlockId: session.active_block_id,
          scoreboardRevealed: Boolean(session.scoreboard_revealed),
          replayed: true,
        });
      }
      const currentIndex = lesson.blocks.findIndex((block) => block.id === session.active_block_id);
      if (currentIndex < 0) return NextResponse.json({ error: 'Aktuální blok není ve snapshotu lekce.' }, { status: 500 });
      const nextIndex = action.action === 'next' ? currentIndex + 1 : currentIndex - 1;
      if (nextIndex < 0 || nextIndex >= lesson.blocks.length) {
        return NextResponse.json({ error: action.action === 'next' ? 'Jsi na posledním bloku.' : 'Jsi na prvním bloku.' }, { status: 409 });
      }
      const targetBlock = lesson.blocks[nextIndex];
      update = {
        active_block_id: targetBlock.id,
        timer_status: 'idle',
        timer_started_at: null,
        timer_remaining_seconds: defaultTimerSeconds(targetBlock),
      };
    }

    const { data: updated, error: updateError } = await supabase
      .from('sessions')
      .update(update)
      .eq('id', id)
      .eq('teacher_id', userId)
      .select('status, active_block_id, realtime_key, scoreboard_revealed')
      .single();

    if (updateError || !updated) throw updateError ?? new Error('Session update returned no row.');
    after(async () => {
      await Promise.allSettled([
        broadcastSessionInvalidate(updated.realtime_key as string),
        mirrorLiveControlEvent({
          sessionId: id,
          role: 'teacher',
          subject: userId,
          type: 'teacher.command',
          operationId: action.operationId,
          payload: {
            action: action.action,
            source: 'primary',
            ...('expectedActiveBlockId' in action ? { expectedActiveBlockId: action.expectedActiveBlockId } : {}),
          },
        }),
      ]);
    });

    return NextResponse.json({
      ok: true,
      status: updated.status,
      activeBlockId: updated.active_block_id,
      scoreboardRevealed: Boolean(updated.scoreboard_revealed),
    });
  } catch (error) {
    console.error('update session failed', error);
    return NextResponse.json({ error: 'Stav hodiny se nepodařilo změnit.' }, { status: 500 });
  }
}
