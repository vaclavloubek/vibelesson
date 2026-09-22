import 'server-only';

import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { gradeResponseWithAI } from '@/lib/grading';
import { createNeonSql } from '@/lib/neon/server';
import { GradingCriterionSchema, LessonSchema } from '@/lib/schema';

const ClaimedJobSchema = z.object({
  id: z.string().uuid(),
  session_id: z.string().uuid(),
  block_id: z.string().min(1),
  answer_snapshot: z.unknown(),
  rubric: z.unknown(),
  max_points: z.number().int().min(1).max(20),
  grader_version: z.string(),
  lesson_snapshot: z.unknown(),
  worker_token: z.string().regex(/^[0-9a-f]{64}$/i),
});

const TextAnswerSchema = z.object({
  text: z.string().trim().min(1).max(4000),
});

function safeErrorMessage(error: unknown) {
  if (error instanceof Error && error.message) return error.message.slice(0, 900);
  return 'AI grading failed';
}

export function useNeonGradingOutboxWorker() {
  if (process.env.NEON_GRADING_OUTBOX_WORKER !== 'true') return false;
  if (process.env.VERCEL_ENV === 'production' && process.env.NEON_CUTOVER_APPROVED !== 'true') {
    throw new Error('Neon grading outbox worker is not approved for production.');
  }
  return true;
}

export async function processOneNeonGradingOutboxJob() {
  const sql = createNeonSql();
  const workerId = `vercel-${randomUUID()}`;
  const claimedRows = await sql`
    select private.claim_next_grading_outbox_job(${workerId}, 90) as job
  `;
  if (!claimedRows[0]?.job) return { processed: 0, status: 'idle' as const };

  const claimed = ClaimedJobSchema.safeParse(claimedRows[0].job);
  if (!claimed.success) {
    console.error('Neon grading outbox returned invalid payload');
    return { processed: 0, status: 'invalid' as const };
  }

  const job = claimed.data;
  try {
    const lesson = LessonSchema.parse(job.lesson_snapshot);
    const block = lesson.blocks.find((item) => item.id === job.block_id);
    if (!block) throw new Error('Evaluation block is missing from the lesson snapshot.');
    if (!['open_text', 'exit_ticket', 'team_task'].includes(block.type)) {
      throw new Error('This block type is not eligible for AI grading.');
    }

    const answer = TextAnswerSchema.parse(job.answer_snapshot);
    const rubric = z.array(GradingCriterionSchema).min(1).max(6).parse(job.rubric);
    const rubricPoints = rubric.reduce((sum, criterion) => sum + criterion.maxPoints, 0);
    if (!block.points || block.points !== job.max_points || rubricPoints !== job.max_points) {
      throw new Error('Evaluation rubric does not match the lesson snapshot.');
    }

    const result = await gradeResponseWithAI({
      blockTitle: block.title,
      instructions: block.instructions,
      audience: lesson.audience,
      answerText: answer.text,
      rubric,
      maxPoints: job.max_points,
      strictness: lesson.gradingStrictness ?? 'neutral',
    });

    const finishedRows = await sql`
      select public.finish_grading_job_v2(
        ${job.worker_token},
        ${result.score}::integer,
        ${result.rationale},
        ${result.confidence}::double precision,
        ${JSON.stringify(result.criterionScores)}::jsonb,
        ${result.aiUseSuspicion},
        ${JSON.stringify(result.aiUseSignals)}::jsonb,
        ${result.model},
        ${result.costUsd}::numeric
      ) as finished
    `;
    if (!finishedRows[0]?.finished) throw new Error('Grading job lost its claim before completion.');

    await sql`
      select private.complete_grading_outbox_job(${job.id}::uuid, ${workerId})
    `;
    console.info('Neon grading outbox job completed', {
      evaluationId: job.id,
      status: result.needsReview ? 'needs_review' : 'graded',
    });
    return { processed: 1, status: result.needsReview ? 'needs_review' as const : 'graded' as const };
  } catch (error) {
    const message = safeErrorMessage(error);
    console.error('Neon grading outbox job failed', { evaluationId: job.id, error: message });
    try {
      await sql`select public.fail_grading_job(${job.worker_token}, ${message})`;
      await sql`
        select private.fail_grading_outbox_job(${job.id}::uuid, ${workerId}, ${message})
      `;
    } catch (cleanupError) {
      console.error('Neon grading outbox cleanup failed', {
        evaluationId: job.id,
        error: safeErrorMessage(cleanupError),
      });
    }
    return { processed: 1, status: 'failed' as const };
  }
}
