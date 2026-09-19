import { randomUUID } from 'node:crypto';
import type { BillingPeriod, IndividualPlanCode } from '@/lib/subscription-change-policy';

const STRIPE_VERSION = '2026-07-29.dahlia';

type StripeErrorPayload = {
  error?: { type?: string; code?: string; message?: string };
};

export type StripeSubscriptionItem = {
  id?: string;
  quantity?: number | null;
  current_period_start?: number | null;
  current_period_end?: number | null;
  price?: {
    id?: string;
    currency?: string;
    unit_amount?: number | null;
    recurring?: { interval?: string | null } | null;
  } | null;
};

export type StripeSubscription = {
  id?: string;
  customer?: string | { id?: string } | null;
  status?: string;
  cancel_at_period_end?: boolean;
  schedule?: string | { id?: string } | null;
  pending_update?: Record<string, unknown> | null;
  latest_invoice?: string | { id?: string } | null;
  metadata?: Record<string, string>;
  items?: { data?: StripeSubscriptionItem[] };
};

export type StripeSchedulePhase = {
  start_date?: number;
  end_date?: number;
  items?: Array<{
    price?: string | { id?: string };
    quantity?: number | null;
  }>;
  metadata?: Record<string, string>;
};

export type StripeSubscriptionSchedule = {
  id?: string;
  status?: string;
  subscription?: string | { id?: string } | null;
  metadata?: Record<string, string>;
  phases?: StripeSchedulePhase[];
};

export type StripePrice = {
  id?: string;
  currency?: string;
  unit_amount?: number | null;
  recurring?: { interval?: string | null } | null;
};

type StripeInvoice = {
  id?: string;
  hosted_invoice_url?: string | null;
  status?: string | null;
};

export class StripeSubscriptionManagementError extends Error {
  readonly stripeType: string | null;
  readonly stripeCode: string | null;
  readonly stripeMessage: string | null;

  constructor(code: string, stripeType: string | null = null, stripeCode: string | null = null, stripeMessage: string | null = null) {
    super(code);
    this.name = 'StripeSubscriptionManagementError';
    this.stripeType = stripeType;
    this.stripeCode = stripeCode;
    this.stripeMessage = stripeMessage;
  }
}

function sanitizeStripeMessage(value: string | undefined) {
  if (!value) return null;
  return value.replace(/(?:sk|rk|whsec)_(?:test|live)?_[A-Za-z0-9_]+/g, '[redacted]').slice(0, 280);
}

function assertLiveKey(secretKey: string | undefined): asserts secretKey is string {
  if (!secretKey || !/^(?:sk|rk)_live_/.test(secretKey)) {
    throw new StripeSubscriptionManagementError('stripe_live_secret_invalid');
  }
}

async function stripeJson<T>({
  secretKey,
  path,
  method = 'GET',
  body,
  idempotencyKey,
}: {
  secretKey: string;
  path: string;
  method?: 'GET' | 'POST';
  body?: URLSearchParams;
  idempotencyKey?: string;
}): Promise<T> {
  assertLiveKey(secretKey);

  let response: Response;
  try {
    response = await fetch('https://api.stripe.com' + path, {
      method,
      headers: {
        authorization: 'Bearer ' + secretKey,
        'stripe-version': STRIPE_VERSION,
        ...(body ? { 'content-type': 'application/x-www-form-urlencoded' } : {}),
        ...(idempotencyKey ? { 'idempotency-key': idempotencyKey } : {}),
      },
      ...(body ? { body } : {}),
      cache: 'no-store',
      signal: AbortSignal.timeout(12_000),
    });
  } catch {
    throw new StripeSubscriptionManagementError('stripe_subscription_network_error');
  }

  const payload = await response.json().catch(() => null) as (T & StripeErrorPayload) | null;
  if (!response.ok || !payload) {
    throw new StripeSubscriptionManagementError(
      'stripe_subscription_api_failed',
      payload?.error?.type ?? null,
      payload?.error?.code ?? null,
      sanitizeStripeMessage(payload?.error?.message),
    );
  }

  return payload as T;
}

function idOf(value: string | { id?: string } | null | undefined) {
  if (typeof value === 'string') return value;
  return value?.id ?? null;
}

export function subscriptionCustomerId(subscription: StripeSubscription) {
  return idOf(subscription.customer);
}

export function subscriptionScheduleId(subscription: StripeSubscription) {
  return idOf(subscription.schedule);
}

export function subscriptionLatestInvoiceId(subscription: StripeSubscription) {
  return idOf(subscription.latest_invoice);
}

export function singleSubscriptionItem(subscription: StripeSubscription) {
  const items = subscription.items?.data ?? [];
  if (items.length !== 1) throw new StripeSubscriptionManagementError('subscription_item_shape_unsupported');
  const item = items[0];
  if (!item?.id?.startsWith('si_') || !item.price?.id?.startsWith('price_')) {
    throw new StripeSubscriptionManagementError('subscription_item_invalid');
  }
  return item;
}

export async function retrieveStripeSubscription(secretKey: string, subscriptionId: string) {
  if (!/^sub_[A-Za-z0-9_]+$/.test(subscriptionId)) throw new StripeSubscriptionManagementError('subscription_id_invalid');
  return stripeJson<StripeSubscription>({ secretKey, path: '/v1/subscriptions/' + encodeURIComponent(subscriptionId) });
}

export async function retrieveStripeSchedule(secretKey: string, scheduleId: string) {
  if (!/^sub_sched_[A-Za-z0-9_]+$/.test(scheduleId)) throw new StripeSubscriptionManagementError('schedule_id_invalid');
  return stripeJson<StripeSubscriptionSchedule>({ secretKey, path: '/v1/subscription_schedules/' + encodeURIComponent(scheduleId) });
}

export async function retrieveStripePrice(secretKey: string, priceId: string) {
  if (!/^price_[A-Za-z0-9_]+$/.test(priceId)) throw new StripeSubscriptionManagementError('price_id_invalid');
  return stripeJson<StripePrice>({ secretKey, path: '/v1/prices/' + encodeURIComponent(priceId) });
}

export async function retrieveStripeInvoice(secretKey: string, invoiceId: string) {
  if (!/^in_[A-Za-z0-9_]+$/.test(invoiceId)) return null;
  return stripeJson<StripeInvoice>({ secretKey, path: '/v1/invoices/' + encodeURIComponent(invoiceId) });
}

export function buildImmediateUpgradeParams({
  itemId,
  targetPriceId,
  userId,
  planCode,
  billingPeriod,
}: {
  itemId: string;
  targetPriceId: string;
  userId: string;
  planCode: IndividualPlanCode;
  billingPeriod: BillingPeriod;
}) {
  const params = new URLSearchParams();
  params.set('items[0][id]', itemId);
  params.set('items[0][price]', targetPriceId);
  params.set('items[0][quantity]', '1');
  params.set('proration_behavior', 'always_invoice');
  params.set('payment_behavior', 'pending_if_incomplete');
  params.set('metadata[syllonaut_user_id]', userId);
  params.set('metadata[syllonaut_plan_code]', planCode);
  params.set('metadata[syllonaut_billing_period]', billingPeriod);
  return params;
}

export async function applyImmediateStripeUpgrade({
  secretKey,
  subscriptionId,
  itemId,
  targetPriceId,
  userId,
  planCode,
  billingPeriod,
  idempotencyScope,
}: {
  secretKey: string;
  subscriptionId: string;
  itemId: string;
  targetPriceId: string;
  userId: string;
  planCode: IndividualPlanCode;
  billingPeriod: BillingPeriod;
  idempotencyScope: string;
}) {
  const body = buildImmediateUpgradeParams({ itemId, targetPriceId, userId, planCode, billingPeriod });
  return stripeJson<StripeSubscription>({
    secretKey,
    path: '/v1/subscriptions/' + encodeURIComponent(subscriptionId),
    method: 'POST',
    body,
    idempotencyKey: 'syllonaut_upgrade_' + idempotencyScope,
  });
}

export function buildScheduleCreateParams({
  subscriptionId,
  userId,
  targetPlan,
  targetPeriod,
  targetPriceId,
  effectiveAt,
}: {
  subscriptionId: string;
  userId: string;
  targetPlan: IndividualPlanCode;
  targetPeriod: BillingPeriod;
  targetPriceId: string;
  effectiveAt: number;
}) {
  const params = new URLSearchParams();
  params.set('from_subscription', subscriptionId);
  params.set('metadata[syllonaut_managed_change]', 'true');
  params.set('metadata[syllonaut_user_id]', userId);
  params.set('metadata[syllonaut_target_plan_code]', targetPlan);
  params.set('metadata[syllonaut_target_billing_period]', targetPeriod);
  params.set('metadata[syllonaut_target_price_id]', targetPriceId);
  params.set('metadata[syllonaut_effective_at]', String(effectiveAt));
  return params;
}

export async function createStripeChangeSchedule(input: {
  secretKey: string;
  subscriptionId: string;
  userId: string;
  targetPlan: IndividualPlanCode;
  targetPeriod: BillingPeriod;
  targetPriceId: string;
  effectiveAt: number;
  idempotencyScope: string;
}) {
  const body = buildScheduleCreateParams(input);
  return stripeJson<StripeSubscriptionSchedule>({
    secretKey: input.secretKey,
    path: '/v1/subscription_schedules',
    method: 'POST',
    body,
    idempotencyKey: 'syllonaut_schedule_create_' + input.idempotencyScope,
  });
}

export function buildScheduleUpdateParams({
  currentPhaseStart,
  effectiveAt,
  currentPriceId,
  targetPriceId,
  targetPeriod,
  userId,
  billingCountry,
  targetPlan,
}: {
  currentPhaseStart: number;
  effectiveAt: number;
  currentPriceId: string;
  targetPriceId: string;
  targetPeriod: BillingPeriod;
  userId: string;
  billingCountry: string;
  targetPlan: IndividualPlanCode;
}) {
  const params = new URLSearchParams();
  params.set('end_behavior', 'release');

  params.set('phases[0][start_date]', String(currentPhaseStart));
  params.set('phases[0][end_date]', String(effectiveAt));
  params.set('phases[0][items][0][price]', currentPriceId);
  params.set('phases[0][items][0][quantity]', '1');
  params.set('phases[0][proration_behavior]', 'none');

  params.set('phases[1][start_date]', String(effectiveAt));
  params.set('phases[1][duration][interval]', targetPeriod === 'annual' ? 'year' : 'month');
  params.set('phases[1][duration][interval_count]', '1');
  params.set('phases[1][items][0][price]', targetPriceId);
  params.set('phases[1][items][0][quantity]', '1');
  params.set('phases[1][proration_behavior]', 'none');
  params.set('phases[1][metadata][syllonaut_user_id]', userId);
  params.set('phases[1][metadata][syllonaut_billing_country]', billingCountry);
  params.set('phases[1][metadata][syllonaut_plan_code]', targetPlan);
  params.set('phases[1][metadata][syllonaut_billing_period]', targetPeriod);

  return params;
}

export async function updateStripeChangeSchedule({
  secretKey,
  scheduleId,
  currentPhaseStart,
  effectiveAt,
  currentPriceId,
  targetPriceId,
  targetPeriod,
  userId,
  billingCountry,
  targetPlan,
  idempotencyScope,
}: {
  secretKey: string;
  scheduleId: string;
  currentPhaseStart: number;
  effectiveAt: number;
  currentPriceId: string;
  targetPriceId: string;
  targetPeriod: BillingPeriod;
  userId: string;
  billingCountry: string;
  targetPlan: IndividualPlanCode;
  idempotencyScope: string;
}) {
  const body = buildScheduleUpdateParams({
    currentPhaseStart,
    effectiveAt,
    currentPriceId,
    targetPriceId,
    targetPeriod,
    userId,
    billingCountry,
    targetPlan,
  });
  return stripeJson<StripeSubscriptionSchedule>({
    secretKey,
    path: '/v1/subscription_schedules/' + encodeURIComponent(scheduleId),
    method: 'POST',
    body,
    idempotencyKey: 'syllonaut_schedule_update_' + idempotencyScope,
  });
}

export async function releaseStripeChangeSchedule({
  secretKey,
  scheduleId,
  idempotencyScope = randomUUID(),
}: {
  secretKey: string;
  scheduleId: string;
  idempotencyScope?: string;
}) {
  return stripeJson<StripeSubscriptionSchedule>({
    secretKey,
    path: '/v1/subscription_schedules/' + encodeURIComponent(scheduleId) + '/release',
    method: 'POST',
    body: new URLSearchParams(),
    idempotencyKey: 'syllonaut_schedule_release_' + idempotencyScope,
  });
}

export function managedScheduleTarget(schedule: StripeSubscriptionSchedule, userId: string) {
  const metadata = schedule.metadata ?? {};
  if (metadata.syllonaut_managed_change !== 'true' || metadata.syllonaut_user_id !== userId) return null;
  const targetPlan = metadata.syllonaut_target_plan_code;
  const targetPeriod = metadata.syllonaut_target_billing_period;
  const targetPriceId = metadata.syllonaut_target_price_id;
  const effectiveAt = Number(metadata.syllonaut_effective_at);

  if (
    (targetPlan !== 'teacher' && targetPlan !== 'teacher_pro')
    || (targetPeriod !== 'monthly' && targetPeriod !== 'annual')
    || !/^price_[A-Za-z0-9_]+$/.test(targetPriceId ?? '')
    || !Number.isFinite(effectiveAt)
  ) {
    return null;
  }

  return {
    planCode: targetPlan as IndividualPlanCode,
    billingPeriod: targetPeriod as BillingPeriod,
    priceId: targetPriceId,
    effectiveAt,
  };
}
