import { NextResponse } from 'next/server';
import { getAuthenticatedUserId } from '@/lib/auth';

type RouteContext = { params: Promise<{ id: string; evaluationId: string }> };

export async function POST(_req: Request, { params }: RouteContext) {
  const { supabase, userId } = await getAuthenticatedUserId();
  if (!userId) return NextResponse.json({ error: 'Nejdřív se přihlas.' }, { status: 401 });

  const { id: sessionId, evaluationId } = await params;

  const { data: evaluation, error: evaluationError } = await supabase
    .from('response_evaluations')
    .select('id')
    .eq('id', evaluationId)
    .eq('session_id', sessionId)
    .maybeSingle();

  if (evaluationError) {
    console.error('regrade evaluation lookup failed', evaluationError);
    return NextResponse.json({ error: 'Hodnocení se nepodařilo načíst.' }, { status: 500 });
  }
  if (!evaluation) return NextResponse.json({ error: 'Hodnocení nebylo nalezeno.' }, { status: 404 });

  const { data: requeued, error } = await supabase.rpc('requeue_response_evaluation_for_teacher', {
    p_evaluation_id: evaluationId,
  });

  if (error) {
    console.error('teacher regrade queue failed', error);
    return NextResponse.json({ error: 'Nové AI hodnocení se nepodařilo zařadit.' }, { status: 500 });
  }

  if (!requeued) {
    return NextResponse.json({
      error: 'Novější odevzdaná verze není k dispozici nebo aktuální hodnocení ještě běží.',
    }, { status: 409 });
  }

  return NextResponse.json({ evaluationId, requeued: true });
}
