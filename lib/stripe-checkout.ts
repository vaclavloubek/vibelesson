import { randomBytes, randomUUID } from 'node:crypto';

export type StripeBillingEnvironment = 'sandbox' | 'live';

export type CreateStripeCheckoutInput = {
  secretKey: string;
  livemode: boolean;
  priceId: string;
  userId: string;
  userEmail: string;
  customerId?: string | null;
  billingCountry: string;
  managedPayments: boolean;
  planCode: string;
  billingPeriod: 'monthly' | 'annual';
  termsVersion?: string | null;
  termsAcceptedAt?: string | null;
  immediateAccessRequested?: boolean | null;
};

type StripeCheckoutSessionResponse = {
  id?: string;
  url?: string | null;
  error?: { message?: string; type?: string; code?: string };
};

type StripeCheckoutSessionListResponse = {
  data?: Array<{
    id?: string;
    livemode?: boolean;
    mode?: string;
    status?: string;
    subscription?: string | null;
    customer?: string | null;
    client_reference_id?: string | null;
    currency?: string | null;
    managed_payments?: { enabled?: boolean } | null;
    customer_details?: { address?: { country?: string | null } | null } | null;
    metadata?: Record<string, string>;
  }>;
  error?: { message?: string; type?: string; code?: string };
};

export type BillingRouteResolver = (country: string | null | undefined) => {
  currency: 'czk' | 'eur' | 'usd';
  managedPayments: boolean;
};

export function isStripeSandboxSecretKey(value: string | undefined): value is string {
  return Boolean(value && /^(?:sk|rk)_test_/.test(value));
}

export function isStripeLiveSecretKey(value: string | undefined): value is string {
  return Boolean(value && /^(?:sk|rk)_live_/.test(value));
}

function hasExpectedStripeSecretMode(value: string | undefined, livemode: boolean): value is string {
  return livemode ? isStripeLiveSecretKey(value) : isStripeSandboxSecretKey(value);
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
  if (input.customerId) params.set('customer', input.customerId);
  else params.set('customer_email', input.userEmail);
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
  if (input.termsVersion && input.termsAcceptedAt) {
    params.set('metadata[syllonaut_terms_version]', input.termsVersion);
    params.set('metadata[syllonaut_terms_accepted_at]', input.termsAcceptedAt);
    params.set('metadata[syllonaut_immediate_access_requested]', input.immediateAccessRequested ? 'true' : 'false');
    params.set('subscription_data[metadata][syllonaut_terms_version]', input.termsVersion);
    params.set('subscription_data[metadata][syllonaut_terms_accepted_at]', input.termsAcceptedAt);
    params.set('subscription_data[metadata][syllonaut_immediate_access_requested]', input.immediateAccessRequested ? 'true' : 'false');
  }

  const environment = input.livemode ? 'live' : 'sandbox';
  params.set('success_url', 'https://www.syllonaut.com/pricing?checkout=success&billing_env=' + environment + '&session_id={CHECKOUT_SESSION_ID}');
  params.set('cancel_url', 'https://www.syllonaut.com/pricing?checkout=cancelled&billing_env=' + environment);
  params.set('integration_identifier', 'syllonaut_web_' + randomIntegrationSuffix());
  return params;
}

export class StripeCheckoutApiError extends Error {
  readonly stripeType: string | null;
  readonly stripeCode: string | null;
  readonly stripeMessage: string | null;
  constructor(stripeType: string | null, stripeCode: string | null, stripeMessage: string | null) {
    super('stripe_checkout_create_failed');
    this.name = 'StripeCheckoutApiError';
    this.stripeType = stripeType;
    this.stripeCode = stripeCode;
    this.stripeMessage = stripeMessage;
  }
}

export class StripeCheckoutVerificationApiError extends Error {
  readonly stripeType: string | null;
  readonly stripeCode: string | null;
  readonly stripeMessage: string | null;
  constructor(stripeType: string | null, stripeCode: string | null, stripeMessage: string | null) {
    super('stripe_checkout_verification_failed');
    this.name = 'StripeCheckoutVerificationApiError';
    this.stripeType = stripeType;
    this.stripeCode = stripeCode;
    this.stripeMessage = stripeMessage;
  }
}

function sanitizeStripeMessage(value: string | undefined) {
  if (!value) return null;
  return value.replace(/(?:sk|rk|whsec)_(?:test|live)?_[A-Za-z0-9_]+/g, '[redacted]').slice(0, 280);
}

export async function createStripeCheckout(input: CreateStripeCheckoutInput) {
  if (!hasExpectedStripeSecretMode(input.secretKey, input.livemode)) {
    throw new Error(input.livemode ? 'stripe_live_secret_invalid' : 'stripe_test_secret_invalid');
  }
  const response = await fetch('https://api.stripe.com/v1/checkout/sessions', {
    method: 'POST',
    headers: {
      authorization: 'Bearer ' + input.secretKey,
      'content-type': 'application/x-www-form-urlencoded',
      'idempotency-key': 'syllonaut_checkout_' + randomUUID(),
      'stripe-version': '2026-07-29.dahlia',
    },
    body: buildStripeCheckoutParams(input),
    cache: 'no-store',
    signal: AbortSignal.timeout(12_000),
  });
  const payload = await response.json() as StripeCheckoutSessionResponse;
  if (!response.ok) {
    console.error('stripe checkout session creation failed', {
      status: response.status, type: payload.error?.type, code: payload.error?.code, livemode: input.livemode,
    });
    throw new StripeCheckoutApiError(payload.error?.type ?? null, payload.error?.code ?? null, sanitizeStripeMessage(payload.error?.message));
  }
  const expectedPrefix = input.livemode ? 'cs_live_' : 'cs_test_';
  if (!payload.id?.startsWith(expectedPrefix) || !payload.url?.startsWith('https://checkout.stripe.com/')) {
    throw new Error('stripe_checkout_response_invalid');
  }
  return { id: payload.id, url: payload.url };
}

export async function createStripeSandboxCheckout(input: Omit<CreateStripeCheckoutInput, 'livemode'>) {
  return createStripeCheckout({ ...input, livemode: false });
}

export async function verifyStripeCheckoutBillingCountry(
  input: {
    secretKey: string;
    livemode: boolean;
    subscriptionId: string;
    customerId: string;
    userId: string;
    declaredBillingCountry: string;
    expectedCurrency: 'czk' | 'eur' | 'usd';
    expectedManagedPayments: boolean;
  },
  billingRouteForCountry: BillingRouteResolver,
  fetchImpl: typeof fetch = fetch,
) {
  if (!hasExpectedStripeSecretMode(input.secretKey, input.livemode)) {
    throw new Error(input.livemode ? 'stripe_live_secret_invalid' : 'stripe_test_secret_invalid');
  }
  if (!/^sub_[A-Za-z0-9_]+$/.test(input.subscriptionId)) throw new Error('stripe_checkout_subscription_id_invalid');
  if (!/^cus_[A-Za-z0-9_]+$/.test(input.customerId)) throw new Error('stripe_checkout_customer_id_invalid');
  if (!/^[0-9a-f-]{36}$/i.test(input.userId)) throw new Error('stripe_checkout_user_id_invalid');

  const query = new URLSearchParams({ customer: input.customerId, status: 'complete', limit: '20' });
  let matches: NonNullable<StripeCheckoutSessionListResponse['data']> = [];

  for (let attempt = 0; attempt < 3; attempt += 1) {
    const response = await fetchImpl('https://api.stripe.com/v1/checkout/sessions?' + query.toString(), {
      method: 'GET',
      headers: { authorization: 'Bearer ' + input.secretKey, 'stripe-version': '2026-07-29.dahlia' },
      cache: 'no-store',
      signal: AbortSignal.timeout(12_000),
    });
    const payload = await response.json() as StripeCheckoutSessionListResponse;
    if (!response.ok) {
      console.error('stripe checkout billing-country verification failed', {
        status: response.status, type: payload.error?.type, code: payload.error?.code, livemode: input.livemode,
      });
      throw new StripeCheckoutVerificationApiError(payload.error?.type ?? null, payload.error?.code ?? null, sanitizeStripeMessage(payload.error?.message));
    }
    if (!Array.isArray(payload.data)) throw new Error('stripe_checkout_session_list_invalid');

    matches = payload.data.filter((session) => (
      session.livemode === input.livemode
      && session.mode === 'subscription'
      && session.status === 'complete'
      && session.subscription === input.subscriptionId
      && session.customer === input.customerId
      && session.client_reference_id === input.userId
      && session.metadata?.syllonaut_user_id === input.userId
      && session.metadata?.syllonaut_billing_country === input.declaredBillingCountry
    ));

    if (matches.length > 0) break;
    if (attempt < 2) {
      await new Promise((resolve) => setTimeout(resolve, 250 * (attempt + 1)));
    }
  }

  if (matches.length !== 1) {
    throw new Error(matches.length === 0 ? 'stripe_checkout_completed_session_missing' : 'stripe_checkout_completed_session_ambiguous');
  }

  const session = matches[0];
  const actualCountry = session.customer_details?.address?.country?.trim().toUpperCase() ?? '';
  if (!/^[A-Z]{2}$/.test(actualCountry)) throw new Error('stripe_checkout_actual_billing_country_missing');

  const sessionCurrency = session.currency?.toLowerCase() ?? '';
  if (sessionCurrency !== input.expectedCurrency) throw new Error('stripe_checkout_currency_mismatch');
  const sessionManagedPayments = session.managed_payments?.enabled === true;
  if (sessionManagedPayments !== input.expectedManagedPayments) throw new Error('stripe_checkout_managed_payments_mismatch');

  const actualRoute = billingRouteForCountry(actualCountry);
  if (actualRoute.currency !== input.expectedCurrency || actualRoute.managedPayments !== input.expectedManagedPayments) {
    throw new Error('stripe_checkout_actual_country_route_mismatch');
  }

  return { billingCountry: actualCountry, checkoutSessionId: session.id ?? null };
}
