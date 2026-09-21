import { z } from 'zod';
import { createAdminClient } from '@/lib/supabase/admin';
import { getIndividualAiBillingPauseReason } from '@/lib/individual-ai-billing';
import {
  calculateIndividualWithdrawal,
  type IndividualWithdrawalCalculation,
} from '@/lib/individual-withdrawal';
import {
  retrieveStripeSubscription,
  singleSubscriptionItem,
  subscriptionScheduleId,
} from '@/lib/stripe-subscription-management';

const SnapshotSchema = z.object({
  id: z.string().uuid(),
  planCode: z.enum(['teacher', 'teacher_pro']),
  billingPeriod: z.enum(['monthly', 'annual']),
  currency: z.enum(['czk', 'eur', 'usd']),
  amountMinor: z.number().int().positive(),
  immediatePerformanceRequested: z.boolean(),
  acceptedAt: z.string(),
  termsVersion: z.string(),
  termsAcceptanceKey: z.string(),
});

const PaymentSchema = z.object({
  paymentIntentId: z.string().regex(/^pi_[A-Za-z0-9_]+$/),
  amountPaid: z.number().int().positive(),
  currency: z.enum(['czk', 'eur', 'usd']),
  paidAt: z.string(),
});

const ExistingWithdrawalSchema = z.object({
  id: z.string().uuid(),
  status: z.enum(['processing', 'refund_succeeded', 'completed', 'needs_attention']),
  retainedAmountMinor: z.number().int().nonnegative(),
  targetTotalRefundMinor: z.number().int().nonnegative(),
  refundAmountMinor: z.number().int().nonnegative(),
  externalRefundId: z.string().nullable(),
  refundStatus: z.string().nullable(),
  withdrawalReceivedAt: z.string(),
  subscriptionCancelledAt: z.string().nullable(),
  failureStage: z.string().nullable(),
  failureCode: z.string().nullable(),
}).nullable();

const ContextSchema = z.discriminatedUnion('status', [
  z.object({
    status: z.literal('manual_review'),
    reason: z.string(),
  }),
  z.object({
    status: z.literal('ok'),
    snapshot: SnapshotSchema,
    payment: PaymentSchema,
    priorRefundedMinor: z.number().int().nonnegative(),
    existingWithdrawal: ExistingWithdrawalSchema,
  }),
]);

export type IndividualWithdrawalQuote =
  | {
      kind: 'eligible';
      subscriptionId: string;
      snapshotId: string;
      paymentIntentId: string;
      planCode: 'teacher' | 'teacher_pro';
      billingPeriod: 'monthly' | 'annual';
      currency: 'czk' | 'eur' | 'usd';
      contractConcludedAt: string;
      calculation: IndividualWithdrawalCalculation;
    }
  | {
      kind: 'in_progress' | 'completed';
      subscriptionId: string;
      snapshotId: string;
      paymentIntentId: string;
      currency: 'czk' | 'eur' | 'usd';
      requestId: string;
      status: 'processing' | 'refund_succeeded' | 'completed' | 'needs_attention';
      retainedAmountMinor: number;
      targetTotalRefundMinor: number;
      refundAmountMinor: number;
      externalRefundId: string | null;
      refundStatus: string | null;
      withdrawalReceivedAt: string;
      subscriptionCancelledAt: string | null;
      failureStage: string | null;
      failureCode: string | null;
      stripeSubscriptionStatus: string;
      stripeCanceledAt: string | null;
    }
  | {
      kind: 'manual_review' | 'unavailable';
      reason: string;
      withdrawalDeadline?: string;
    };

function isoFromStripeSeconds(value: number | null | undefined) {
  if (!value || !Number.isSafeInteger(value) || value <= 0) return null;
  return new Date(value * 1000).toISOString();
}

export async function getIndividualWithdrawalQuote(
  userId: string,
  withdrawalAt = new Date(),
): Promise<IndividualWithdrawalQuote> {
  const admin = createAdminClient();
  const secretKey = process.env.STRIPE_SECRET_KEY_LIVE;
  if (!secretKey || !/^(?:sk|rk)_live_/.test(secretKey)) {
    throw new Error('live_billing_not_configured');
  }

  const { data: dbSubscription, error: subscriptionError } = await admin
    .from('billing_subscriptions')
    .select('external_subscription_id, plan_code, billing_period, currency, status, updated_at')
    .eq('user_id', userId)
    .eq('provider', 'stripe')
    .eq('livemode', true)
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (subscriptionError) throw new Error('billing_subscription_lookup_failed');
  if (!dbSubscription?.external_subscription_id) {
    return { kind: 'unavailable', reason: 'no_individual_subscription' };
  }

  const subscription = await retrieveStripeSubscription(secretKey, dbSubscription.external_subscription_id);
  if (subscription.id !== dbSubscription.external_subscription_id) {
    throw new Error('withdrawal_subscription_identity_mismatch');
  }
  if (subscription.metadata?.syllonaut_user_id !== userId) {
    throw new Error('withdrawal_subscription_user_mismatch');
  }

  const snapshotId = subscription.metadata?.syllonaut_contract_snapshot_id ?? '';
  if (!/^[0-9a-f-]{36}$/i.test(snapshotId)) {
    return { kind: 'manual_review', reason: 'contract_snapshot_missing' };
  }

  const { data: rawContext, error: contextError } = await admin.rpc(
    'get_individual_withdrawal_context_for_service',
    {
      p_user_id: userId,
      p_subscription_id: dbSubscription.external_subscription_id,
      p_snapshot_id: snapshotId,
    },
  );
  if (contextError) throw new Error('withdrawal_context_lookup_failed');

  const parsedContext = ContextSchema.safeParse(rawContext);
  if (!parsedContext.success) throw new Error('withdrawal_context_invalid');
  if (parsedContext.data.status === 'manual_review') {
    return { kind: 'manual_review', reason: parsedContext.data.reason };
  }

  const context = parsedContext.data;
  const stripeStatus = subscription.status ?? 'unknown';
  const stripeCanceledAt = isoFromStripeSeconds(subscription.canceled_at);

  if (context.existingWithdrawal) {
    const existing = context.existingWithdrawal;
    return {
      kind: existing.status === 'completed' ? 'completed' : 'in_progress',
      subscriptionId: dbSubscription.external_subscription_id,
      snapshotId,
      paymentIntentId: context.payment.paymentIntentId,
      currency: context.snapshot.currency,
      requestId: existing.id,
      status: existing.status,
      retainedAmountMinor: existing.retainedAmountMinor,
      targetTotalRefundMinor: existing.targetTotalRefundMinor,
      refundAmountMinor: existing.refundAmountMinor,
      externalRefundId: existing.externalRefundId,
      refundStatus: existing.refundStatus,
      withdrawalReceivedAt: existing.withdrawalReceivedAt,
      subscriptionCancelledAt: existing.subscriptionCancelledAt,
      failureStage: existing.failureStage,
      failureCode: existing.failureCode,
      stripeSubscriptionStatus: stripeStatus,
      stripeCanceledAt,
    };
  }

  if (!['active', 'trialing'].includes(stripeStatus)) {
    return {
      kind: stripeStatus === 'past_due' ? 'manual_review' : 'unavailable',
      reason: stripeStatus === 'past_due' ? 'payment_issue' : 'subscription_not_active',
    };
  }
  if (subscription.pending_update || subscriptionScheduleId(subscription)) {
    return { kind: 'manual_review', reason: 'subscription_changed' };
  }

  const item = singleSubscriptionItem(subscription);
  const periodStart = isoFromStripeSeconds(item.current_period_start);
  const periodEnd = isoFromStripeSeconds(item.current_period_end);
  const contractConcludedAt = isoFromStripeSeconds(subscription.created);
  if (!periodStart || !periodEnd || !contractConcludedAt || !item.price?.id) {
    return { kind: 'manual_review', reason: 'billing_state_invalid' };
  }

  const { data: priceRow, error: priceError } = await admin
    .from('billing_prices')
    .select('plan_code, billing_period, currency')
    .eq('provider', 'stripe')
    .eq('livemode', true)
    .eq('external_price_id', item.price.id)
    .eq('active', true)
    .maybeSingle();
  if (priceError || !priceRow) {
    return { kind: 'manual_review', reason: 'billing_price_missing' };
  }

  if (
    priceRow.plan_code !== context.snapshot.planCode
    || priceRow.billing_period !== context.snapshot.billingPeriod
    || priceRow.currency !== context.snapshot.currency
    || dbSubscription.plan_code !== context.snapshot.planCode
    || dbSubscription.billing_period !== context.snapshot.billingPeriod
    || dbSubscription.currency !== context.snapshot.currency
  ) {
    return { kind: 'manual_review', reason: 'subscription_changed' };
  }

  if (
    context.payment.currency !== context.snapshot.currency
    || context.payment.amountPaid !== context.snapshot.amountMinor
  ) {
    return { kind: 'manual_review', reason: 'payment_mismatch' };
  }

  const pauseReason = await getIndividualAiBillingPauseReason(userId);
  if (pauseReason === 'dispute') {
    return { kind: 'manual_review', reason: 'payment_dispute' };
  }
  if (pauseReason === 'past_due') {
    return { kind: 'manual_review', reason: 'payment_issue' };
  }

  const paidAtMs = Date.parse(context.payment.paidAt);
  const periodStartMs = Date.parse(periodStart);
  if (!Number.isFinite(paidAtMs) || !Number.isFinite(periodStartMs)) {
    return { kind: 'manual_review', reason: 'payment_timestamp_invalid' };
  }
  const serviceStartedAt = new Date(Math.max(paidAtMs, periodStartMs)).toISOString();

  const calculation = calculateIndividualWithdrawal({
    contractAmountMinor: context.snapshot.amountMinor,
    paymentAmountMinor: context.payment.amountPaid,
    priorRefundedMinor: context.priorRefundedMinor,
    contractConcludedAt,
    serviceStartedAt,
    periodStart,
    periodEnd,
    withdrawalReceivedAt: withdrawalAt.toISOString(),
    immediatePerformanceRequested: context.snapshot.immediatePerformanceRequested,
  });

  if (!calculation.eligible) {
    return {
      kind: 'unavailable',
      reason: calculation.reason,
      withdrawalDeadline: calculation.withdrawalDeadline,
    };
  }

  return {
    kind: 'eligible',
    subscriptionId: dbSubscription.external_subscription_id,
    snapshotId,
    paymentIntentId: context.payment.paymentIntentId,
    planCode: context.snapshot.planCode,
    billingPeriod: context.snapshot.billingPeriod,
    currency: context.snapshot.currency,
    contractConcludedAt,
    calculation,
  };
}
