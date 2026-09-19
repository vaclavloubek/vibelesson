type StripePortalSessionResponse = {
  id?: string;
  url?: string | null;
  error?: { message?: string; type?: string; code?: string };
};

export class StripePortalApiError extends Error {
  readonly stripeType: string | null;
  readonly stripeCode: string | null;
  readonly stripeMessage: string | null;
  constructor(stripeType: string | null, stripeCode: string | null, stripeMessage: string | null) {
    super('stripe_portal_create_failed');
    this.name = 'StripePortalApiError';
    this.stripeType = stripeType;
    this.stripeCode = stripeCode;
    this.stripeMessage = stripeMessage;
  }
}

function sanitizeStripeMessage(value: string | undefined) {
  if (!value) return null;
  return value.replace(/(?:sk|rk|whsec)_(?:test|live)?_[A-Za-z0-9_]+/g, '[redacted]').slice(0, 280);
}

function hasExpectedStripeSecretMode(value: string | undefined, livemode: boolean): value is string {
  if (!value) return false;
  return livemode ? /^(?:sk|rk)_live_/.test(value) : /^(?:sk|rk)_test_/.test(value);
}

export async function createStripePortalSession(input: { secretKey: string; livemode: boolean; customerId: string }) {
  if (!hasExpectedStripeSecretMode(input.secretKey, input.livemode)) {
    throw new Error(input.livemode ? 'stripe_live_secret_invalid' : 'stripe_test_secret_invalid');
  }
  if (!/^cus_[A-Za-z0-9_]+$/.test(input.customerId)) throw new Error('stripe_customer_id_invalid');

  const environment = input.livemode ? 'live' : 'sandbox';
  const params = new URLSearchParams();
  params.set('customer', input.customerId);
  params.set('return_url', 'https://www.syllonaut.com/pricing?billing_env=' + environment + '&portal=returned');

  const response = await fetch('https://api.stripe.com/v1/billing_portal/sessions', {
    method: 'POST',
    headers: { authorization: 'Bearer ' + input.secretKey, 'content-type': 'application/x-www-form-urlencoded', 'stripe-version': '2026-07-29.dahlia' },
    body: params, cache: 'no-store', signal: AbortSignal.timeout(12_000),
  });
  const payload = await response.json() as StripePortalSessionResponse;
  if (!response.ok) {
    console.error('stripe portal session creation failed', { status: response.status, type: payload.error?.type, code: payload.error?.code, livemode: input.livemode });
    throw new StripePortalApiError(payload.error?.type ?? null, payload.error?.code ?? null, sanitizeStripeMessage(payload.error?.message));
  }
  if (!payload.id?.startsWith('bps_') || !payload.url?.startsWith('https://billing.stripe.com/')) throw new Error('stripe_portal_response_invalid');
  return { id: payload.id, url: payload.url };
}

export async function createStripeSandboxPortalSession(input: { secretKey: string; customerId: string }) {
  return createStripePortalSession({ ...input, livemode: false });
}
