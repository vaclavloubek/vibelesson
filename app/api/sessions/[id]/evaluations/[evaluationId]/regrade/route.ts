import { NextResponse } from 'next/server';
import { getAuthenticatedUserId } from '@/lib/auth';
import { currentTrustedDeviceHash, requireTrustedDeviceForPaidIndividual, trustedDeviceErrorMessage } from '@/lib/trusted-device-access';
import { createAdminClient } from '@/lib/supabase/admin';
import { isIndividualAiBillingPaused } from '@/lib/individual-ai-billing';

type RouteContext = { params: Promise<{ id: string; evaluationId: string }> };

export async function POST(_req: Request, { params }: RouteContext) {
  const { supabase, userId } = await getAuthenticatedUserId();
  if (!userId) return NextResponse.json({ error: 'Nejdřív se přihlas.' }, { status: 401 });

  const deviceGate = await requireTrustedDeviceForPaidIndividual(userId);
  if (!deviceGate.allowed) {
    return NextResponse.json({ error: trustedDeviceErrorMessage(deviceGate.code), code: deviceGate.code }, { status: 403 });
  }

  let aiBillingPaused: boolean;
  try {
    aiBillingPaused = await isIndividualAiBillingPaused(userId);
  } catch {
    return NextResponse.json({ error: 'Stav platby se nepodařilo ověřit.' }, { status: 503 });
  }

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

  const admin = createAdminClient();
  const deviceHash = await currentTrustedDeviceHash();
  const { data: requeued, error } = await admin.rpc('requeue_response_evaluation_server', {
    p_user_id: userId,
    p_evaluation_id: evaluationId,
    p_device_token_hash: deviceHash,
  });

  if (error?.message?.includes('trusted_device_required')) {
    return NextResponse.json({
      error: trustedDeviceErrorMessage('trusted_device_required'),
      code: 'trusted_device_required',
    }, { status: 403 });
  }

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
    gradingMode: aiGradingEnabled && !aiBillingPaused ? 'ai' : 'manual',
    aiBillingPaused,
  });
}
