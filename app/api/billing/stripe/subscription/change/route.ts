import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getAuthenticatedUserId } from '@/lib/auth';
import { isPublicLiveBillingEnabled } from '@/lib/billing-launch';
import { classifySubscriptionChange, type BillingPeriod, type IndividualPlanCode } from '@/lib/subscription-change-policy';
import {
  applyImmediateStripeUpgrade,
  createStripeChangeSchedule,
  managedScheduleTarget,
  releaseStripeChangeSchedule,
  retrieveStripeInvoice,
  retrieveStripeSchedule,
  retrieveStripeSubscription,
  singleSubscriptionItem,
  StripeSubscriptionManagementError,
  subscriptionCustomerId,
  subscriptionLatestInvoiceId,
  subscriptionScheduleId,
  updateStripeChangeSchedule,
} from '@/lib/stripe-subscription-management';
import { createAdminClient } from '@/lib/supabase/admin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const InputSchema = z.discriminatedUnion('action', [
  z.object({
    action: z.literal('change'),
    planId: z.enum(['teacher', 'teacher-pro']),
    billing: z.enum(['monthly', 'annual']),
  }),
  z.object({
    action: z.literal('cancel_scheduled_change'),
  }),
]);

function jsonError(
  status: number,
  error: string,
  diagnostics?: { stripeType?: string | null; stripeCode?: string | null; stripeMessage?: string | null },
) {
  return NextResponse.json({ error, diagnostics }, { status, headers: { 'Cache-Control': 'no-store' } });
}

function managementError(error: unknown) {
  if (error instanceof StripeSubscriptionManagementError) {
    return jsonError(502, error.message, {
      stripeType: error.stripeType,
      stripeCode: error.stripeCode,
      stripeMessage: error.stripeMessage,
    });
  }
  return jsonError(502, 'subscription_change_failed');
}

export async function POST(request: Request) {
  let input: z.infer<typeof InputSchema>;
  try {
    input = InputSchema.parse(await request.json());
  } catch {
    return jsonError(400, 'invalid_subscription_change_request');
  }

  const secretKey = process.env.STRIPE_SECRET_KEY_LIVE;
  if (!secretKey || !/^(?:sk|rk)_live_/.test(secretKey)) return jsonError(503, 'live_billing_not_configured');

  const { supabase, userId } = await getAuthenticatedUserId();
  if (!userId) return jsonError(401, 'authentication_required');

  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', userId)
    .maybeSingle();
  if (profileError) return jsonError(500, 'profile_lookup_failed');
  if (!isPublicLiveBillingEnabled() && profile?.role !== 'admin') return jsonError(403, 'live_billing_acceptance_only');

  const admin = createAdminClient();
  const { data: dbSubscription, error: subscriptionError } = await admin
    .from('billing_subscriptions')
    .select('external_subscription_id, external_customer_id')
    .eq('user_id', userId)
    .eq('provider', 'stripe')
    .eq('livemode', true)
    .in('status', ['trialing', 'active', 'past_due'])
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (subscriptionError) return jsonError(500, 'billing_subscription_lookup_failed');
  if (!dbSubscription?.external_subscription_id || !dbSubscription.external_customer_id) {
    return jsonError(409, 'active_subscription_not_found');
  }

  try {
    let stripeSubscription = await retrieveStripeSubscription(secretKey, dbSubscription.external_subscription_id);
    if (subscriptionCustomerId(stripeSubscription) !== dbSubscription.external_customer_id) {
      return jsonError(409, 'billing_customer_mismatch');
    }

    const scheduleId = subscriptionScheduleId(stripeSubscription);
    const schedule = scheduleId ? await retrieveStripeSchedule(secretKey, scheduleId) : null;
    const managedTarget = schedule ? managedScheduleTarget(schedule, userId) : null;

    if (input.action === 'cancel_scheduled_change') {
      if (!scheduleId || !schedule || !managedTarget) return jsonError(409, 'managed_schedule_not_found');
      await releaseStripeChangeSchedule({
        secretKey,
        scheduleId,
        idempotencyScope: `${userId}_${scheduleId}_cancel`,
      });
      return NextResponse.json({ outcome: 'scheduled_change_cancelled' }, { headers: { 'Cache-Control': 'no-store' } });
    }

    if (stripeSubscription.cancel_at_period_end) return jsonError(409, 'subscription_cancellation_scheduled');
    if (stripeSubscription.pending_update) return jsonError(409, 'subscription_pending_update_exists');
    if (stripeSubscription.status === 'past_due') return jsonError(409, 'subscription_payment_issue');
    if (stripeSubscription.status !== 'active' && stripeSubscription.status !== 'trialing') {
      return jsonError(409, 'subscription_not_changeable');
    }

    const item = singleSubscriptionItem(stripeSubscription);
    const currentPriceId = item.price?.id;
    if (!currentPriceId) return jsonError(409, 'subscription_price_missing');

    const { data: currentPriceRow, error: currentPriceError } = await admin
      .from('billing_prices')
      .select('plan_code, billing_period, currency')
      .eq('provider', 'stripe')
      .eq('livemode', true)
      .eq('external_price_id', currentPriceId)
      .eq('active', true)
      .maybeSingle();

    if (currentPriceError) return jsonError(500, 'billing_price_lookup_failed');
    if (
      !currentPriceRow
      || (currentPriceRow.plan_code !== 'teacher' && currentPriceRow.plan_code !== 'teacher_pro')
      || (currentPriceRow.billing_period !== 'monthly' && currentPriceRow.billing_period !== 'annual')
      || (currentPriceRow.currency !== 'czk' && currentPriceRow.currency !== 'eur' && currentPriceRow.currency !== 'usd')
    ) {
      return jsonError(409, 'current_billing_price_unsupported');
    }

    const currentPlan = currentPriceRow.plan_code as IndividualPlanCode;
    const currentPeriod = currentPriceRow.billing_period as BillingPeriod;
    const targetPlan: IndividualPlanCode = input.planId === 'teacher-pro' ? 'teacher_pro' : 'teacher';
    const targetPeriod: BillingPeriod = input.billing;

    const { data: targetPriceRow, error: targetPriceError } = await admin
      .from('billing_prices')
      .select('external_price_id')
      .eq('provider', 'stripe')
      .eq('livemode', true)
      .eq('plan_code', targetPlan)
      .eq('billing_period', targetPeriod)
      .eq('currency', currentPriceRow.currency)
      .eq('active', true)
      .maybeSingle();

    if (targetPriceError) return jsonError(500, 'billing_target_price_lookup_failed');
    if (!targetPriceRow?.external_price_id) return jsonError(409, 'billing_target_price_not_configured');

    const changeKind = classifySubscriptionChange(currentPlan, currentPeriod, targetPlan, targetPeriod);
    if (changeKind === 'none') return NextResponse.json({ outcome: 'no_change' }, { headers: { 'Cache-Control': 'no-store' } });

    if (scheduleId && schedule && !managedTarget) return jsonError(409, 'subscription_schedule_conflict');

    if (changeKind === 'immediate_upgrade') {
      if (scheduleId && managedTarget) {
        await releaseStripeChangeSchedule({
          secretKey,
          scheduleId,
          idempotencyScope: `${userId}_${scheduleId}_replace_for_upgrade`,
        });
        stripeSubscription = await retrieveStripeSubscription(secretKey, dbSubscription.external_subscription_id);
      }

      const freshItem = singleSubscriptionItem(stripeSubscription);
      const freshPeriodEnd = freshItem.current_period_end;
      if (!freshPeriodEnd) return jsonError(409, 'subscription_period_missing');

      const updated = await applyImmediateStripeUpgrade({
        secretKey,
        subscriptionId: dbSubscription.external_subscription_id,
        itemId: freshItem.id!,
        targetPriceId: targetPriceRow.external_price_id,
        userId,
        planCode: targetPlan,
        billingPeriod: targetPeriod,
        idempotencyScope: `${userId}_${dbSubscription.external_subscription_id}_${targetPriceRow.external_price_id}_${freshPeriodEnd}`,
      });

      const updatedItem = singleSubscriptionItem(updated);
      if (updatedItem.price?.id === targetPriceRow.external_price_id && !updated.pending_update) {
        return NextResponse.json({ outcome: 'effective_now' }, { headers: { 'Cache-Control': 'no-store' } });
      }

      const latestInvoiceId = subscriptionLatestInvoiceId(updated);
      const invoice = latestInvoiceId ? await retrieveStripeInvoice(secretKey, latestInvoiceId) : null;
      return NextResponse.json({
        outcome: 'payment_required',
        paymentUrl: invoice?.hosted_invoice_url?.startsWith('https://') ? invoice.hosted_invoice_url : null,
      }, { headers: { 'Cache-Control': 'no-store' } });
    }

    if (scheduleId && managedTarget) {
      if (
        managedTarget.planCode === targetPlan
        && managedTarget.billingPeriod === targetPeriod
        && managedTarget.priceId === targetPriceRow.external_price_id
      ) {
        return NextResponse.json({
          outcome: 'already_scheduled',
          effectiveAt: new Date(managedTarget.effectiveAt * 1000).toISOString(),
        }, { headers: { 'Cache-Control': 'no-store' } });
      }

      await releaseStripeChangeSchedule({
        secretKey,
        scheduleId,
        idempotencyScope: `${userId}_${scheduleId}_replace`,
      });
      stripeSubscription = await retrieveStripeSubscription(secretKey, dbSubscription.external_subscription_id);
    }

    const freshItem = singleSubscriptionItem(stripeSubscription);
    const effectiveAt = freshItem.current_period_end;
    const billingCountry = stripeSubscription.metadata?.syllonaut_billing_country?.toUpperCase() ?? '';
    if (!effectiveAt) return jsonError(409, 'subscription_period_missing');
    if (!/^[A-Z]{2}$/.test(billingCountry)) return jsonError(409, 'billing_country_missing');

    const idempotencyScope = `${userId}_${dbSubscription.external_subscription_id}_${targetPriceRow.external_price_id}_${effectiveAt}`;
    const createdSchedule = await createStripeChangeSchedule({
      secretKey,
      subscriptionId: dbSubscription.external_subscription_id,
      userId,
      targetPlan,
      targetPeriod,
      targetPriceId: targetPriceRow.external_price_id,
      effectiveAt,
      idempotencyScope,
    });

    const createdScheduleId = createdSchedule.id;
    const currentPhase = createdSchedule.phases?.find((phase) => (
      typeof phase.start_date === 'number'
      && typeof phase.end_date === 'number'
      && phase.start_date <= Math.floor(Date.now() / 1000)
      && phase.end_date >= Math.floor(Date.now() / 1000)
    )) ?? createdSchedule.phases?.[0];

    if (!createdScheduleId?.startsWith('sub_sched_') || !currentPhase?.start_date) {
      return jsonError(502, 'subscription_schedule_response_invalid');
    }

    await updateStripeChangeSchedule({
      secretKey,
      scheduleId: createdScheduleId,
      currentPhaseStart: currentPhase.start_date,
      effectiveAt,
      currentPriceId: freshItem.price!.id!,
      targetPriceId: targetPriceRow.external_price_id,
      targetPeriod,
      userId,
      billingCountry,
      targetPlan,
      idempotencyScope,
    });

    return NextResponse.json({
      outcome: 'scheduled',
      effectiveAt: new Date(effectiveAt * 1000).toISOString(),
    }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    console.error('subscription management change failed', {
      userId,
      action: input.action,
      error: error instanceof Error ? error.message : 'unknown',
    });
    return managementError(error);
  }
}
