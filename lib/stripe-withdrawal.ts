import { isStripeLiveSecretKey } from '@/lib/stripe-checkout';

const STRIPE_VERSION = '2026-07-29.dahlia';

type StripeErrorPayload = {
  error?: { type?: string; code?: string; message?: string };
};

type StripeRefundPayload = {
  id?: string;
  object?: string;
  amount?: number;
  currency?: string;
  status?: string | null;
  payment_intent?: string | { id?: string } | null;
};

type StripeCancelledSubscription = {
  id?: string;
  object?: string;
  status?: string;
  canceled_at?: number | null;
};

export class StripeWithdrawalApiError extends Error {
  readonly stripeType: string | null;
  readonly stripeCode: string | null;
  readonly stripeMessage: string | null;

  constructor(code: string, stripeType: string | null = null, stripeCode: string | null = null, stripeMessage: string | null = null) {
    super(code);
    this.name = 'StripeWithdrawalApiError';
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
  if (!isStripeLiveSecretKey(secretKey)) {
    throw new StripeWithdrawalApiError('stripe_live_secret_invalid');
  }
}

async function stripeRequest<T>({
  secretKey,
  path,
  method,
  body,
  idempotencyKey,
}: {
  secretKey: string;
  path: string;
  method: 'POST' | 'DELETE';
  body?: URLSearchParams;
  idempotencyKey: string;
}): Promise<T> {
  assertLiveKey(secretKey);

  let response: Response;
  try {
    response = await fetch('https://api.stripe.com' + path, {
      method,
      headers: {
        authorization: 'Bearer ' + secretKey,
        'stripe-version': STRIPE_VERSION,
        'idempotency-key': idempotencyKey,
        ...(body ? { 'content-type': 'application/x-www-form-urlencoded' } : {}),
      },
      ...(body ? { body } : {}),
      cache: 'no-store',
      signal: AbortSignal.timeout(12_000),
    });
  } catch {
    throw new StripeWithdrawalApiError('stripe_withdrawal_network_error');
  }

  const payload = await response.json().catch(() => null) as (T & StripeErrorPayload) | null;
  if (!response.ok || !payload) {
    throw new StripeWithdrawalApiError(
      'stripe_withdrawal_api_failed',
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

export async function createStripeWithdrawalRefund(input: {
  secretKey: string | undefined;
  paymentIntentId: string;
  amountMinor: number;
  requestId: string;
}) {
  assertLiveKey(input.secretKey);
  if (!/^pi_[A-Za-z0-9_]+$/.test(input.paymentIntentId)) {
    throw new StripeWithdrawalApiError('stripe_withdrawal_payment_intent_invalid');
  }
  if (!Number.isSafeInteger(input.amountMinor) || input.amountMinor <= 0) {
    throw new StripeWithdrawalApiError('stripe_withdrawal_refund_amount_invalid');
  }
  if (!/^[0-9a-f-]{36}$/i.test(input.requestId)) {
    throw new StripeWithdrawalApiError('stripe_withdrawal_request_id_invalid');
  }

  const body = new URLSearchParams();
  body.set('payment_intent', input.paymentIntentId);
  body.set('amount', String(input.amountMinor));
  body.set('reason', 'requested_by_customer');
  body.set('metadata[syllonaut_withdrawal_request_id]', input.requestId);

  const refund = await stripeRequest<StripeRefundPayload>({
    secretKey: input.secretKey,
    path: '/v1/refunds',
    method: 'POST',
    body,
    idempotencyKey: `syllonaut_withdrawal_refund_${input.requestId}`,
  });

  const paymentIntentId = idOf(refund.payment_intent);
  if (
    refund.object !== 'refund'
    || !refund.id?.startsWith('re_')
    || refund.amount !== input.amountMinor
    || paymentIntentId !== input.paymentIntentId
  ) {
    throw new StripeWithdrawalApiError('stripe_withdrawal_refund_response_invalid');
  }

  return {
    refundId: refund.id,
    amountMinor: refund.amount,
    currency: refund.currency ?? null,
    status: refund.status ?? null,
  };
}

export async function cancelStripeSubscriptionForWithdrawal(input: {
  secretKey: string | undefined;
  subscriptionId: string;
  requestId: string;
}) {
  assertLiveKey(input.secretKey);
  if (!/^sub_[A-Za-z0-9_]+$/.test(input.subscriptionId)) {
    throw new StripeWithdrawalApiError('stripe_withdrawal_subscription_invalid');
  }
  if (!/^[0-9a-f-]{36}$/i.test(input.requestId)) {
    throw new StripeWithdrawalApiError('stripe_withdrawal_request_id_invalid');
  }

  const body = new URLSearchParams();
  body.set('invoice_now', 'false');
  body.set('prorate', 'false');

  const subscription = await stripeRequest<StripeCancelledSubscription>({
    secretKey: input.secretKey,
    path: '/v1/subscriptions/' + encodeURIComponent(input.subscriptionId),
    method: 'DELETE',
    body,
    idempotencyKey: `syllonaut_withdrawal_cancel_${input.requestId}`,
  });

  if (
    subscription.object !== 'subscription'
    || subscription.id !== input.subscriptionId
    || subscription.status !== 'canceled'
  ) {
    throw new StripeWithdrawalApiError('stripe_withdrawal_cancel_response_invalid');
  }

  return {
    subscriptionId: input.subscriptionId,
    canceledAt: subscription.canceled_at
      ? new Date(subscription.canceled_at * 1000).toISOString()
      : new Date().toISOString(),
  };
}
