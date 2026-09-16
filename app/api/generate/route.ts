import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createLesson } from '@/lib/ai';
import { getAuthenticatedUserId } from '@/lib/auth';

export const maxDuration = 60;

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

    const lesson = await createLesson(input);

    const { error: finishError } = await supabase.rpc('finish_generation_request', {
      p_request_id: requestId,
      p_status: 'succeeded',
      p_cost_usd: null,
      p_lesson_id: null,
    });
    if (finishError) console.error('finish generation request failed', finishError);

    return NextResponse.json(lesson);
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

    console.error('generate lesson failed', error);
    return NextResponse.json({ error: 'Lekci se nepodařilo vygenerovat. Zkus to prosím znovu.' }, { status: 500 });
  }
}
