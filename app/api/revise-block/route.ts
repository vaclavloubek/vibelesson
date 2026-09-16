import { NextResponse } from 'next/server';
import { z } from 'zod';
import { LessonBlockSchema } from '@/lib/schema';
import { reviseBlock } from '@/lib/ai';
import { getAuthenticatedUserId } from '@/lib/auth';

export const maxDuration = 60;

const InputSchema = z.object({
  instruction: z.string().min(2).max(2000),
  block: LessonBlockSchema,
  lessonContext: z.object({
    title: z.string(),
    audience: z.string(),
    groupSize: z.string(),
    learningObjectives: z.array(z.string()),
  }),
});

export async function POST(req: Request) {
  const { supabase, userId } = await getAuthenticatedUserId();
  if (!userId) {
    return NextResponse.json({ error: 'Pro AI úpravy se nejdřív přihlas.' }, { status: 401 });
  }

  let requestId: string | null = null;

  try {
    const { instruction, block, lessonContext } = InputSchema.parse(await req.json());

    const { data: quotaData, error: quotaError } = await supabase.rpc('reserve_revision_operation', { p_action: 'revise_block' });
    if (quotaError) {
      console.error('reserve block revision quota failed', quotaError);
      return NextResponse.json({ error: 'Nepodařilo se ověřit měsíční limit AI úprav.' }, { status: 500 });
    }

    const quota = Array.isArray(quotaData) ? quotaData[0] : quotaData;
    if (!quota?.allowed) {
      return NextResponse.json({
        error: `Vyčerpal jsi měsíční limit ${quota?.monthly_limit ?? 20} AI úprav. Limit se obnoví na začátku příštího měsíce.`,
      }, { status: 429 });
    }

    requestId = typeof quota.request_id === 'string' ? quota.request_id : null;
    const { block: revised, costUsd } = await reviseBlock(block, instruction, lessonContext);

    if (requestId) {
      const { error: finishError } = await supabase.rpc('finish_generation_request', {
        p_request_id: requestId,
        p_status: 'succeeded',
        p_cost_usd: costUsd,
        p_lesson_id: null,
      });
      if (finishError) console.error('finish block revision request failed', finishError);
    }

    return NextResponse.json(revised);
  } catch (error) {
    if (requestId) {
      const { error: finishError } = await supabase.rpc('finish_generation_request', {
        p_request_id: requestId,
        p_status: 'failed',
        p_cost_usd: null,
        p_lesson_id: null,
      });
      if (finishError) console.error('fail block revision request cleanup failed', finishError);
    }

    console.error('revise block failed', error);
    return NextResponse.json({ error: 'Úprava aktivity se nepodařila.' }, { status: 500 });
  }
}
