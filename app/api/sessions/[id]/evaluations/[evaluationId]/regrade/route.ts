import { NextResponse } from 'next/server';
import { getAuthenticatedUserId } from '@/lib/auth';

type RouteContext = { params: Promise<{ id: string; evaluationId: string }> };

export async function POST(_req: Request, { params }: RouteContext) {
  const { supabase, userId } = await getAuthenticatedUserId();
  if (!userId) return NextResponse.json({ error: 'Nejdřív se přihlas.' }, { status: 401 });

  const { id: sessionId, evaluationId } = await params;

  const [{ data: evaluation, error: evaluationError }, { data: profile, error: profileError }] = await Promise.all([
    supabase
      .from('response_evaluations')
      .select('id')
      .eq('id', evaluationId)
      .eq('session_id', sessionId)
      .maybeSingle(),
    supabase
      .from('profiles')
      .select('role, ai_grading_enabled')
      .eq('id', userId)
      .maybeSingle(),
  ]);

  if (evaluationError) {
    console.error('regrade evaluation lookup failed', evaluationError);
    return NextResponse.json({ error: 'Hodnocení se nepodařilo načíst.' }, { status: 500 });
  }
  if (profileError) {
    console.error('regrade entitlement lookup failed', profileError);
    return NextResponse.json({ error: 'Oprávnění pro hodnocení se nepodařilo ověřit.' }, { status: 500 });
  }
  if (!evaluation) return NextResponse.json({ error: 'Hodnocení nebylo nalezeno.' }, { status: 404 });

  const aiGradingEnabled = Boolean(profile && (profile.role === 'admin' || profile.ai_grading_enabled));

  const { data: requeued, error } = await supabase.rpc('requeue_response_evaluation_for_teacher', {
    p_evaluation_id: evaluationId,
  });

  if (error) {
    console.error('teacher evaluation refresh failed', error);
    return NextResponse.json({ error: 'Novější verzi se nepodařilo připravit k hodnocení.' }, { status: 500 });
  }

  if (!requeued) {
    return NextResponse.json({
      error: 'Novější odevzdaná verze není k dispozici nebo aktuální hodnocení ještě běží.',
    }, { status: 409 });
  }

  return NextResponse.json({
    evaluationId,
    requeued: true,
    gradingMode: aiGradingEnabled ? 'ai' : 'manual',
  });
}
