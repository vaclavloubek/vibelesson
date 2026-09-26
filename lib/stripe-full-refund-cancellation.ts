import { z } from 'zod';

// A full refund of the current paid period of an individual subscription ends
// the subscription immediately (no next charge, account falls back to Free).
// Exceptions that never cancel here:
// - refund reason 'duplicate' (a double payment was returned, the period stays paid;
//   the webhook then releases the refund AI pause when another payment covers it),
// - refunds created by the in-app withdrawal or service-change flows (they cancel
//   the subscription on their own path),
// - partial, failed or reversed refunds, and refunds of an older invoice.
// Stripe sends charge.refunded, refund.created and refund.updated for one refund;
// once the subscription is canceled, later events find it ended and do nothing.

const Id = z.string();
const Reference = z.union([Id, z.object({ id: Id })]);

const RefundListSchema = z.object({
  has_more: z.boolean(),
  data: z.array(z.object({
    id: z.string().regex(/^re_[A-Za-z0-9_]+$/),
    object: z.literal('refund'),
    status: z.string().nullable(),
    reason: z.string().nullable(),
    metadata: z.record(z.string(), z.string()).nullable(),
  })),
});

const InvoicePaymentListSchema = z.object({
  data: z.array(z.object({
    invoice: Reference,
    status: z.string(),
  })),
});

const SubscriptionSchema = z.object({
  id: Id,
  object: z.literal('subscription'),
  livemode: z.literal(true),
  status: z.string(),
  latest_invoice: Reference.nullable(),
});

export type FullRefundCancellationDeps = {
  stripeGet: <T>(path: string, schema: z.ZodType<T>) => Promise<T>;
  cancelSubscription: (subscriptionId: string) => Promise<{ canceledAt: string }>;
};

export type FullRefundSkipReason =
  | 'not_livemode'
  | 'partial_refund'
  | 'refund_failed'
  | 'refund_not_effective'
  | 'app_managed_refund'
  | 'duplicate'
  | 'mixed_refund_reasons'
  | 'subscription_not_live'
  | 'invoice_unresolved'
  | 'not_current_invoice';

export type FullRefundCancellationOutcome =
  | { action: 'canceled'; subscriptionId: string; canceledAt: string }
  | { action: 'skipped'; reason: FullRefundSkipReason };

const LIVE_SUBSCRIPTION_STATUSES = new Set(['trialing', 'active', 'past_due']);
const INEFFECTIVE_REFUND_STATUSES = new Set(['failed', 'canceled']);

function reference(value: z.infer<typeof Reference>) {
  return typeof value === 'string' ? value : value.id;
}

function triggeringRefundId(eventType: string, eventObject: unknown) {
  if (!eventType.startsWith('refund.')) return null;
  const parsed = z.object({ object: z.literal('refund'), id: z.string().regex(/^re_[A-Za-z0-9_]+$/) })
    .safeParse(eventObject);
  if (!parsed.success) throw new Error('full_refund_event_object_invalid');
  return parsed.data.id;
}

export async function cancelSubscriptionAfterFullRefund(
  deps: FullRefundCancellationDeps,
  input: {
    livemode: boolean;
    eventType: string;
    eventObject: unknown;
    chargeId: string;
    paymentIntentId: string;
    fullyRefunded: boolean;
    subscriptionId: string;
  },
): Promise<FullRefundCancellationOutcome> {
  if (!input.livemode) return { action: 'skipped', reason: 'not_livemode' };
  if (!input.fullyRefunded) return { action: 'skipped', reason: 'partial_refund' };
  if (input.eventType === 'refund.failed') return { action: 'skipped', reason: 'refund_failed' };
  if (!/^ch_[A-Za-z0-9_]+$/.test(input.chargeId)) throw new Error('full_refund_charge_invalid');
  if (!/^pi_[A-Za-z0-9_]+$/.test(input.paymentIntentId)) throw new Error('full_refund_payment_intent_invalid');
  if (!/^sub_[A-Za-z0-9_]+$/.test(input.subscriptionId)) throw new Error('full_refund_subscription_invalid');

  const triggerId = triggeringRefundId(input.eventType, input.eventObject);
  const refunds = await deps.stripeGet(
    'refunds?charge=' + encodeURIComponent(input.chargeId) + '&limit=100',
    RefundListSchema,
  );
  if (refunds.has_more) throw new Error('full_refund_refund_list_incomplete');

  if (triggerId) {
    const trigger = refunds.data.find((refund) => refund.id === triggerId);
    if (!trigger) throw new Error('full_refund_trigger_missing');
    if (INEFFECTIVE_REFUND_STATUSES.has(trigger.status ?? '')) {
      return { action: 'skipped', reason: 'refund_not_effective' };
    }
  }

  if (refunds.data.some((refund) => refund.metadata?.syllonaut_withdrawal_id
    || refund.metadata?.syllonaut_service_change_termination_id)) {
    return { action: 'skipped', reason: 'app_managed_refund' };
  }

  const effective = refunds.data.filter((refund) => !INEFFECTIVE_REFUND_STATUSES.has(refund.status ?? ''));
  const duplicates = effective.filter((refund) => refund.reason === 'duplicate').length;
  if (duplicates > 0) {
    return { action: 'skipped', reason: duplicates === effective.length ? 'duplicate' : 'mixed_refund_reasons' };
  }

  const subscription = await deps.stripeGet(
    'subscriptions/' + encodeURIComponent(input.subscriptionId),
    SubscriptionSchema,
  );
  if (subscription.id !== input.subscriptionId) throw new Error('full_refund_subscription_mismatch');
  if (!LIVE_SUBSCRIPTION_STATUSES.has(subscription.status)) {
    return { action: 'skipped', reason: 'subscription_not_live' };
  }

  const invoicePayments = await deps.stripeGet(
    'invoice_payments?payment%5Btype%5D=payment_intent&payment%5Bpayment_intent%5D='
      + encodeURIComponent(input.paymentIntentId) + '&limit=10',
    InvoicePaymentListSchema,
  );
  const invoiceIds = [...new Set(invoicePayments.data.map((payment) => reference(payment.invoice)))];
  if (invoiceIds.length !== 1) return { action: 'skipped', reason: 'invoice_unresolved' };

  const latestInvoice = subscription.latest_invoice ? reference(subscription.latest_invoice) : null;
  if (latestInvoice !== invoiceIds[0]) return { action: 'skipped', reason: 'not_current_invoice' };

  const { canceledAt } = await deps.cancelSubscription(input.subscriptionId);
  return { action: 'canceled', subscriptionId: input.subscriptionId, canceledAt };
}
