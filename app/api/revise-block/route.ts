import { NextResponse } from 'next/server';
import { z } from 'zod';
import { LessonSchema } from '@/lib/schema';
import { reviseBlock } from '@/lib/ai';
import { getAuthenticatedUserId } from '@/lib/auth';

// Keep the same ceiling across AI endpoints; complex block edits can still be slow.
export const maxDuration = 300;

const InputSchema = z.object({
  instruction: z.string().min(2).max(2000),
  lesson: LessonSchema,
  lessonId: z.string().uuid().nullable().optional(),
  blockId: z.string().min(1),
});

export async function POST(req: Request) {
  const { supabase, userId } = await getAuthenticatedUserId();
  if (!userId) {
    return NextResponse.json({ error: 'Pro AI úpravy se nejdřív přihlas.' }, { status: 401 });
  }

  let requestId: string | null = null;
  let costUsd: number | null = null;

  try {
    const { instruction, lesson, lessonId = null, blockId } = InputSchema.parse(await req.json());
    const block = lesson.blocks.find((item) => item.id === blockId);
    if (!block) {
      return NextResponse.json({ error: 'Vybraná aktivita už v lekci není.' }, { status: 400 });
    }

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

    const revisedResult = await reviseBlock(block, instruction, {
      title: lesson.title,
      audience: lesson.audience,
      groupSize: lesson.groupSize,
      learningObjectives: lesson.learningObjectives,
    });
    const revisedBlock = revisedResult.block;
    costUsd = revisedResult.costUsd;

    const blocks = lesson.blocks.map((item) => item.id === revisedBlock.id ? revisedBlock : item);
    const revisedLesson = LessonSchema.parse({
      ...lesson,
      blocks,
      totalMinutes: blocks.reduce((sum, item) => sum + item.durationMinutes, 0),
    });

    if (lessonId) {
      const { data: savedLesson, error: saveError } = await supabase
        .from('lessons')
        .update({
          title: revisedLesson.title,
          lesson: revisedLesson,
          updated_at: new Date().toISOString(),
        })
        .eq('id', lessonId)
        .eq('owner_id', userId)
        .select('id')
        .single();

      if (saveError || !savedLesson?.id) {
        throw saveError ?? new Error('Revised lesson block was not persisted.');
      }
    }

    if (requestId) {
      const { error: finishError } = await supabase.rpc('finish_generation_request', {
        p_request_id: requestId,
        p_status: 'succeeded',
        p_cost_usd: costUsd,
        p_lesson_id: lessonId,
      });
      if (finishError) console.error('finish block revision request failed', finishError);
    }

    return NextResponse.json({ lesson: revisedLesson, lessonId });
  } catch (error) {
    if (requestId) {
      const { error: finishError } = await supabase.rpc('finish_generation_request', {
        p_request_id: requestId,
        p_status: 'failed',
        p_cost_usd: costUsd,
        p_lesson_id: null,
      });
      if (finishError) console.error('fail block revision request cleanup failed', finishError);
    }

    console.error('revise block failed', error);
    return NextResponse.json({ error: 'Úprava aktivity se nepodařila bezpečně dokončit.' }, { status: 500 });
  }
}
