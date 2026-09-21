import { createHash } from 'node:crypto';
import { z } from 'zod';
import { createAdminClient } from '@/lib/supabase/admin';
import { calculateWithdrawal } from '@/lib/withdrawal-calculation';
import {
  retrieveStripeSubscription, singleSubscriptionItem, subscriptionCustomerId,
  subscriptionLatestInvoiceId, subscriptionScheduleId,
} from '@/lib/stripe-subscription-management';
import {
  CheckoutEvidenceSchema, InvoiceEvidenceSchema, getWithdrawalCharge,
  stripeReference, withdrawalStripeRequest, cancelWithdrawnSubscription, createWithdrawalStripeRefund, findWithdrawalStripeRefund,
} from '@/lib/stripe-withdrawal';

const SnapshotSchema = z.object({
  snapshot_id: z.string().uuid(), plan_code: z.string(), billing_period: z.string(),
  amount_minor: z.number().int().nonnegative().safe(), currency: z.enum(['czk','eur','usd']),
  immediate_performance_requested: z.boolean(), terms_acceptance_key: z.string(),
  contract_html: z.string(), withdrawal_form_html: z.string(), content_sha256: z.string(),
  external_checkout_session_id: z.string(),
});
const StateSchema = z.object({
  receipt: z.object({ id: z.string().uuid(), user_id: z.string().uuid(), snapshot_id: z.string().uuid(), received_at: z.string() }),
  execution: z.object({ status: z.string(), first_attempt_at: z.string().nullable(), stripe_refund_id: z.string().nullable(), stripe_refund_status: z.string().nullable() }),
  calculation: z.unknown().nullable(),
  payments: z.array(z.object({
    external_payment_intent_id: z.string(), external_invoice_id: z.string(), external_subscription_id: z.string(),
    amount_paid: z.number().nullable(), currency: z.string().nullable(), billing_reason: z.string().nullable(),
  })),
});
const EvidenceSchema = z.object({
  subscriptionId: z.string(), customerId: z.string(), invoiceId: z.string(), paymentIntentId: z.string(), chargeId: z.string(),
  priceId: z.string(), snapshotSha256: z.string(), termsAcceptanceKey: z.string(),
  amountMinor: z.number(), currency: z.enum(['czk','eur','usd']),
  periodStart: z.string(), periodEnd: z.string(), serviceStartedAt: z.string(), withdrawalReceivedAt: z.string(),
  immediatePerformanceRequested: z.boolean(), proportionateChargeDisclosed: z.boolean(),
  previouslyRefundedMinor: z.number(), refundDueMinor: z.number(),
});
async function rpc(name: string, params: Record<string, unknown>) {
  const { data, error } = await createAdminClient().rpc(name, params);
  if (error) throw new Error('withdrawal_evidence_operation_failed');
  return data;
}
export async function getWithdrawalState(id: string) {
  return StateSchema.parse(await rpc('get_individual_withdrawal_for_service', { p_id: id }));
}

/** No money moves here. Complex histories are retained for individual review. */
export async function prepareWithdrawal(id: string, key: string) {
  const state = await getWithdrawalState(id);
  if (state.calculation) return state.calculation;
  const snapshots = await rpc('get_individual_contract_snapshot_for_delivery', {
    p_snapshot_id: state.receipt.snapshot_id, p_user_id: state.receipt.user_id, p_livemode: true,
  });
  const snapshot = SnapshotSchema.parse(snapshots?.[0]);
  const hash = createHash('sha256').update(snapshot.contract_html, 'utf8')
    .update('\n--syllonaut-withdrawal-form--\n', 'utf8').update(snapshot.withdrawal_form_html, 'utf8').digest('hex');
  if (hash !== snapshot.content_sha256) throw new Error('withdrawal_snapshot_integrity_failed');
  const session = await withdrawalStripeRequest(key,
    'checkout/sessions/' + encodeURIComponent(snapshot.external_checkout_session_id), CheckoutEvidenceSchema);
  if (session.id !== snapshot.external_checkout_session_id
    || session.metadata.syllonaut_user_id !== state.receipt.user_id
    || session.metadata.syllonaut_contract_snapshot_id !== state.receipt.snapshot_id) throw new Error('withdrawal_contract_mismatch');
  const subscriptionId = stripeReference(session.subscription);
  const customerId = stripeReference(session.customer);
  const invoiceId = stripeReference(session.invoice);
  const subscription = await retrieveStripeSubscription(key, subscriptionId);
  const item = singleSubscriptionItem(subscription);
  if (subscriptionCustomerId(subscription) !== customerId
    || subscription.metadata?.syllonaut_user_id !== state.receipt.user_id
    || subscription.metadata?.syllonaut_contract_snapshot_id !== state.receipt.snapshot_id) throw new Error('withdrawal_subscription_mismatch');
  // An upgrade/proration, renewal, pending update or schedule requires allocation
  // review; never silently refund the latest invoice or price instead of the contract.
  if (subscriptionLatestInvoiceId(subscription) !== invoiceId || subscription.pending_update
    || subscriptionScheduleId(subscription)
    || subscription.metadata?.syllonaut_plan_code !== snapshot.plan_code
    || subscription.metadata?.syllonaut_billing_period !== snapshot.billing_period) throw new Error('withdrawal_plan_history_review_required');
  const payments = state.payments.filter(p => p.external_subscription_id === subscriptionId);
  if (payments.length !== 1 || payments[0].external_invoice_id !== invoiceId
    || payments[0].billing_reason !== 'subscription_create') throw new Error('withdrawal_payment_history_review_required');
  const payment = payments[0];
  const invoice = await withdrawalStripeRequest(key, 'invoices/' + encodeURIComponent(invoiceId), InvoiceEvidenceSchema);
  const charge = await getWithdrawalCharge(key, payment.external_payment_intent_id);
  if (invoice.id !== invoiceId || stripeReference(invoice.customer) !== customerId
    || stripeReference(charge.customer) !== customerId
    || stripeReference(charge.payment_intent) !== payment.external_payment_intent_id
    || invoice.amount_paid !== snapshot.amount_minor || payment.amount_paid !== snapshot.amount_minor
    || charge.amount !== snapshot.amount_minor || invoice.currency !== snapshot.currency
    || charge.currency !== snapshot.currency || payment.currency !== snapshot.currency) throw new Error('withdrawal_price_review_required');
  const period = invoice.lines.data[0].period;
  if (period.start !== item.current_period_start || period.end !== item.current_period_end) throw new Error('withdrawal_period_review_required');
  const iso = (seconds: number) => new Date(seconds * 1000).toISOString();
  const { data: activationRecord, error: activationError } = await createAdminClient()
    .from('billing_email_deliveries').select('created_at, external_event_id')
    .eq('user_id',state.receipt.user_id).eq('external_subscription_id',subscriptionId)
    .eq('contract_snapshot_id',state.receipt.snapshot_id).eq('livemode',true)
    .eq('notification_type','subscription_activated').order('created_at',{ascending:true}).limit(1).maybeSingle();
  if (activationError || !activationRecord) throw new Error('withdrawal_activation_evidence_required');
  // This server record is created AFTER entitlement provisioning. Using its
  // later timestamp waives any preceding seconds in favour of the consumer.
  const activation = Math.max(period.start, invoice.status_transitions.paid_at, Date.parse(activationRecord.created_at)/1000);
  const calculation = calculateWithdrawal({
    amountMinor: snapshot.amount_minor, currency: snapshot.currency,
    periodStart: iso(period.start), periodEnd: iso(period.end), serviceStartedAt: iso(activation),
    withdrawalReceivedAt: new Date(state.receipt.received_at).toISOString(),
    immediatePerformanceRequested: snapshot.immediate_performance_requested,
    proportionateChargeDisclosed: ['2026-09-21-v1','2026-09-21-v2','2026-09-21-v3'].includes(snapshot.terms_acceptance_key),
    previouslyRefundedMinor: charge.amount_refunded,
  });
  const evidence = {
    ...calculation, subscriptionId, customerId, invoiceId,
    paymentIntentId: payment.external_payment_intent_id, chargeId: charge.id, priceId: item.price!.id!,
    snapshotSha256: hash, termsAcceptanceKey: snapshot.terms_acceptance_key,
    activationEvidenceEventId: activationRecord.external_event_id,
  };
  await rpc('prepare_individual_withdrawal_for_service', { p_id: id, p_evidence: evidence });
  return evidence;
}

export async function executeWithdrawal(id: string, key: string) {
  const state = await getWithdrawalState(id);
  if (state.execution.status === 'submitted') return state.execution;
  const evidence = EvidenceSchema.parse(state.calculation);
  // Do not trust saved result fields independently of the immutable inputs.
  if (calculateWithdrawal(evidence).refundDueMinor !== evidence.refundDueMinor) throw new Error('withdrawal_calculation_invalid');
  const token = await rpc('claim_individual_withdrawal_for_service', { p_id: id });
  if (typeof token !== 'string') throw new Error('withdrawal_busy_or_retry_window_expired');
  const subscription = await retrieveStripeSubscription(key, evidence.subscriptionId);
  if (subscriptionCustomerId(subscription) !== evidence.customerId
    || subscriptionLatestInvoiceId(subscription) !== evidence.invoiceId
    || subscription.pending_update || subscriptionScheduleId(subscription)
    || singleSubscriptionItem(subscription).price?.id !== evidence.priceId) throw new Error('withdrawal_plan_history_review_required');
  // Repeating cancellation is safe after a lost response; no extra invoice or
  // Stripe proration is created. The ordinary signed webhook ends entitlements.
  if (subscription.status !== 'canceled') await cancelWithdrawnSubscription(key, evidence.subscriptionId);
  const charge = await getWithdrawalCharge(key, evidence.paymentIntentId);
  if (charge.id !== evidence.chargeId || charge.amount !== evidence.amountMinor || charge.currency !== evidence.currency) throw new Error('withdrawal_charge_changed');
  // The original amount and key NEVER change on retry. Stripe rejects an amount
  // exceeding the remaining balance; ambiguous external refunds need review.
  const existing = await findWithdrawalStripeRefund(key,id,evidence.paymentIntentId);
  if (existing && (existing.amount !== evidence.refundDueMinor || existing.currency !== evidence.currency
    || stripeReference(existing.payment_intent) !== evidence.paymentIntentId)) throw new Error('withdrawal_existing_refund_mismatch');
  if (!existing && charge.amount_refunded !== evidence.previouslyRefundedMinor) {
    await rpc('finish_individual_withdrawal_for_service', {
      p_id: id,p_token: token,p_refund_id: null,p_refund_status: null,p_review_reason: 'external_refund_changed',
    });
    throw new Error('withdrawal_external_refund_review_required');
  }
  const refund = existing ?? (evidence.refundDueMinor > 0 ? await createWithdrawalStripeRefund(key, {
    withdrawalId: id,paymentIntentId: evidence.paymentIntentId,amountMinor: evidence.refundDueMinor,currency: evidence.currency,
  }) : null);
  await rpc('finish_individual_withdrawal_for_service', {
    p_id: id,p_token: token,p_refund_id: refund?.id ?? null,p_refund_status: refund?.status ?? 'not_required',
    p_review_reason: refund && ['failed','canceled','requires_action'].includes(refund.status) ? 'stripe_refund_attention_required' : null,
  });
  return { status: 'submitted', refundId: refund?.id ?? null, refundStatus: refund?.status ?? 'not_required' };
}
