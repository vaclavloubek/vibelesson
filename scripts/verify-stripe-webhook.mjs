import { createHmac } from 'node:crypto';
import { billingRouteForCountry } from '../lib/billing-region.ts';
import {
  normalizeStripeDisputeEvent,
  normalizeStripeInvoiceEvent,
  normalizeStripeOrganizationInvoiceEvent,
  normalizeStripeRefundEvent,
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
assert(normalized?.contractSnapshotId === '423e4567-e89b-42d3-a456-426614174000', 'contract snapshot ID must survive subscription normalization');

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
  created: now,
  data: {
    object: {
      id: 'in_regression001',
      object: 'invoice',
      test_clock: null,
      amount_paid: 0,
      currency: 'czk',
      billing_reason: 'subscription_cycle',
      status_transitions: { paid_at: null },
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
assert(normalizedInvoice?.invoiceId === 'in_regression001', 'invoice ID should normalize');
assert(normalizedInvoice?.paidAt === null, 'failed invoice should not create a payment mapping timestamp');
assert(normalizedInvoice?.testClock === false, 'ordinary sandbox invoice should not look like a test-clock copy');

const paidInvoice = structuredClone(invoiceEvent);
paidInvoice.id = 'evt_invoice_paid001';
paidInvoice.type = 'invoice.paid';
paidInvoice.data.object.amount_paid = 19900;
paidInvoice.data.object.status_transitions.paid_at = now - 5;
const normalizedPaidInvoice = normalizeStripeInvoiceEvent(paidInvoice);
assert(normalizedPaidInvoice?.paidAt === new Date((now - 5) * 1000).toISOString(), 'paid invoice must retain its paid timestamp');
assert(normalizedPaidInvoice?.amountPaid === 19900, 'paid invoice must retain amount_paid');
assert(normalizedPaidInvoice?.currency === 'czk', 'paid invoice must retain currency');
assert(normalizedPaidInvoice?.billingReason === 'subscription_cycle', 'paid invoice must retain billing_reason');

const testClockInvoice = structuredClone(paidInvoice);
testClockInvoice.data.object.test_clock = 'clock_regression001';
assert(normalizeStripeInvoiceEvent(testClockInvoice)?.testClock === true, 'sandbox test-clock invoices must be detectable');

const organizationInvoice = structuredClone(paidInvoice);
organizationInvoice.id = 'evt_org_invoice_paid001';
organizationInvoice.data.object.id = 'in_org_regression001';
organizationInvoice.data.object.metadata = {
  syllonaut_organization_id: '223e4567-e89b-42d3-a456-426614174000',
  syllonaut_order_id: '323e4567-e89b-42d3-a456-426614174000',
};
organizationInvoice.data.object.customer_address = { country: 'CZ' };
const normalizedOrganizationInvoice = normalizeStripeOrganizationInvoiceEvent(organizationInvoice);
assert(normalizedOrganizationInvoice?.organizationId === '223e4567-e89b-42d3-a456-426614174000', 'organization invoice must retain organization ID');
assert(normalizedOrganizationInvoice?.orderId === '323e4567-e89b-42d3-a456-426614174000', 'organization invoice must retain order ID');
assert(normalizedOrganizationInvoice?.amountPaid === 19900, 'organization invoice must retain amount_paid');
assert(normalizedOrganizationInvoice?.currency === 'czk', 'organization invoice must retain currency');
assert(normalizedOrganizationInvoice?.billingReason === 'subscription_cycle', 'organization invoice must retain billing reason');
assert(normalizedOrganizationInvoice?.testClock === false, 'ordinary organization invoice should not look like test clock');

const disputeEvent = {
  id: 'evt_dispute001',
  type: 'charge.dispute.created',
  livemode: false,
  created: now,
  data: {
    object: {
      id: 'dp_regression001',
      object: 'dispute',
      payment_intent: 'pi_regression001',
      status: 'needs_response',
      amount: 5000,
      currency: 'czk',
    },
  },
};
const normalizedDispute = normalizeStripeDisputeEvent(disputeEvent);
assert(normalizedDispute?.disputeId === 'dp_regression001', 'dispute ID should normalize');
assert(normalizedDispute?.paymentIntentId === 'pi_regression001', 'dispute must retain the payment intent');
assert(normalizedDispute?.status === 'needs_response', 'dispute status should normalize');
assert(normalizedDispute?.amountDisputed === 5000, 'dispute amount should normalize');
assert(normalizedDispute?.currency === 'czk', 'dispute currency should normalize');
assert(normalizedDispute?.eventAt === new Date(now * 1000).toISOString(), 'dispute event timestamp should normalize');

const wonDispute = structuredClone(disputeEvent);
wonDispute.id = 'evt_dispute_closed001';
wonDispute.type = 'charge.dispute.closed';
wonDispute.data.object.status = 'won';
assert(normalizeStripeDisputeEvent(wonDispute)?.status === 'won', 'won dispute should normalize');

const unrelatedDispute = structuredClone(disputeEvent);
unrelatedDispute.type = 'charge.succeeded';
assert(normalizeStripeDisputeEvent(unrelatedDispute) === null, 'unsupported charge event should be ignored');

const refundedChargeEvent = {
  id: 'evt_refund_charge001',
  type: 'charge.refunded',
  livemode: false,
  created: now,
  data: {
    object: {
      id: 'ch_regression001',
      object: 'charge',
      amount: 1000,
      amount_refunded: 1000,
      refunded: true,
      payment_intent: 'pi_regression001',
    },
  },
};
const normalizedRefundedCharge = normalizeStripeRefundEvent(refundedChargeEvent);
assert(normalizedRefundedCharge?.chargeId === 'ch_regression001', 'charge.refunded must retain charge ID');
assert(normalizedRefundedCharge?.eventType === 'charge.refunded', 'charge.refunded must normalize');

const refundFailedEvent = {
  id: 'evt_refund_failed001',
  type: 'refund.failed',
  livemode: false,
  created: now,
  data: {
    object: {
      id: 're_regression001',
      object: 'refund',
      charge: 'ch_regression001',
      payment_intent: 'pi_regression001',
      status: 'failed',
    },
  },
};
assert(normalizeStripeRefundEvent(refundFailedEvent)?.chargeId === 'ch_regression001', 'refund.failed must retain parent charge ID');

const unrelatedInvoice = structuredClone(invoiceEvent);
unrelatedInvoice.data.object.parent = { type: 'quote_details' };
assert(normalizeStripeInvoiceEvent(unrelatedInvoice) === null, 'non-subscription invoice should be ignored');

console.log('Stripe webhook checks passed.');
