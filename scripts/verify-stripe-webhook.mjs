import { createHmac } from 'node:crypto';
import { billingRouteForCountry } from '../lib/billing-region.ts';
import {
  normalizeStripeInvoiceEvent,
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
assert(normalized?.currency === 'eur', 'subscription currency should normalize for live checkout-country verification');

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

const invoiceEvent = {
  id: 'evt_invoice001',
  type: 'invoice.payment_failed',
  livemode: false,
  data: {
    object: {
      id: 'in_regression001',
      object: 'invoice',
      parent: {
        type: 'subscription_details',
        subscription_details: {
          subscription: 'sub_regression001',
          metadata: {
            syllonaut_user_id: '123e4567-e89b-42d3-a456-426614174000',
          },
        },
      },
    },
  },
};

const simulatedSubscriptionEvent = {
  ...event,
  id: 'evt_simulated001',
  data: {
    object: {
      id: 'sub_simulated001',
      object: 'subscription',
      test_clock: 'clock_simulation001',
    },
  },
};
assert(
  normalizeStripeSubscriptionEvent(simulatedSubscriptionEvent, billingRouteForCountry) === null,
  'test-clock subscription events must never provision real sandbox mappings',
);

const normalizedInvoice = normalizeStripeInvoiceEvent(invoiceEvent);
assert(normalizedInvoice?.eventType === 'invoice.payment_failed', 'payment failure should normalize');
assert(normalizedInvoice?.subscriptionId === 'sub_regression001', 'invoice should retain subscription ID');

const unrelatedInvoice = structuredClone(invoiceEvent);
unrelatedInvoice.data.object.parent = { type: 'quote_details' };
assert(normalizeStripeInvoiceEvent(unrelatedInvoice) === null, 'non-subscription invoice should be ignored');

console.log('Stripe webhook checks passed.');
