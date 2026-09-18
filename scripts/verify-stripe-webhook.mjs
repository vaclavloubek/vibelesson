import { createHmac } from 'node:crypto';
import { billingRouteForCountry } from '../lib/billing-region.ts';
import {
  normalizeStripeSubscriptionEvent,
  verifyStripeWebhook,
} from '../lib/stripe-webhook.ts';

const secret = 'whsec_test_regression_only';
const now = 1_800_000_000;

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function sign(body, timestamp = now, signingSecret = secret) {
  const signature = createHmac('sha256', signingSecret)
    .update(`${timestamp}.${body}`, 'utf8')
    .digest('hex');
  return `t=${timestamp},v1=${signature}`;
}

const event = {
  id: 'evt_regression001',
  type: 'customer.subscription.updated',
  livemode: false,
  data: {
    object: {
      id: 'sub_regression001',
      object: 'subscription',
      customer: 'cus_regression001',
      metadata: {
        syllonaut_user_id: '123e4567-e89b-42d3-a456-426614174000',
        syllonaut_billing_country: 'DE',
      },
      managed_payments: { enabled: true },
      status: 'active',
      cancel_at_period_end: false,
      canceled_at: null,
      items: {
        data: [{
          price: { id: 'price_regression001', currency: 'eur' },
          current_period_start: 1_799_900_000,
          current_period_end: 1_802_500_000,
        }],
      },
    },
  },
};

const body = JSON.stringify(event);
const verified = verifyStripeWebhook(
  body,
  sign(body),
  [{ value: secret, livemode: false }],
  now,
);
assert(verified.id === event.id, 'valid Stripe signature should verify');

const normalized = normalizeStripeSubscriptionEvent(verified, billingRouteForCountry);
assert(normalized?.billingCountry === 'DE', 'DE billing country should survive normalization');
assert(normalized?.merchantOfRecord === true, 'DE must require Managed Payments');
assert(normalized?.priceId === 'price_regression001', 'price should normalize');

let wrongSecretRejected = false;
try {
  verifyStripeWebhook(body, sign(body), [{ value: 'whsec_wrong', livemode: false }], now);
} catch {
  wrongSecretRejected = true;
}
assert(wrongSecretRejected, 'wrong webhook secret must be rejected');

let staleRejected = false;
try {
  verifyStripeWebhook(body, sign(body, now - 301), [{ value: secret, livemode: false }], now);
} catch {
  staleRejected = true;
}
assert(staleRejected, 'stale webhook signature must be rejected');

let modeMismatchRejected = false;
try {
  verifyStripeWebhook(body, sign(body), [{ value: secret, livemode: true }], now);
} catch {
  modeMismatchRejected = true;
}
assert(modeMismatchRejected, 'test secret must not authorize a live-mode binding');

const wrongRoute = structuredClone(event);
wrongRoute.data.object.managed_payments.enabled = false;
let routingRejected = false;
try {
  normalizeStripeSubscriptionEvent(wrongRoute, billingRouteForCountry);
} catch {
  routingRejected = true;
}
assert(routingRejected, 'foreign subscription without Managed Payments must be rejected');

const cz = structuredClone(event);
cz.data.object.metadata.syllonaut_billing_country = 'CZ';
cz.data.object.managed_payments.enabled = false;
cz.data.object.items.data[0].price.currency = 'czk';
assert(
  normalizeStripeSubscriptionEvent(cz, billingRouteForCountry)?.merchantOfRecord === false,
  'CZ subscription must use standard Stripe',
);

console.log('Stripe webhook checks passed.');
