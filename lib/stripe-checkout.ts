import { randomBytes, randomUUID } from 'node:crypto';

export type CreateStripeCheckoutInput = {
  secretKey: string;
  priceId: string;
  userId: string;
  userEmail: string;
  customerId?: string | null;
  billingCountry: string;
  managedPayments: boolean;
  planCode: string;
  billingPeriod: 'monthly' | 'annual';
};

type StripeCheckoutSessionResponse = {
  id?: string;
  url?: string | null;
  error?: {
    message?: string;
    type?: string;
    code?: string;
  };
};

export function isStripeSandboxSecretKey(value: string | undefined): value is string {
  return Boolean(value && /^(?:sk|rk)_test_/.test(value));
}

function randomIntegrationSuffix() {
  const alphabet = 'abcdefghijklmnopqrstuvwxyz';
  const bytes = randomBytes(8);
  return Array.from(bytes, (byte) => alphabet[byte % alphabet.length]).join('');
}

export function buildStripeCheckoutParams(input: Omit<CreateStripeCheckoutInput, 'secretKey'>) {
  const params = new URLSearchParams();
  params.set('mode', 'subscription');
  params.set('line_items[0][price]', input.priceId);
  params.set('line_items[0][quantity]', '1');
  params.set('client_reference_id', input.userId);
  if (input.customerId) {
    params.set('customer', input.customerId);
  } else {
    params.set('customer_email', input.userEmail);
  }
  params.set('billing_address_collection', 'required');
  params.set('submit_type', 'subscribe');
  params.set('managed_payments[enabled]', input.managedPayments ? 'true' : 'false');

  params.set('metadata[syllonaut_user_id]', input.userId);
  params.set('metadata[syllonaut_billing_country]', input.billingCountry);
  params.set('metadata[syllonaut_plan_code]', input.planCode);
  params.set('metadata[syllonaut_billing_period]', input.billingPeriod);

  params.set('subscription_data[metadata][syllonaut_user_id]', input.userId);
  params.set('subscription_data[metadata][syllonaut_billing_country]', input.billingCountry);
  params.set('subscription_data[metadata][syllonaut_plan_code]', input.planCode);
  params.set('subscription_data[metadata][syllonaut_billing_period]', input.billingPeriod);

  params.set(
    'success_url',
    'https://www.syllonaut.com/pricing?checkout=success&session_id={CHECKOUT_SESSION_ID}',
  );
  params.set('cancel_url', 'https://www.syllonaut.com/pricing?checkout=cancelled');
  params.set('integration_identifier', `syllonaut_web_${randomIntegrationSuffix()}`);

  return params;
}

export class StripeCheckoutApiError extends Error {
  readonly stripeType: string | null;
  readonly stripeCode: string | null;
  readonly stripeMessage: string | null;

  constructor(
    stripeType: string | null,
    stripeCode: string | null,
    stripeMessage: string | null,
  ) {
    super('stripe_checkout_create_failed');
    this.name = 'StripeCheckoutApiError';
    this.stripeType = stripeType;
    this.stripeCode = stripeCode;
    this.stripeMessage = stripeMessage;
  }
}

function sanitizeStripeMessage(value: string | undefined) {
  if (!value) return null;
  return value.replace(/(?:sk|rk|whsec)_(?:test|live)?_[A-Za-z0-9_]+/g, '[redacted]').slice(0, 280);
}

export async function createStripeSandboxCheckout(input: CreateStripeCheckoutInput) {
  if (!isStripeSandboxSecretKey(input.secretKey)) {
    throw new Error('stripe_test_secret_invalid');
  }

  const response = await fetch('https://api.stripe.com/v1/checkout/sessions', {
    method: 'POST',
    headers: {
      authorization: `Bearer ${input.secretKey}`,
      'content-type': 'application/x-www-form-urlencoded',
      'idempotency-key': `syllonaut_checkout_${randomUUID()}`,
      'stripe-version': '2026-07-29.dahlia',
    },
    body: buildStripeCheckoutParams(input),
    cache: 'no-store',
    signal: AbortSignal.timeout(12_000),
  });

  const payload = await response.json() as StripeCheckoutSessionResponse;

  if (!response.ok) {
    console.error('stripe checkout session creation failed', {
      status: response.status,
      type: payload.error?.type,
      code: payload.error?.code,
    });
    throw new StripeCheckoutApiError(
      payload.error?.type ?? null,
      payload.error?.code ?? null,
      sanitizeStripeMessage(payload.error?.message),
    );
  }

  if (!payload.id?.startsWith('cs_test_') || !payload.url?.startsWith('https://checkout.stripe.com/')) {
    throw new Error('stripe_checkout_response_invalid');
  }

  return {
    id: payload.id,
    url: payload.url,
  };
}
