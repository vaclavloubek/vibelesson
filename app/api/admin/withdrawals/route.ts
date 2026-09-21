import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getAuthenticatedUserId } from '@/lib/auth';
import { isSuperadminUserId } from '@/lib/superadmin';
import { createAdminClient } from '@/lib/supabase/admin';
import { executeWithdrawal, getWithdrawalState, prepareWithdrawal } from '@/lib/individual-withdrawal';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
const Input = z.discriminatedUnion('action', [
  z.object({ action: z.literal('register'), userId: z.string().uuid(), snapshotId: z.string().uuid(),
    receivedAt: z.string().datetime({ offset: true }), noticeSha256: z.string().regex(/^[0-9a-f]{64}$/),
    consumerAndWithdrawalEligibilityConfirmed: z.literal(true) }),
  z.object({ action: z.literal('prepare'), id: z.string().uuid() }),
  z.object({ action: z.literal('execute'), id: z.string().uuid() }),
  z.object({ action: z.literal('status'), id: z.string().uuid() }),
]);
const json = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: { 'Cache-Control': 'no-store' } });
export async function POST(request: Request) {
  // Administrative monetary action uses the existing fixed superadmin identity.
  if (request.headers.get('origin') !== new URL(request.url).origin) return json({ error: 'same_origin_required' }, 403);
  const { userId } = await getAuthenticatedUserId();
  if (!userId) return json({ error: 'authentication_required' }, 401);
  if (!isSuperadminUserId(userId)) return json({ error: 'superadmin_required' }, 403);
  const parsed = Input.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return json({ error: 'invalid_withdrawal_request' }, 400);
  const input = parsed.data;
  try {
    if (input.action === 'register') {
      const { data, error } = await createAdminClient().rpc('register_individual_withdrawal_for_service', {
        p_user_id: input.userId,p_snapshot_id: input.snapshotId,p_received_at: input.receivedAt,
        p_notice_sha256: input.noticeSha256,p_actor_user_id: userId,
      });
      if (error) return json({ error: 'withdrawal_receipt_not_registered' }, 409);
      return json({ id: data });
    }
    if (input.action === 'status') return json(await getWithdrawalState(input.id));
    const key = process.env.STRIPE_SECRET_KEY_LIVE;
    if (!key) return json({ error: 'live_billing_not_configured' }, 503);
    return json(input.action === 'prepare' ? await prepareWithdrawal(input.id, key) : await executeWithdrawal(input.id, key));
  } catch (error) {
    const message = error instanceof Error && /^withdrawal_[a-z_]+$/.test(error.message)
      ? error.message : 'withdrawal_review_required';
    return json({ error: message, receiptPreserved: true }, 409);
  }
}
