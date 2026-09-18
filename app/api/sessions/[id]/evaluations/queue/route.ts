import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getAuthenticatedUserId } from '@/lib/auth';
import { GradingCriterionSchema, LessonSchema } from '@/lib/schema';

type RouteContext = { params: Promise<{ id: string }> };

const EvaluationStatusSchema = z.enum(['pending', 'grading', 'graded', 'needs_review', 'failed']);
const CriterionScoreSchema = z.object({
  criterionId: z.string().min(1),
  points: z.number().int().min(0).max(20),
  rationale: z.string().max(500),
});

const EvaluationRowSchema = z.object({
  id: z.string().uuid(),
  block_id: z.string().min(1).max(200),
  participant_id: z.string().uuid().nullable(),
  team_id: z.string().uuid().nullable(),
  response_id: z.string().uuid().nullable(),
  team_response_id: z.string().uuid().nullable(),
  status: EvaluationStatusSchema,
  max_points: z.number().int().min(1).max(20),
  ai_score: z.number().int().min(0).max(20).nullable(),
  teacher_score: z.number().int().min(0).max(20).nullable(),
  rationale: z.string().max(2000).nullable(),
  confidence: z.number().min(0).max(1).nullable(),
  rubric: z.array(GradingCriterionSchema).min(1).max(6),
  criterion_scores: z.array(CriterionScoreSchema).max(6),
  teacher_confirmed: z.boolean(),
  teacher_reviewed_at: z.string().nullable(),
  teacher_note: z.string().max(1000).nullable(),
  answer_snapshot: z.unknown(),
  evaluated_at: z.string().nullable(),
  grader_version: z.string(),
  created_at: z.string(),
});

function answerText(snapshot: unknown) {
  if (!snapshot || typeof snapshot !== 'object') return '';
  const value = (snapshot as Record<string, unknown>).text;
  return typeof value === 'string' ? value : '';
}

function sameSnapshot(left: unknown, right: unknown) {
  return JSON.stringify(left ?? null) === JSON.stringify(right ?? null);
}

type SubmittedRow = {
  submitted_answer: unknown;
  submitted_at: string | null;
};

export async function GET(_req: Request, { params }: RouteContext) {
  const { supabase, userId } = await getAuthenticatedUserId();
  if (!userId) return NextResponse.json({ error: 'Nejdřív se přihlas.' }, { status: 401 });

  const { id: sessionId } = await params;
  const { data: session, error: sessionError } = await supabase
    .from('sessions')
    .select('lesson_snapshot, active_block_id')
    .eq('id', sessionId)
    .eq('teacher_id', userId)
    .maybeSingle();

  if (sessionError) {
    console.error('evaluation queue session lookup failed', sessionError);
    return NextResponse.json({ error: 'Hodinu se nepodařilo načíst.' }, { status: 500 });
  }
  if (!session) return NextResponse.json({ error: 'Hodina nebyla nalezena.' }, { status: 404 });

  const lesson = LessonSchema.safeParse(session.lesson_snapshot);
  if (!lesson.success) return NextResponse.json({ error: 'Snapshot lekce je neplatný.' }, { status: 500 });

  const [evaluationsResult, participantsResult, teamsResult, responsesResult, teamResponsesResult] = await Promise.all([
    supabase
      .from('response_evaluations')
      .select('id, block_id, participant_id, team_id, response_id, team_response_id, status, max_points, ai_score, teacher_score, rationale, confidence, rubric, criterion_scores, teacher_confirmed, teacher_reviewed_at, teacher_note, answer_snapshot, evaluated_at, grader_version, created_at')
      .eq('session_id', sessionId)
      .order('created_at', { ascending: true }),
    supabase.from('participants').select('id, display_name').eq('session_id', sessionId),
    supabase.from('teams').select('id, name').eq('session_id', sessionId),
    supabase.from('responses').select('id, submitted_answer, submitted_at').eq('session_id', sessionId),
    supabase.from('team_responses').select('id, submitted_answer, submitted_at').eq('session_id', sessionId),
  ]);

  if (evaluationsResult.error || participantsResult.error || teamsResult.error || responsesResult.error || teamResponsesResult.error) {
    console.error('evaluation queue load failed', {
      evaluations: evaluationsResult.error,
      participants: participantsResult.error,
      teams: teamsResult.error,
      responses: responsesResult.error,
      teamResponses: teamResponsesResult.error,
    });
    return NextResponse.json({ error: 'Hodnocení se nepodařilo načíst.' }, { status: 500 });
  }

  const participantNames = new Map((participantsResult.data ?? []).map((item) => [item.id, item.display_name]));
  const teamNames = new Map((teamsResult.data ?? []).map((item) => [item.id, item.name]));
  const responseSubmissions = new Map((responsesResult.data ?? []).map((item) => [item.id, {
    submitted_answer: item.submitted_answer,
    submitted_at: item.submitted_at,
  } satisfies SubmittedRow]));
  const teamResponseSubmissions = new Map((teamResponsesResult.data ?? []).map((item) => [item.id, {
    submitted_answer: item.submitted_answer,
    submitted_at: item.submitted_at,
  } satisfies SubmittedRow]));
  const blockMap = new Map(lesson.data.blocks.map((block, index) => [block.id, { block, index }]));

  const evaluations = [];
  for (const row of evaluationsResult.data ?? []) {
    const parsed = EvaluationRowSchema.safeParse(row);
    if (!parsed.success) {
      console.error('invalid evaluation queue row', { evaluationId: row.id, issues: parsed.error.issues });
      continue;
    }

    const blockEntry = blockMap.get(parsed.data.block_id);
    if (!blockEntry) continue;

    const latestSubmission = parsed.data.response_id
      ? responseSubmissions.get(parsed.data.response_id)
      : parsed.data.team_response_id
        ? teamResponseSubmissions.get(parsed.data.team_response_id)
        : undefined;
    const hasNewerSubmission = Boolean(
      latestSubmission?.submitted_at
      && !sameSnapshot(parsed.data.answer_snapshot, latestSubmission.submitted_answer),
    );

    evaluations.push({
      id: parsed.data.id,
      blockId: parsed.data.block_id,
      blockTitle: blockEntry.block.title,
      blockType: blockEntry.block.type,
      blockIndex: blockEntry.index,
      respondentName: parsed.data.participant_id
        ? participantNames.get(parsed.data.participant_id) ?? 'Student'
        : parsed.data.team_id
          ? teamNames.get(parsed.data.team_id) ?? 'Tým'
          : 'Odpověď',
      answerText: answerText(parsed.data.answer_snapshot),
      hasNewerSubmission,
      latestAnswerText: hasNewerSubmission ? answerText(latestSubmission?.submitted_answer) : null,
      latestSubmittedAt: hasNewerSubmission ? latestSubmission?.submitted_at ?? null : null,
      status: parsed.data.status,
      maxPoints: parsed.data.max_points,
      aiScore: parsed.data.ai_score,
      teacherScore: parsed.data.teacher_score,
      rationale: parsed.data.rationale,
      confidence: parsed.data.confidence,
      rubric: parsed.data.rubric,
      criterionScores: parsed.data.criterion_scores,
      teacherConfirmed: parsed.data.teacher_confirmed,
      teacherReviewedAt: parsed.data.teacher_reviewed_at,
      teacherNote: parsed.data.teacher_note,
      evaluatedAt: parsed.data.evaluated_at,
      createdAt: parsed.data.created_at,
      manualOnly: parsed.data.grader_version.startsWith('manual-'),
    });
  }

  return NextResponse.json({ evaluations, activeBlockId: session.active_block_id as string | null });
}
