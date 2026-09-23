import { createAdminClient } from '@/lib/supabase/admin';
import { assertApprovedNeonCutover, getDatabaseBackend } from '@/lib/neon/config';
import { createNeonSql } from '@/lib/neon/server';
import {
  managedScheduleTarget,
  retrieveStripeSchedule,
  retrieveStripeSubscription,
  singleSubscriptionItem,
  subscriptionCustomerId,
  subscriptionScheduleId,
} from '@/lib/stripe-subscription-management';
import { individualMinorUnitPrice } from '@/lib/individual-billing-catalog';
import { publicPlanId, type BillingPeriod, type IndividualPlanCode } from '@/lib/subscription-change-policy';
import { getIndividualAiBillingPauseReason, type AiBillingPauseReason } from '@/lib/individual-ai-billing';

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
      kind: 'admin';
    }
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
      aiBillingPauseReason: AiBillingPauseReason | null;
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
  const neonBackend = getDatabaseBackend() === 'neon';
  if (neonBackend) assertApprovedNeonCutover();
  const sql = neonBackend ? createNeonSql() : null;
  const admin = neonBackend ? null : createAdminClient();

  let profile: { role: string | null } | null;
  if (sql) {
    const rows = await sql`select role from public.profiles where id = ${userId}::uuid limit 1`;
    profile = (rows[0] as { role: string | null } | undefined) ?? null;
  } else {
    const { data, error } = await admin!
      .from('profiles')
      .select('role')
      .eq('id', userId)
      .maybeSingle();
    if (error) throw new Error('profile_lookup_failed');
    profile = data;
  }
  if (profile?.role === 'admin') return { kind: 'admin' };

  const secretKey = process.env.STRIPE_SECRET_KEY_LIVE;
  if (!secretKey || !/^(?:sk|rk)_live_/.test(secretKey)) throw new Error('live_billing_not_configured');

  let dbSubscription: { external_subscription_id: string | null; external_customer_id: string | null } | null;
  if (sql) {
    const rows = await sql`
      select external_subscription_id, external_customer_id
      from public.billing_subscriptions
      where user_id = ${userId}::uuid
        and provider = 'stripe'
        and livemode = true
        and status in ('trialing', 'active', 'past_due')
      order by updated_at desc
      limit 1
    `;
    dbSubscription = (rows[0] as typeof dbSubscription | undefined) ?? null;
  } else {
    const { data, error } = await admin!
      .from('billing_subscriptions')
      .select('external_subscription_id, external_customer_id')
      .eq('user_id', userId)
      .eq('provider', 'stripe')
      .eq('livemode', true)
      .in('status', ['trialing', 'active', 'past_due'])
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) throw new Error('billing_subscription_lookup_failed');
    dbSubscription = data;
  }
  if (!dbSubscription?.external_subscription_id || !dbSubscription.external_customer_id) return { kind: 'none' };

  const subscription = await retrieveStripeSubscription(secretKey, dbSubscription.external_subscription_id);
  if (subscriptionCustomerId(subscription) !== dbSubscription.external_customer_id) {
    throw new Error('billing_customer_mismatch');
  }

  if (!['trialing', 'active', 'past_due'].includes(subscription.status ?? '')) {
    return { kind: 'none' };
  }

  const item = singleSubscriptionItem(subscription);
  const currentPriceId = item.price?.id;
  const currentPeriodEnd = item.current_period_end;
  if (!currentPriceId || !currentPeriodEnd) throw new Error('subscription_state_invalid');

  let currentPriceRow: { plan_code: string; billing_period: string; currency: string } | null;
  let currentPriceError = false;
  if (sql) {
    const rows = await sql`
      select plan_code, billing_period, currency
      from public.billing_prices
      where provider = 'stripe' and livemode = true
        and external_price_id = ${currentPriceId} and active = true
      limit 1
    `;
    currentPriceRow = (rows[0] as typeof currentPriceRow | undefined) ?? null;
  } else {
    const { data, error } = await admin!
      .from('billing_prices')
      .select('plan_code, billing_period, currency')
      .eq('provider', 'stripe')
      .eq('livemode', true)
      .eq('external_price_id', currentPriceId)
      .eq('active', true)
      .maybeSingle();
    currentPriceRow = data;
    currentPriceError = Boolean(error);
  }

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

  let priceRows: Array<{ plan_code: string; billing_period: string; currency: string; external_price_id: string | null }>;
  if (sql) {
    const rows = await sql`
      select plan_code, billing_period, currency, external_price_id
      from public.billing_prices
      where provider = 'stripe' and livemode = true and currency = ${currency}
        and plan_code in ('teacher', 'teacher_pro')
        and billing_period in ('monthly', 'annual') and active = true
    `;
    priceRows = rows as typeof priceRows;
  } else {
    const { data, error } = await admin!
      .from('billing_prices')
      .select('plan_code, billing_period, currency, external_price_id')
      .eq('provider', 'stripe')
      .eq('livemode', true)
      .eq('currency', currency)
      .in('plan_code', ['teacher', 'teacher_pro'])
      .in('billing_period', ['monthly', 'annual'])
      .eq('active', true);
    if (error) throw new Error('billing_prices_lookup_failed');
    priceRows = data ?? [];
  }

  const prices: SubscriptionPriceOption[] = [];
  for (const row of priceRows ?? []) {
    if (
      (row.plan_code !== 'teacher' && row.plan_code !== 'teacher_pro')
      || (row.billing_period !== 'monthly' && row.billing_period !== 'annual')
      || !row.external_price_id
    ) continue;

    const rowPlan = row.plan_code as IndividualPlanCode;
    const rowPeriod = row.billing_period as BillingPeriod;
    prices.push({
      planId: publicPlanId(rowPlan),
      planCode: rowPlan,
      billingPeriod: rowPeriod,
      currency,
      amount: individualMinorUnitPrice(rowPlan, rowPeriod, currency),
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
  const aiBillingPauseReason = await getIndividualAiBillingPauseReason(userId);

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
    aiBillingPauseReason,
    pendingUpdate: Boolean(subscription.pending_update),
    scheduledChange,
    prices,
  };
}
