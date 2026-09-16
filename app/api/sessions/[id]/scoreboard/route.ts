import { NextResponse } from 'next/server';
import { getAuthenticatedUserId } from '@/lib/auth';
import { StudentAnswerSchema } from '@/lib/live';
import { LessonSchema, type LessonBlock } from '@/lib/schema';

type RouteContext = { params: Promise<{ id: string }> };

type EvaluationRow = {
  participant_id: string | null;
  team_id: string | null;
  block_id: string;
  status: string;
  ai_score: number | null;
  teacher_score: number | null;
  teacher_confirmed: boolean;
};

type ScoreSource = 'quiz' | 'ai' | 'teacher' | 'pending' | 'failed' | 'missing';

type BreakdownItem = {
  blockId: string;
  blockTitle: string;
  blockType: string;
  points: number | null;
  maxPoints: number;
  source: ScoreSource;
};

function isAIGradedBlock(block: LessonBlock) {
  if (!['open_text', 'exit_ticket', 'team_task'].includes(block.type)) return false;
  if (!block.points || block.points <= 0 || !block.gradingRubric?.length) return false;
  return block.gradingRubric.reduce((sum, criterion) => sum + criterion.maxPoints, 0) === block.points;
}

export async function GET(_req: Request, { params }: RouteContext) {
  const { supabase, userId } = await getAuthenticatedUserId();
  if (!userId) return NextResponse.json({ error: 'Nejdřív se přihlas.' }, { status: 401 });

  const { id: sessionId } = await params;
  const { data: session, error: sessionError } = await supabase
    .from('sessions')
    .select('status, active_block_id, lesson_snapshot')
    .eq('id', sessionId)
    .eq('teacher_id', userId)
    .maybeSingle();

  if (sessionError) {
    console.error('scoreboard session lookup failed', sessionError);
    return NextResponse.json({ error: 'Hodinu se nepodařilo načíst.' }, { status: 500 });
  }
  if (!session) return NextResponse.json({ error: 'Hodina nebyla nalezena.' }, { status: 404 });

  const lesson = LessonSchema.safeParse(session.lesson_snapshot);
  if (!lesson.success) return NextResponse.json({ error: 'Snapshot lekce je neplatný.' }, { status: 500 });

  const [participantsResult, responsesResult, evaluationsResult] = await Promise.all([
    supabase
      .from('participants')
      .select('id, display_name, team_id, joined_at')
      .eq('session_id', sessionId)
      .order('joined_at', { ascending: true }),
    supabase
      .from('responses')
      .select('participant_id, block_id, answer')
      .eq('session_id', sessionId),
    supabase
      .from('response_evaluations')
      .select('participant_id, team_id, block_id, status, ai_score, teacher_score, teacher_confirmed')
      .eq('session_id', sessionId),
  ]);

  if (participantsResult.error || responsesResult.error || evaluationsResult.error) {
    console.error('scoreboard data load failed', {
      participants: participantsResult.error,
      responses: responsesResult.error,
      evaluations: evaluationsResult.error,
    });
    return NextResponse.json({ error: 'Průběžné skóre se nepodařilo načíst.' }, { status: 500 });
  }

  const participants = participantsResult.data ?? [];
  const responses = responsesResult.data ?? [];
  const evaluations = (evaluationsResult.data ?? []) as EvaluationRow[];

  const responseByParticipantBlock = new Map<string, unknown>();
  const activeResponseBlocks = new Set<string>();
  for (const response of responses) {
    responseByParticipantBlock.set(`${response.participant_id}:${response.block_id}`, response.answer);
    activeResponseBlocks.add(response.block_id);
  }

  const evaluationByParticipantBlock = new Map<string, EvaluationRow>();
  const evaluationByTeamBlock = new Map<string, EvaluationRow>();
  const activeEvaluationBlocks = new Set<string>();
  for (const evaluation of evaluations) {
    activeEvaluationBlocks.add(evaluation.block_id);
    if (evaluation.participant_id) {
      evaluationByParticipantBlock.set(`${evaluation.participant_id}:${evaluation.block_id}`, evaluation);
    }
    if (evaluation.team_id) {
      evaluationByTeamBlock.set(`${evaluation.team_id}:${evaluation.block_id}`, evaluation);
    }
  }

  const activeIndex = session.status === 'ended'
    ? lesson.data.blocks.length - 1
    : lesson.data.blocks.findIndex((block) => block.id === session.active_block_id);

  const scoredBlocks = lesson.data.blocks
    .map((block, index) => ({ block, index }))
    .filter(({ block }) => (
      (block.type === 'quiz' && Boolean(block.points && block.points > 0 && block.correctAnswer))
      || isAIGradedBlock(block)
    ))
    .filter(({ block, index }) => (
      session.status === 'ended'
      || index <= activeIndex
      || activeResponseBlocks.has(block.id)
      || activeEvaluationBlocks.has(block.id)
    ));

  const availableMaxPoints = scoredBlocks.reduce((sum, { block }) => sum + (block.points ?? 0), 0);

  const rows = participants.map((participant) => {
    let score = 0;
    let provisionalCount = 0;
    let pendingCount = 0;
    let failedCount = 0;
    const breakdown: BreakdownItem[] = [];

    for (const { block } of scoredBlocks) {
      const maxPoints = block.points ?? 0;

      if (block.type === 'quiz') {
        const raw = responseByParticipantBlock.get(`${participant.id}:${block.id}`);
        const parsed = StudentAnswerSchema.safeParse(raw);
        const choice = parsed.success && 'choice' in parsed.data ? parsed.data.choice : null;
        const points = choice !== null && choice === block.correctAnswer ? maxPoints : 0;
        score += points;
        breakdown.push({
          blockId: block.id,
          blockTitle: block.title,
          blockType: block.type,
          points,
          maxPoints,
          source: choice !== null ? 'quiz' : 'missing',
        });
        continue;
      }

      const evaluation = block.type === 'team_task'
        ? (participant.team_id ? evaluationByTeamBlock.get(`${participant.team_id}:${block.id}`) : undefined)
        : evaluationByParticipantBlock.get(`${participant.id}:${block.id}`);

      if (!evaluation) {
        breakdown.push({ blockId: block.id, blockTitle: block.title, blockType: block.type, points: null, maxPoints, source: 'missing' });
        continue;
      }

      if (evaluation.status === 'pending' || evaluation.status === 'grading') {
        pendingCount += 1;
        breakdown.push({ blockId: block.id, blockTitle: block.title, blockType: block.type, points: null, maxPoints, source: 'pending' });
        continue;
      }

      if (evaluation.status === 'failed') {
        failedCount += 1;
        breakdown.push({ blockId: block.id, blockTitle: block.title, blockType: block.type, points: null, maxPoints, source: 'failed' });
        continue;
      }

      const effectiveScore = evaluation.teacher_score ?? evaluation.ai_score;
      if (typeof effectiveScore !== 'number') {
        breakdown.push({ blockId: block.id, blockTitle: block.title, blockType: block.type, points: null, maxPoints, source: 'pending' });
        pendingCount += 1;
        continue;
      }

      score += effectiveScore;
      if (evaluation.teacher_score !== null) {
        breakdown.push({ blockId: block.id, blockTitle: block.title, blockType: block.type, points: effectiveScore, maxPoints, source: 'teacher' });
      } else {
        if (!evaluation.teacher_confirmed) provisionalCount += 1;
        breakdown.push({ blockId: block.id, blockTitle: block.title, blockType: block.type, points: effectiveScore, maxPoints, source: 'ai' });
      }
    }

    return {
      participantId: participant.id,
      displayName: participant.display_name,
      score,
      maxPoints: availableMaxPoints,
      provisionalCount,
      pendingCount,
      failedCount,
      breakdown,
    };
  });

  rows.sort((a, b) => b.score - a.score || a.pendingCount - b.pendingCount || a.displayName.localeCompare(b.displayName, 'cs'));

  let previousScore: number | null = null;
  let previousRank = 0;
  const rankedRows = rows.map((row, index) => {
    const rank = previousScore !== null && row.score === previousScore ? previousRank : index + 1;
    previousScore = row.score;
    previousRank = rank;
    return { ...row, rank };
  });

  const pendingEvaluations = evaluations.filter((item) => item.status === 'pending' || item.status === 'grading').length;
  const unconfirmedEvaluations = evaluations.filter((item) => (
    !item.teacher_confirmed && (item.status === 'graded' || item.status === 'needs_review') && item.ai_score !== null
  )).length;
  const failedEvaluations = evaluations.filter((item) => item.status === 'failed').length;

  return NextResponse.json({
    status: session.status,
    hasScoring: lesson.data.blocks.some((block) => (
      (block.type === 'quiz' && Boolean(block.points && block.points > 0 && block.correctAnswer))
      || isAIGradedBlock(block)
    )),
    availableMaxPoints,
    scoredBlockCount: scoredBlocks.length,
    pendingEvaluations,
    unconfirmedEvaluations,
    failedEvaluations,
    rows: rankedRows,
  });
}
