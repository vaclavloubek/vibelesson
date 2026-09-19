import { createAdminClient } from '@/lib/supabase/admin';
import {
  managedScheduleTarget,
  retrieveStripePrice,
  retrieveStripeSchedule,
  retrieveStripeSubscription,
  singleSubscriptionItem,
  subscriptionCustomerId,
  subscriptionScheduleId,
} from '@/lib/stripe-subscription-management';
import { publicPlanId, type BillingPeriod, type IndividualPlanCode } from '@/lib/subscription-change-policy';

export type SubscriptionPriceOption = {
  planId: 'teacher' | 'teacher-pro';
  planCode: IndividualPlanCode;
  billingPeriod: BillingPeriod;
  currency: 'czk' | 'eur' | 'usd';
  amount: number;
  priceId: string;
};

export type LiveSubscriptionManagementState =
  | {
      kind: 'none';
    }
  | {
      kind: 'active';
      planId: 'teacher' | 'teacher-pro';
      planCode: IndividualPlanCode;
      billingPeriod: BillingPeriod;
      currency: 'czk' | 'eur' | 'usd';
      status: string;
      cancelAtPeriodEnd: boolean;
      currentPeriodEnd: string;
      billingCountry: string | null;
      paymentIssue: boolean;
      pendingUpdate: boolean;
      scheduledChange: {
        planId: 'teacher' | 'teacher-pro';
        planCode: IndividualPlanCode;
        billingPeriod: BillingPeriod;
        effectiveAt: string;
      } | null;
      prices: SubscriptionPriceOption[];
    };

export async function getLiveSubscriptionManagementState(userId: string): Promise<LiveSubscriptionManagementState> {
  const secretKey = process.env.STRIPE_SECRET_KEY_LIVE;
  if (!secretKey || !/^(?:sk|rk)_live_/.test(secretKey)) throw new Error('live_billing_not_configured');

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

  if (subscriptionError) throw new Error('billing_subscription_lookup_failed');
  if (!dbSubscription?.external_subscription_id || !dbSubscription.external_customer_id) return { kind: 'none' };

  const subscription = await retrieveStripeSubscription(secretKey, dbSubscription.external_subscription_id);
  if (subscriptionCustomerId(subscription) !== dbSubscription.external_customer_id) {
    throw new Error('billing_customer_mismatch');
  }

  const item = singleSubscriptionItem(subscription);
  const currentPriceId = item.price?.id;
  const currentPeriodEnd = item.current_period_end;
  if (!currentPriceId || !currentPeriodEnd) throw new Error('subscription_state_invalid');

  const { data: currentPriceRow, error: currentPriceError } = await admin
    .from('billing_prices')
    .select('plan_code, billing_period, currency')
    .eq('provider', 'stripe')
    .eq('livemode', true)
    .eq('external_price_id', currentPriceId)
    .eq('active', true)
    .maybeSingle();

  if (
    currentPriceError
    || !currentPriceRow
    || (currentPriceRow.plan_code !== 'teacher' && currentPriceRow.plan_code !== 'teacher_pro')
    || (currentPriceRow.billing_period !== 'monthly' && currentPriceRow.billing_period !== 'annual')
    || (currentPriceRow.currency !== 'czk' && currentPriceRow.currency !== 'eur' && currentPriceRow.currency !== 'usd')
  ) {
    throw new Error('current_billing_price_unsupported');
  }

  const planCode = currentPriceRow.plan_code as IndividualPlanCode;
  const billingPeriod = currentPriceRow.billing_period as BillingPeriod;
  const currency = currentPriceRow.currency as 'czk' | 'eur' | 'usd';

  const { data: priceRows, error: pricesError } = await admin
    .from('billing_prices')
    .select('plan_code, billing_period, currency, external_price_id')
    .eq('provider', 'stripe')
    .eq('livemode', true)
    .eq('currency', currency)
    .in('plan_code', ['teacher', 'teacher_pro'])
    .in('billing_period', ['monthly', 'annual'])
    .eq('active', true);

  if (pricesError) throw new Error('billing_prices_lookup_failed');

  const prices: SubscriptionPriceOption[] = [];
  for (const row of priceRows ?? []) {
    if (
      (row.plan_code !== 'teacher' && row.plan_code !== 'teacher_pro')
      || (row.billing_period !== 'monthly' && row.billing_period !== 'annual')
      || !row.external_price_id
    ) continue;

    const stripePrice = await retrieveStripePrice(secretKey, row.external_price_id);
    const expectedInterval = row.billing_period === 'annual' ? 'year' : 'month';
    if (
      stripePrice.currency?.toLowerCase() !== currency
      || stripePrice.recurring?.interval !== expectedInterval
      || typeof stripePrice.unit_amount !== 'number'
    ) {
      throw new Error('stripe_price_catalog_mismatch');
    }

    prices.push({
      planId: publicPlanId(row.plan_code as IndividualPlanCode),
      planCode: row.plan_code as IndividualPlanCode,
      billingPeriod: row.billing_period as BillingPeriod,
      currency,
      amount: stripePrice.unit_amount,
      priceId: row.external_price_id,
    });
  }

  const scheduleId = subscriptionScheduleId(subscription);
  let scheduledChange: Extract<LiveSubscriptionManagementState, { kind: 'active' }>['scheduledChange'] = null;
  if (scheduleId) {
    const schedule = await retrieveStripeSchedule(secretKey, scheduleId);
    const target = managedScheduleTarget(schedule, userId);
    if (target) {
      scheduledChange = {
        planId: publicPlanId(target.planCode),
        planCode: target.planCode,
        billingPeriod: target.billingPeriod,
        effectiveAt: new Date(target.effectiveAt * 1000).toISOString(),
      };
    }
  }

  const billingCountry = subscription.metadata?.syllonaut_billing_country?.toUpperCase() ?? null;

  return {
    kind: 'active',
    planId: publicPlanId(planCode),
    planCode,
    billingPeriod,
    currency,
    status: subscription.status ?? 'unknown',
    cancelAtPeriodEnd: subscription.cancel_at_period_end === true,
    currentPeriodEnd: new Date(currentPeriodEnd * 1000).toISOString(),
    billingCountry: billingCountry && /^[A-Z]{2}$/.test(billingCountry) ? billingCountry : null,
    paymentIssue: subscription.status === 'past_due',
    pendingUpdate: Boolean(subscription.pending_update),
    scheduledChange,
    prices,
  };
}
