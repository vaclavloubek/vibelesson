import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getAuthenticatedUserId } from '@/lib/auth';

type RouteContext = { params: Promise<{ id: string; evaluationId: string }> };

const ReviewBodySchema = z.object({
  score: z.number().int().min(0).max(20),
  note: z.string().trim().max(1000).optional().default(''),
});

const ReviewResultSchema = z.object({
  id: z.string().uuid(),
  teacher_score: z.number().int().min(0).max(20),
  teacher_confirmed: z.boolean(),
  teacher_reviewed_at: z.string(),
  teacher_note: z.string().nullable(),
});

export async function POST(req: Request, { params }: RouteContext) {
  const { supabase, userId } = await getAuthenticatedUserId();
  if (!userId) return NextResponse.json({ error: 'Nejdřív se přihlas.' }, { status: 401 });

  const { id: sessionId, evaluationId } = await params;

  try {
    const body = ReviewBodySchema.parse(await req.json());

    const { data: evaluation, error: lookupError } = await supabase
      .from('response_evaluations')
      .select('id, session_id, status, max_points, ai_score')
      .eq('id', evaluationId)
      .eq('session_id', sessionId)
      .maybeSingle();

    if (lookupError) {
      console.error('teacher evaluation review lookup failed', lookupError);
      return NextResponse.json({ error: 'Hodnocení se nepodařilo načíst.' }, { status: 500 });
    }
    if (!evaluation) return NextResponse.json({ error: 'Hodnocení nebylo nalezeno.' }, { status: 404 });
    if (!['graded', 'needs_review'].includes(evaluation.status as string) || evaluation.ai_score === null) {
      return NextResponse.json({ error: 'AI hodnocení ještě není připravené ke kontrole.' }, { status: 409 });
    }
    if (body.score > (evaluation.max_points as number)) {
      return NextResponse.json({ error: `Skóre musí být mezi 0 a ${evaluation.max_points}.` }, { status: 400 });
    }

    const { data: reviewedRaw, error: reviewError } = await supabase.rpc('review_response_evaluation', {
      p_evaluation_id: evaluationId,
      p_teacher_score: body.score,
      p_teacher_note: body.note || null,
    });

    if (reviewError) {
      console.error('teacher evaluation review failed', reviewError);
      return NextResponse.json({ error: 'Hodnocení se nepodařilo uložit.' }, { status: 500 });
    }
    if (!reviewedRaw) return NextResponse.json({ error: 'Hodnocení nebylo nalezeno.' }, { status: 404 });

    const reviewed = ReviewResultSchema.safeParse(reviewedRaw);
    if (!reviewed.success) {
      console.error('invalid teacher evaluation review result', reviewed.error.issues);
      return NextResponse.json({ error: 'Hodnocení se uložilo v neplatném stavu.' }, { status: 500 });
    }

    return NextResponse.json({
      evaluationId: reviewed.data.id,
      teacherScore: reviewed.data.teacher_score,
      teacherConfirmed: reviewed.data.teacher_confirmed,
      teacherReviewedAt: reviewed.data.teacher_reviewed_at,
      teacherNote: reviewed.data.teacher_note,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: 'Zkontroluj zadané body a poznámku.' }, { status: 400 });
    }
    console.error('teacher evaluation review request failed', error);
    return NextResponse.json({ error: 'Hodnocení se nepodařilo uložit.' }, { status: 500 });
  }
}
