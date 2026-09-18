import { NextResponse } from 'next/server';
import { getAuthenticatedUserId } from '@/lib/auth';
import { loadTeacherScoreboard } from '@/lib/scoreboard-server';
import { LessonSchema, type LessonBlock } from '@/lib/schema';

type RouteContext = { params: Promise<{ id: string }> };

type TimerStatus = 'idle' | 'running' | 'paused';

function toPresenterBlock(block: LessonBlock | null) {
  if (!block) return null;
  return {
    id: block.id,
    type: block.type,
    title: block.title,
    durationMinutes: block.durationMinutes,
    instructions: block.instructions,
    options: block.options ?? null,
    items: block.items ?? null,
    revealText: block.type === 'reveal' ? block.revealText ?? null : null,
  };
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

  const { id: sessionId } = await params;
  const result = await loadTeacherScoreboard(sessionId, userId, supabase);
  if ('error' in result) return NextResponse.json({ error: result.error }, { status: result.status });

  const { data: session, error: sessionError } = await supabase
    .from('sessions')
    .select('join_code, status, active_block_id, lesson_snapshot, timer_status, timer_started_at, timer_remaining_seconds')
    .eq('id', sessionId)
    .eq('teacher_id', userId)
    .maybeSingle();

  if (sessionError) {
    console.error('presenter session load failed', sessionError);
    return NextResponse.json({ error: 'Prezentační režim se nepodařilo načíst.' }, { status: 500 });
  }
  if (!session) return NextResponse.json({ error: 'Hodina nebyla nalezena.' }, { status: 404 });

  const lesson = LessonSchema.safeParse(session.lesson_snapshot);
  if (!lesson.success) return NextResponse.json({ error: 'Snapshot lekce je neplatný.' }, { status: 500 });

  const activeBlockIndex = session.active_block_id
    ? lesson.data.blocks.findIndex((block) => block.id === session.active_block_id)
    : -1;
  const activeBlock = activeBlockIndex >= 0 ? lesson.data.blocks[activeBlockIndex] : null;

  let submission: { submitted: number; total: number; unit: 'student' | 'team' } | null = null;

  if (activeBlock && ['poll', 'quiz', 'open_text', 'ranking', 'exit_ticket'].includes(activeBlock.type)) {
    let query = supabase
      .from('responses')
      .select('id', { count: 'exact', head: true })
      .eq('session_id', sessionId)
      .eq('block_id', activeBlock.id);

    if (['open_text', 'ranking', 'exit_ticket'].includes(activeBlock.type)) {
      query = query.not('submitted_at', 'is', null);
    }

    const { count, error } = await query;
    if (error) {
      console.error('presenter response count failed', error);
    } else {
      submission = { submitted: count ?? 0, total: result.data.rows.length, unit: 'student' };
    }
  } else if (activeBlock?.type === 'team_task') {
    const [teamsResult, responsesResult] = await Promise.all([
      supabase.from('teams').select('id', { count: 'exact', head: true }).eq('session_id', sessionId),
      supabase
        .from('team_responses')
        .select('team_id', { count: 'exact', head: true })
        .eq('session_id', sessionId)
        .eq('block_id', activeBlock.id)
        .not('submitted_at', 'is', null),
    ]);
    if (teamsResult.error || responsesResult.error) {
      console.error('presenter team response count failed', { teams: teamsResult.error, responses: responsesResult.error });
    } else {
      submission = { submitted: responsesResult.count ?? 0, total: teamsResult.count ?? 0, unit: 'team' };
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

  const data = result.data;
  const finalBoard = data.status === 'ended';
  const showRows = finalBoard || data.scoreboardRevealed;

  return NextResponse.json({
    status: data.status,
    title: data.title,
    realtimeKey: data.realtimeKey,
    joinCode: session.join_code,
    participantCount: data.rows.length,
    activeBlockIndex,
    blockCount: lesson.data.blocks.length,
    activeBlock: toPresenterBlock(activeBlock),
    submission,
    timer,
    hasScoring: data.hasScoring,
    scoreboardRevealed: finalBoard || data.scoreboardRevealed,
    maxPoints: data.availableMaxPoints,
    rows: showRows
      ? data.rows.map((row) => ({
          rank: row.rank,
          displayName: row.displayName,
          score: row.score,
        }))
      : [],
  });
}
