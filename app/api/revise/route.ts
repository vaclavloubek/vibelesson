import { NextResponse } from 'next/server';
import { z } from 'zod';
import { LessonSchema } from '@/lib/schema';
import { reviseLesson } from '@/lib/ai';
import { getAuthenticatedUserId } from '@/lib/auth';

export const maxDuration = 60;

const InputSchema = z.object({
  instruction: z.string().min(2).max(3000),
  lesson: LessonSchema,
  lessonId: z.string().uuid().nullable().optional(),
});

export async function POST(req: Request) {
  const { supabase, userId } = await getAuthenticatedUserId();
  if (!userId) {
    return NextResponse.json({ error: 'Pro AI úpravy se nejdřív přihlas.' }, { status: 401 });
  }

  let requestId: string | null = null;
  let costUsd: number | null = null;

  try {
    const { instruction, lesson, lessonId = null } = InputSchema.parse(await req.json());

    const { data: quotaData, error: quotaError } = await supabase.rpc('reserve_revision_operation', { p_action: 'revise_lesson' });
    if (quotaError) {
      console.error('reserve revision quota failed', quotaError);
      return NextResponse.json({ error: 'Nepodařilo se ověřit měsíční limit AI úprav.' }, { status: 500 });
    }

    const quota = Array.isArray(quotaData) ? quotaData[0] : quotaData;
    if (!quota?.allowed) {
      return NextResponse.json({
        error: `Vyčerpal jsi měsíční limit ${quota?.monthly_limit ?? 20} AI úprav. Limit se obnoví na začátku příštího měsíce.`,
      }, { status: 429 });
    }

    requestId = typeof quota.request_id === 'string' ? quota.request_id : null;
    const revisedResult = await reviseLesson(lesson, instruction);
    const revised = revisedResult.lesson;
    costUsd = revisedResult.costUsd;

    if (lessonId) {
      const { data: savedLesson, error: saveError } = await supabase
        .from('lessons')
        .update({
          title: revised.title,
          lesson: revised,
          updated_at: new Date().toISOString(),
        })
        .eq('id', lessonId)
        .eq('owner_id', userId)
        .select('id')
        .single();

      if (saveError || !savedLesson?.id) {
        throw saveError ?? new Error('Revised lesson was not persisted.');
      }
    }

    if (requestId) {
      const { error: finishError } = await supabase.rpc('finish_generation_request', {
        p_request_id: requestId,
        p_status: 'succeeded',
        p_cost_usd: costUsd,
        p_lesson_id: lessonId,
      });
      if (finishError) console.error('finish revision request failed', finishError);
    }

    return NextResponse.json({ lesson: revised, lessonId });
  } catch (error) {
    if (requestId) {
      const { error: finishError } = await supabase.rpc('finish_generation_request', {
        p_request_id: requestId,
        p_status: 'failed',
        p_cost_usd: costUsd,
        p_lesson_id: null,
      });
      if (finishError) console.error('fail revision request cleanup failed', finishError);
    }

    console.error('revise lesson failed', error);
    return NextResponse.json({ error: 'Úprava lekce se nepodařila bezpečně dokončit. Zkus formulovat změnu jinak.' }, { status: 500 });
  }
}
