import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { gradeResponseWithAI } from '@/lib/grading';
import { GradingCriterionSchema, LessonSchema } from '@/lib/schema';

export const maxDuration = 60;

const RequestSchema = z.object({
  token: z.string().regex(/^[0-9a-f]{64}$/i),
});

const ClaimedJobSchema = z.object({
  id: z.string().uuid(),
  session_id: z.string().uuid(),
  block_id: z.string().min(1),
  answer_snapshot: z.unknown(),
  rubric: z.unknown(),
  max_points: z.number().int().min(1).max(20),
  grader_version: z.string(),
  lesson_snapshot: z.unknown(),
});

const TextAnswerSchema = z.object({
  text: z.string().trim().min(1).max(4000),
});

function createWorkerClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !publishableKey) throw new Error('Supabase worker environment is incomplete.');

  return createClient(url, publishableKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });
}

function safeErrorMessage(error: unknown) {
  if (error instanceof Error && error.message) return error.message.slice(0, 900);
  return 'AI grading failed';
}

export async function POST(req: Request) {
  let token: string;
  try {
    token = RequestSchema.parse(await req.json()).token.toLowerCase();
  } catch {
    // Deliberately do not reveal whether a capability was malformed or unknown.
    return new NextResponse(null, { status: 202 });
  }

  const supabase = createWorkerClient();
  const { data: claimedRaw, error: claimError } = await supabase.rpc('claim_grading_job', {
    p_token: token,
  });

  if (claimError) {
    console.error('server grading job claim failed', { code: claimError.code });
    return NextResponse.json({ error: 'Grading worker is temporarily unavailable.' }, { status: 503 });
  }

  if (!claimedRaw) return new NextResponse(null, { status: 202 });

  const claimed = ClaimedJobSchema.safeParse(claimedRaw);
  if (!claimed.success) {
    console.error('server grading job claim returned invalid payload');
    await supabase.rpc('fail_grading_job', {
      p_token: token,
      p_error: 'Invalid grading job claim payload',
    });
    return NextResponse.json({ error: 'Grading worker received invalid state.' }, { status: 500 });
  }

  const evaluationId = claimed.data.id;

  try {
    const lesson = LessonSchema.parse(claimed.data.lesson_snapshot);
    const block = lesson.blocks.find((item) => item.id === claimed.data.block_id);
    if (!block) throw new Error('Evaluation block is missing from the lesson snapshot.');
    if (!['open_text', 'exit_ticket', 'team_task'].includes(block.type)) {
      throw new Error('This block type is not eligible for AI grading.');
    }

    const answer = TextAnswerSchema.parse(claimed.data.answer_snapshot);
    const rubric = z.array(GradingCriterionSchema).min(1).max(6).parse(claimed.data.rubric);
    const rubricPoints = rubric.reduce((sum, criterion) => sum + criterion.maxPoints, 0);

    if (!block.points || block.points !== claimed.data.max_points || rubricPoints !== claimed.data.max_points) {
      throw new Error('Evaluation rubric does not match the lesson snapshot.');
    }

    const result = await gradeResponseWithAI({
      blockTitle: block.title,
      instructions: block.instructions,
      audience: lesson.audience,
      answerText: answer.text,
      rubric,
      maxPoints: claimed.data.max_points,
      strictness: lesson.gradingStrictness ?? 'neutral',
    });

    const { data: finished, error: finishError } = await supabase.rpc('finish_grading_job_v2', {
      p_token: token,
      p_ai_score: result.score,
      p_rationale: result.rationale,
      p_confidence: result.confidence,
      p_criterion_scores: result.criterionScores,
      p_ai_use_suspicion: result.aiUseSuspicion,
      p_ai_use_signals: result.aiUseSignals,
      p_model: result.model,
      p_cost_usd: result.costUsd,
    });

    if (finishError) throw finishError;
    if (!finished) {
      console.warn('server grading job lost its claim before completion', { evaluationId });
      return new NextResponse(null, { status: 202 });
    }

    console.info('server grading job completed', {
      evaluationId,
      status: result.needsReview ? 'needs_review' : 'graded',
      aiUseSuspicion: result.aiUseSuspicion,
    });
    return NextResponse.json({
      ok: true,
      evaluationId,
      status: result.needsReview ? 'needs_review' : 'graded',
    });
  } catch (error) {
    console.error('server grading job failed', {
      evaluationId,
      error: error instanceof Error ? error.name : 'unknown',
    });
    await supabase.rpc('fail_grading_job', {
      p_token: token,
      p_error: safeErrorMessage(error),
    });
    return NextResponse.json({ error: 'AI grading job failed.' }, { status: 502 });
  }
}
