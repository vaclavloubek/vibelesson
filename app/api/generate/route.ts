import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createLesson, type LessonGenerationStage } from '@/lib/ai';
import { getAuthenticatedUserId } from '@/lib/auth';

// Longer lessons can legitimately take more than one minute to generate.
// Keep this below the stale-reservation cleanup window in the quota RPCs.
export const maxDuration = 300;

const InputSchema = z.object({
  prompt: z.string().min(5).max(5000),
  audience: z.string().min(1).max(200),
  duration: z.number().int().min(10).max(360),
  groupSize: z.string().min(1).max(100),
  tone: z.string().min(1).max(200),
});

type ReservationRow = {
  request_id: string | null;
  allowed: boolean;
  used: number;
  monthly_limit: number | null;
};

type ProgressEvent =
  | { type: 'progress'; stage: LessonGenerationStage | 'saving' }
  | { type: 'result'; lesson: unknown; lessonId: string }
  | { type: 'error'; error: string };

export async function POST(req: Request) {
  const { supabase, userId } = await getAuthenticatedUserId();
  if (!userId) {
    return NextResponse.json({ error: 'Pro AI generování se nejdřív přihlas.' }, { status: 401 });
  }

  let requestId: string | null = null;

  try {
    const input = InputSchema.parse(await req.json());

    const { data, error: reserveError } = await supabase.rpc('reserve_lesson_generation');
    if (reserveError) throw reserveError;

    const reservation = (Array.isArray(data) ? data[0] : data) as ReservationRow | null;
    if (!reservation) throw new Error('Quota reservation returned no data.');

    if (!reservation.allowed) {
      return NextResponse.json({
        error: `Měsíční limit ${reservation.monthly_limit ?? 5} lekcí je vyčerpaný. Další lekci můžeš vytvořit příští měsíc.`,
        quota: {
          used: reservation.used,
          monthlyLimit: reservation.monthly_limit,
          remaining: 0,
        },
      }, { status: 429 });
    }

    requestId = reservation.request_id;
    if (!requestId) throw new Error('Quota reservation is missing request id.');

    const encoder = new TextEncoder();
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        let streamClosed = false;

        const send = (event: ProgressEvent) => {
          if (streamClosed) return;
          try {
            controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`));
          } catch {
            streamClosed = true;
          }
        };

        const close = () => {
          if (streamClosed) return;
          streamClosed = true;
          try {
            controller.close();
          } catch {
            // The client may have disconnected while generation continued.
          }
        };

        void (async () => {
          let costUsd: number | null = null;
          try {
            const generated = await createLesson(input, (stage) => send({ type: 'progress', stage }));
            const lesson = generated.lesson;
            costUsd = generated.costUsd;

            send({ type: 'progress', stage: 'saving' });
            const { data: savedLesson, error: saveError } = await supabase
              .from('lessons')
              .insert({
                owner_id: userId,
                title: lesson.title,
                source_prompt: input.prompt,
                lesson,
              })
              .select('id')
              .single();

            if (saveError || !savedLesson?.id) {
              throw saveError ?? new Error('Generated lesson was not persisted.');
            }

            const lessonId = savedLesson.id as string;
            const { error: finishError } = await supabase.rpc('finish_generation_request', {
              p_request_id: requestId,
              p_status: 'succeeded',
              p_cost_usd: costUsd,
              p_lesson_id: lessonId,
            });
            if (finishError) console.error('finish generation request failed', finishError);

            send({ type: 'result', lesson, lessonId });
          } catch (error) {
            const { error: finishError } = await supabase.rpc('finish_generation_request', {
              p_request_id: requestId,
              p_status: 'failed',
              p_cost_usd: costUsd,
              p_lesson_id: null,
            });
            if (finishError) console.error('mark generation request failed', finishError);

            console.error('generate lesson failed', error);
            send({ type: 'error', error: 'Lekci se nepodařilo vygenerovat a bezpečně uložit. Zkus to prosím znovu.' });
          } finally {
            close();
          }
        })();
      },
    });

    return new Response(stream, {
      headers: {
        'Content-Type': 'application/x-ndjson; charset=utf-8',
        'Cache-Control': 'no-cache, no-transform',
      },
    });
  } catch (error) {
    if (requestId) {
      const { error: finishError } = await supabase.rpc('finish_generation_request', {
        p_request_id: requestId,
        p_status: 'failed',
        p_cost_usd: null,
        p_lesson_id: null,
      });
      if (finishError) console.error('mark generation request failed', finishError);
    }

    console.error('prepare lesson generation failed', error);
    return NextResponse.json({ error: 'Generování se nepodařilo spustit. Zkus to prosím znovu.' }, { status: 500 });
  }
}
