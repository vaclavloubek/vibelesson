import { z } from 'zod';
import { isStripeLiveSecretKey } from '@/lib/stripe-checkout';
import { createPrivilegedRpcClient } from '@/lib/neon/privileged-rpc';

const Id = z.string();
const Reference = z.union([Id, z.object({ id: Id })]);
const Metadata = z.record(z.string(), z.string());
const Money = z.number().int().nonnegative().safe();
const Period = z.object({ start: z.number().int().positive(), end: z.number().int().positive() });
export const CheckoutEvidenceSchema = z.object({
  id: Id, object: z.literal('checkout.session'), livemode: z.literal(true),
  status: z.literal('complete'), payment_status: z.literal('paid'),
  customer: Reference, subscription: Reference, invoice: Reference,
  metadata: Metadata,
});
export const InvoiceEvidenceSchema = z.object({
  id: Id, object: z.literal('invoice'), livemode: z.literal(true), status: z.literal('paid'),
  customer: Reference, amount_paid: Money, currency: z.enum(['czk','eur','usd']),
  billing_reason: z.literal('subscription_create'),
  status_transitions: z.object({ paid_at: z.number().int().positive() }),
  lines: z.object({ has_more: z.literal(false), data: z.array(z.object({
    period: Period, amount: z.number().int().safe(), quantity: z.literal(1),
  })).length(1) }),
});
export const ChargeEvidenceSchema = z.object({
  id: Id, object: z.literal('charge'), livemode: z.literal(true), paid: z.literal(true),
  disputed: z.literal(false), customer: Reference, payment_intent: Reference,
  amount: Money, amount_refunded: Money, currency: z.enum(['czk','eur','usd']),
});
const RefundSchema = z.object({
  id: z.string().regex(/^re_[A-Za-z0-9_]+$/), object: z.literal('refund'),
  amount: Money, currency: z.string(), payment_intent: Reference,
  status: z.enum(['pending','requires_action','succeeded','failed','canceled']),
  metadata: Metadata,
});
export function stripeReference(value: z.infer<typeof Reference>) {
  return typeof value === 'string' ? value : value.id;
}

export async function withdrawalStripeRequest<T>(
  key: string, path: string, schema: z.ZodType<T>,
  method: 'GET' | 'POST' | 'DELETE' = 'GET', body?: URLSearchParams, idempotencyKey?: string,
): Promise<T> {
  if (!isStripeLiveSecretKey(key)) throw new Error('withdrawal_live_key_invalid');
  const response = await fetch('https://api.stripe.com/v1/' + path, {
    method, headers: {
      authorization: 'Bearer ' + key, 'stripe-version': '2026-07-29.dahlia',
      ...(body ? { 'content-type': 'application/x-www-form-urlencoded' } : {}),
      ...(idempotencyKey ? { 'idempotency-key': idempotencyKey } : {}),
    }, body, cache: 'no-store', signal: AbortSignal.timeout(12_000),
  });
  if (!response.ok) throw new Error('withdrawal_stripe_request_failed');
  return schema.parse(await response.json());
}

export async function getWithdrawalCharge(key: string, paymentIntentId: string) {
  if (!/^pi_[A-Za-z0-9_]+$/.test(paymentIntentId)) throw new Error('withdrawal_payment_id_invalid');
  const pi = await withdrawalStripeRequest(key, 'payment_intents/' + paymentIntentId,
    z.object({ id: Id, livemode: z.literal(true), status: z.literal('succeeded'), latest_charge: Reference }));
  if (pi.id !== paymentIntentId) throw new Error('withdrawal_payment_mismatch');
  return withdrawalStripeRequest(key, 'charges/' + encodeURIComponent(stripeReference(pi.latest_charge)), ChargeEvidenceSchema);
}

export async function createWithdrawalStripeRefund(key: string, input: {
  requestId: string; receiptId: string; paymentIntentId: string; amountMinor: number; currency: string;
}) {
  if (!Number.isSafeInteger(input.amountMinor) || input.amountMinor <= 0) throw new Error('withdrawal_refund_amount_invalid');
  const body = new URLSearchParams({
    payment_intent: input.paymentIntentId, amount: String(input.amountMinor), reason: 'requested_by_customer',
    'metadata[syllonaut_withdrawal_id]': input.requestId,
    'metadata[syllonaut_withdrawal_receipt_id]': input.receiptId,
    'metadata[syllonaut_refund_method]': 'time-pro-rata-v1',
  });
  const refund = await withdrawalStripeRequest(key, 'refunds', RefundSchema, 'POST', body,
    'syllonaut-withdrawal-' + input.requestId);
  if (stripeReference(refund.payment_intent) !== input.paymentIntentId
    || refund.amount !== input.amountMinor || refund.currency !== input.currency
    || refund.metadata.syllonaut_withdrawal_id !== input.requestId) throw new Error('withdrawal_refund_response_mismatch');
  return refund;
}

export async function findWithdrawalStripeRefund(key: string, requestId: string, paymentIntentId: string) {
  const list = await withdrawalStripeRequest(key, 'refunds?payment_intent=' + encodeURIComponent(paymentIntentId) + '&limit=100',
    z.object({ has_more: z.literal(false), data: z.array(RefundSchema) }));
  const matching = list.data.filter(r => r.metadata.syllonaut_withdrawal_id === requestId);
  if (matching.length > 1) throw new Error('withdrawal_duplicate_refund_review_required');
  return matching[0] ?? null;
}

export async function createServiceChangeStripeRefund(key: string, input: {
  requestId: string; releaseId: string; paymentIntentId: string; amountMinor: number; currency: string;
}) {
  if (!Number.isSafeInteger(input.amountMinor) || input.amountMinor <= 0) throw new Error('service_change_refund_amount_invalid');
  const body = new URLSearchParams({
    payment_intent: input.paymentIntentId,
    amount: String(input.amountMinor),
    reason: 'requested_by_customer',
    'metadata[syllonaut_service_change_termination_id]': input.requestId,
    'metadata[syllonaut_service_change_release_id]': input.releaseId,
    'metadata[syllonaut_refund_method]': 'unused-period-v1',
  });
  const refund = await withdrawalStripeRequest(key, 'refunds', RefundSchema, 'POST', body,
    'syllonaut-service-change-' + input.requestId);
  if (stripeReference(refund.payment_intent) !== input.paymentIntentId
    || refund.amount !== input.amountMinor || refund.currency !== input.currency
    || refund.metadata.syllonaut_service_change_termination_id !== input.requestId) {
    throw new Error('service_change_refund_response_mismatch');
  }
  return refund;
}

export async function findServiceChangeStripeRefund(key: string, requestId: string, paymentIntentId: string) {
  const list = await withdrawalStripeRequest(key, 'refunds?payment_intent=' + encodeURIComponent(paymentIntentId) + '&limit=100',
    z.object({ has_more: z.literal(false), data: z.array(RefundSchema) }));
  const matching = list.data.filter(r => r.metadata.syllonaut_service_change_termination_id === requestId);
  if (matching.length > 1) throw new Error('service_change_duplicate_refund_review_required');
  return matching[0] ?? null;
}

export async function cancelWithdrawnSubscription(key: string, subscriptionId: string) {
  if (!/^sub_[A-Za-z0-9_]+$/.test(subscriptionId)) throw new Error('withdrawal_subscription_invalid');
  const canceled = await withdrawalStripeRequest(key, 'subscriptions/' + subscriptionId,
    z.object({ id: Id, status: z.literal('canceled'), livemode: z.literal(true), canceled_at:z.number().int().positive() }), 'DELETE',
    new URLSearchParams({ invoice_now: 'false', prorate: 'false' }));
  if (canceled.id !== subscriptionId) throw new Error('withdrawal_cancellation_mismatch');
  return { canceledAt: new Date(canceled.canceled_at * 1000).toISOString() };
}

export async function reconcileWithdrawalRefundEvent(key: string, object: unknown) {
  const eventObject = z.object({object:z.literal('refund'),id:z.string().regex(/^re_[A-Za-z0-9_]+$/)}).safeParse(object);
  if (!eventObject.success) return;
  const refund = await withdrawalStripeRequest(key,'refunds/'+eventObject.data.id,RefundSchema);
  const id = refund.metadata.syllonaut_withdrawal_id;
  if (!id) return;
  if (!z.string().uuid().safeParse(id).success) throw new Error('withdrawal_refund_metadata_invalid');
  const {error}=await createPrivilegedRpcClient().rpc('reconcile_individual_withdrawal_refund_for_service',{
    p_request_id:id,p_lease_token:null,p_refund_id:refund.id,p_payment_intent_id:stripeReference(refund.payment_intent),
    p_amount:refund.amount,p_currency:refund.currency,p_status:refund.status,
  });
  if(error) throw new Error('withdrawal_refund_reconciliation_failed');
}

export async function reconcileServiceChangeRefundEvent(key: string, object: unknown) {
  const eventObject = z.object({object:z.literal('refund'),id:z.string().regex(/^re_[A-Za-z0-9_]+$/)}).safeParse(object);
  if (!eventObject.success) return;
  const refund = await withdrawalStripeRequest(key,'refunds/'+eventObject.data.id,RefundSchema);
  const id = refund.metadata.syllonaut_service_change_termination_id;
  if (!id) return;
  if (!z.string().uuid().safeParse(id).success) throw new Error('service_change_refund_metadata_invalid');
  const {error}=await createPrivilegedRpcClient().rpc('reconcile_service_change_termination_refund_for_service',{
    p_request_id:id,p_lease_token:null,p_refund_id:refund.id,p_payment_intent_id:stripeReference(refund.payment_intent),
    p_amount:refund.amount,p_currency:refund.currency,p_status:refund.status,
  });
  if(error) throw new Error('service_change_refund_reconciliation_failed');
}
