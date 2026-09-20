import { isStripeLiveSecretKey, isStripeSandboxSecretKey } from '@/lib/stripe-checkout';

const STRIPE_VERSION = '2026-07-29.dahlia';

type StripeChargeResponse = {
  id?: string;
  object?: string;
  amount?: number;
  amount_refunded?: number;
  refunded?: boolean;
  payment_intent?: string | { id?: string } | null;
  error?: { type?: string; code?: string; message?: string };
};

export class StripeRefundStateLookupError extends Error {
  readonly stripeCode: string | null;

  constructor(code: string, stripeCode: string | null = null) {
    super(code);
    this.name = 'StripeRefundStateLookupError';
    this.stripeCode = stripeCode;
  }
}

function validKeyForMode(secretKey: string | undefined, livemode: boolean): secretKey is string {
  return livemode ? isStripeLiveSecretKey(secretKey) : isStripeSandboxSecretKey(secretKey);
}

function paymentIntentId(value: string | { id?: string } | null | undefined) {
  if (typeof value === 'string') return value;
  return value?.id ?? null;
}

export async function retrieveStripeChargeRefundState({
  secretKey,
  livemode,
  chargeId,
}: {
  secretKey: string | undefined;
  livemode: boolean;
  chargeId: string;
}) {
  if (!validKeyForMode(secretKey, livemode)) {
    throw new StripeRefundStateLookupError('stripe_refund_state_key_invalid');
  }
  if (!/^ch_[A-Za-z0-9_]+$/.test(chargeId)) {
    throw new StripeRefundStateLookupError('stripe_charge_id_invalid');
  }

  let response: Response;
  try {
    response = await fetch('https://api.stripe.com/v1/charges/' + encodeURIComponent(chargeId), {
      method: 'GET',
      headers: {
        authorization: 'Bearer ' + secretKey,
        'stripe-version': STRIPE_VERSION,
      },
      cache: 'no-store',
      signal: AbortSignal.timeout(12_000),
    });
  } catch {
    throw new StripeRefundStateLookupError('stripe_refund_state_network_error');
  }

  const payload = await response.json().catch(() => null) as StripeChargeResponse | null;
  if (!response.ok || !payload) {
    throw new StripeRefundStateLookupError(
      'stripe_refund_state_api_failed',
      payload?.error?.code ?? null,
    );
  }

  if (payload.object !== 'charge' || payload.id !== chargeId) {
    throw new StripeRefundStateLookupError('stripe_refund_charge_invalid');
  }

  const paymentIntent = paymentIntentId(payload.payment_intent);
  if (!paymentIntent || !/^pi_[A-Za-z0-9_]+$/.test(paymentIntent)) {
    throw new StripeRefundStateLookupError('stripe_refund_payment_intent_invalid');
  }

  if (
    typeof payload.amount !== 'number'
    || !Number.isSafeInteger(payload.amount)
    || payload.amount <= 0
    || typeof payload.amount_refunded !== 'number'
    || !Number.isSafeInteger(payload.amount_refunded)
    || payload.amount_refunded < 0
    || payload.amount_refunded > payload.amount
  ) {
    throw new StripeRefundStateLookupError('stripe_refund_amount_invalid');
  }

  const fullyRefunded = payload.refunded === true;
  if (fullyRefunded !== (payload.amount_refunded >= payload.amount)) {
    throw new StripeRefundStateLookupError('stripe_refund_state_inconsistent');
  }

  return {
    chargeId,
    paymentIntentId: paymentIntent,
    amountTotal: payload.amount,
    amountRefunded: payload.amount_refunded,
    fullyRefunded,
  };
}
