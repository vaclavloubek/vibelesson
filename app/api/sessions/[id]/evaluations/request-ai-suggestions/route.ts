import { NextResponse } from 'next/server';
import { getAuthenticatedUserId } from '@/lib/auth';
import { isAiGradingTopupsEnabled } from '@/lib/ai-grading-topups';
import { scheduleNeonGradingDrain } from '@/lib/neon/grading-outbox-worker';
import { createPrivilegedRpcClient } from '@/lib/neon/privileged-rpc';
import { currentTrustedDeviceHash, requireTrustedDeviceForPaidAccess, trustedDeviceErrorMessage } from '@/lib/trusted-device-access';

type RouteContext = { params: Promise<{ id: string }> };

// After a top-up (or an allowance reset) the teacher asks AI for suggestions on
// responses that fell back to manual grading because the allowance ran out.
// Responses beyond the remaining allowance return to manual grading.
export async function POST(_req: Request, { params }: RouteContext) {
  if (!isAiGradingTopupsEnabled()) return new NextResponse(null, { status: 404 });

  const { userId } = await getAuthenticatedUserId();
  if (!userId) return NextResponse.json({ error: 'Nejdřív se přihlas.' }, { status: 401 });

  const deviceGate = await requireTrustedDeviceForPaidAccess(userId);
  if (!deviceGate.allowed) {
    return NextResponse.json({ error: trustedDeviceErrorMessage(deviceGate), code: deviceGate.code }, { status: 403 });
  }

  const { id: sessionId } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(sessionId)) return NextResponse.json({ error: 'Hodina nebyla nalezena.' }, { status: 404 });

  const { data, error } = await createPrivilegedRpcClient().rpc('request_ai_suggestions_for_manual_evaluations_server', {
    p_user_id: userId,
    p_session_id: sessionId,
    p_device_token_hash: await currentTrustedDeviceHash(),
  });

  if (error?.message?.includes('trusted_device_required')) {
    return NextResponse.json({ error: trustedDeviceErrorMessage(deviceGate), code: 'trusted_device_required' }, { status: 403 });
  }
  if (error) {
    console.error('request AI suggestions failed', { code: error.code });
    return NextResponse.json({ error: 'Návrhy od AI se nepodařilo vyžádat.' }, { status: 500 });
  }

  const requeued = typeof data === 'number' ? data : Number(data ?? 0);
  if (requeued > 0) scheduleNeonGradingDrain();
  return NextResponse.json({ requeued }, { headers: { 'Cache-Control': 'no-store' } });
}
