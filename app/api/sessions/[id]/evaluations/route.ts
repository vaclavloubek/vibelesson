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
  participant_id: z.string().uuid().nullable(),
  team_id: z.string().uuid().nullable(),
  status: EvaluationStatusSchema,
  max_points: z.number().int().min(1).max(20),
  ai_score: z.number().int().min(0).max(20).nullable(),
  teacher_score: z.number().int().min(0).max(20).nullable(),
  rationale: z.string().max(2000).nullable(),
  confidence: z.number().min(0).max(1).nullable(),
  rubric: z.array(GradingCriterionSchema).min(1).max(6),
  criterion_scores: z.array(CriterionScoreSchema).max(6),
  teacher_confirmed: z.boolean(),
  evaluated_at: z.string().nullable(),
});

export async function GET(req: Request, { params }: RouteContext) {
  const { supabase, userId } = await getAuthenticatedUserId();
  if (!userId) return NextResponse.json({ error: 'Nejdřív se přihlas.' }, { status: 401 });

  const { id: sessionId } = await params;
  const blockId = new URL(req.url).searchParams.get('blockId')?.trim() ?? '';
  if (!blockId || blockId.length > 200) {
    return NextResponse.json({ error: 'Chybí platný blok.' }, { status: 400 });
  }

  const { data: session, error: sessionError } = await supabase
    .from('sessions')
    .select('lesson_snapshot')
    .eq('id', sessionId)
    .eq('teacher_id', userId)
    .maybeSingle();

  if (sessionError) {
    console.error('evaluation view session lookup failed', sessionError);
    return NextResponse.json({ error: 'Hodinu se nepodařilo načíst.' }, { status: 500 });
  }
  if (!session) return NextResponse.json({ error: 'Hodina nebyla nalezena.' }, { status: 404 });

  const lesson = LessonSchema.safeParse(session.lesson_snapshot);
  if (!lesson.success) return NextResponse.json({ error: 'Snapshot lekce je neplatný.' }, { status: 500 });

  const block = lesson.data.blocks.find((item) => item.id === blockId);
  if (!block) return NextResponse.json({ error: 'Blok nebyl nalezen.' }, { status: 404 });
  if (!['open_text', 'exit_ticket', 'team_task'].includes(block.type)) {
    return NextResponse.json({ evaluations: [] });
  }

  const { data: rows, error } = await supabase
    .from('response_evaluations')
    .select('id, participant_id, team_id, status, max_points, ai_score, teacher_score, rationale, confidence, rubric, criterion_scores, teacher_confirmed, evaluated_at')
    .eq('session_id', sessionId)
    .eq('block_id', blockId)
    .order('created_at', { ascending: true });

  if (error) {
    console.error('response evaluations load failed', error);
    return NextResponse.json({ error: 'AI hodnocení se nepodařilo načíst.' }, { status: 500 });
  }

  const evaluations = [];
  for (const row of rows ?? []) {
    const parsed = EvaluationRowSchema.safeParse(row);
    if (!parsed.success) {
      console.error('invalid response evaluation row', { evaluationId: row.id, issues: parsed.error.issues });
      continue;
    }

    evaluations.push({
      id: parsed.data.id,
      participantId: parsed.data.participant_id,
      teamId: parsed.data.team_id,
      status: parsed.data.status,
      maxPoints: parsed.data.max_points,
      aiScore: parsed.data.ai_score,
      teacherScore: parsed.data.teacher_score,
      rationale: parsed.data.rationale,
      confidence: parsed.data.confidence,
      rubric: parsed.data.rubric,
      criterionScores: parsed.data.criterion_scores,
      teacherConfirmed: parsed.data.teacher_confirmed,
      evaluatedAt: parsed.data.evaluated_at,
    });
  }

  return NextResponse.json({ evaluations });
}
