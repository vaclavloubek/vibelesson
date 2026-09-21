import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getAuthenticatedUserId } from '@/lib/auth';
import {
  deliverOnlineWithdrawalConfirmation,
  getOnlineWithdrawalOpportunity,
  registerOnlineWithdrawal,
} from '@/lib/online-withdrawal';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const Input = z.discriminatedUnion('action', [
  z.object({
    action: z.literal('withdraw'),
    snapshotId: z.string().uuid(),
    consumerName: z.string().trim().min(2).max(160),
    electronicContact: z.string().trim().email().max(254),
    locale: z.enum(['cs', 'en']),
    consumerConfirmed: z.literal(true),
  }),
  z.object({ action: z.literal('retry_confirmation'), receiptId: z.string().uuid() }),
]);

const json = (body: unknown, status = 200) => NextResponse.json(body, {
  status,
  headers: { 'Cache-Control': 'no-store' },
});

export async function POST(request: Request) {
  if (request.headers.get('origin') !== new URL(request.url).origin) return json({ error: 'same_origin_required' }, 403);
  const { authenticatedUserId: userId } = await getAuthenticatedUserId();
  if (!userId) return json({ error: 'authentication_required' }, 401);

  const parsed = Input.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return json({ error: 'invalid_online_withdrawal_submission' }, 400);
  const input = parsed.data;

  try {
    if (input.action === 'retry_confirmation') {
      const delivery = await deliverOnlineWithdrawalConfirmation(input.receiptId, userId);
      return json({ accepted: true, receiptId: input.receiptId, confirmationSent: delivery.sent, confirmationSentAt: delivery.sentAt });
    }
    const opportunity = await getOnlineWithdrawalOpportunity(userId);
    if (!opportunity || opportunity.snapshotId !== input.snapshotId) return json({ error: 'online_withdrawal_contract_not_found' }, 409);
    if (!opportunity.eligible && !opportunity.receiptId) return json({ error: 'online_withdrawal_deadline_expired' }, 409);

    const receipt = await registerOnlineWithdrawal({
      userId,
      snapshotId: input.snapshotId,
      consumerName: input.consumerName,
      electronicContact: input.electronicContact,
      locale: input.locale,
    });

    try {
      const delivery = await deliverOnlineWithdrawalConfirmation(receipt.receiptId, userId);
      return json({
        accepted: true,
        receiptId: receipt.receiptId,
        submittedAt: receipt.submittedAt,
        confirmationSent: delivery.sent,
        confirmationSentAt: delivery.sentAt,
      });
    } catch (error) {
      console.error('online withdrawal confirmation delivery pending', {
        receiptId: receipt.receiptId,
        error: error instanceof Error ? error.message : 'unknown',
      });
      return json({
        accepted: true,
        receiptId: receipt.receiptId,
        submittedAt: receipt.submittedAt,
        confirmationSent: false,
      }, 202);
    }
  } catch (error) {
    const message = error instanceof Error && /^online_withdrawal_[a-z_]+$/.test(error.message)
      ? error.message : 'online_withdrawal_failed';
    return json({ error: message }, message === 'online_withdrawal_deadline_expired' ? 409 : 500);
  }
}
