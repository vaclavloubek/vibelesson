import { createHmac, timingSafeEqual } from 'node:crypto';

const SIGNATURE_TOLERANCE_SECONDS = 5 * 60;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const EVENT_ID_RE = /^evt_[A-Za-z0-9_]+$/;
const SUBSCRIPTION_ID_RE = /^sub_[A-Za-z0-9_]+$/;
const CUSTOMER_ID_RE = /^cus_[A-Za-z0-9_]+$/;
const PRICE_ID_RE = /^price_[A-Za-z0-9_]+$/;
const INVOICE_ID_RE = /^in_[A-Za-z0-9_]+$/;
const PAYMENT_INTENT_ID_RE = /^pi_[A-Za-z0-9_]+$/;
const DISPUTE_ID_RE = /^d[pu]_[A-Za-z0-9_]+$/;
const CHARGE_ID_RE = /^ch_[A-Za-z0-9_]+$/;

export const SUPPORTED_STRIPE_SUBSCRIPTION_EVENTS = new Set([
  'customer.subscription.created',
  'customer.subscription.updated',
  'customer.subscription.deleted',
  'customer.subscription.paused',
  'customer.subscription.resumed',
]);

export const SUPPORTED_STRIPE_INVOICE_EVENTS = new Set([
  'invoice.payment_failed',
  'invoice.paid',
]);

export const SUPPORTED_STRIPE_DISPUTE_EVENTS = new Set([
  'charge.dispute.created',
  'charge.dispute.closed',
  'charge.dispute.funds_withdrawn',
  'charge.dispute.funds_reinstated',
]);

export const SUPPORTED_STRIPE_REFUND_EVENTS = new Set([
  'charge.refunded',
  'refund.created',
  'refund.updated',
  'refund.failed',
]);

type StripeWebhookEvent = {
  id: string;
  type: string;
  livemode: boolean;
  created?: number;
  data: {
    object: unknown;
    previous_attributes?: unknown;
  };
};

type SecretCandidate = {
  value: string;
  livemode: boolean | null;
};

export type StripeInvoiceEventSync = {
  eventId: string;
  eventType: 'invoice.payment_failed' | 'invoice.paid';
  livemode: boolean;
  userId: string;
  subscriptionId: string;
  invoiceId: string;
  paidAt: string | null;
  amountPaid: number;
  currency: 'czk' | 'eur' | 'usd';
  billingReason: string;
  testClock: boolean;
};

export type StripeDisputeEventSync = {
  eventId: string;
  eventType:
    | 'charge.dispute.created'
    | 'charge.dispute.closed'
    | 'charge.dispute.funds_withdrawn'
    | 'charge.dispute.funds_reinstated';
  livemode: boolean;
  disputeId: string;
  paymentIntentId: string;
  status: string;
  amountDisputed: number;
  currency: 'czk' | 'eur' | 'usd';
  eventAt: string;
};

export type StripeRefundEventSync = {
  eventId: string;
  eventType: 'charge.refunded' | 'refund.created' | 'refund.updated' | 'refund.failed';
  livemode: boolean;
  chargeId: string;
  eventAt: string;
};

export type StripeSubscriptionSync = {
  eventId: string;
  eventType: string;
  livemode: boolean;
  userId: string;
  customerId: string;
  subscriptionId: string;
  priceId: string;
  currency: 'czk' | 'eur' | 'usd';
  merchantOfRecord: boolean;
  status: string;
  cancelAtPeriodEnd: boolean;
  currentPeriodStart: string;
  currentPeriodEnd: string;
  canceledAt: string | null;
  billingCountry: string;
  previousStatus: string | null;
  previousCancelAtPeriodEnd: boolean | null;
  contractSnapshotId: string | null;
  checkoutSessionId: string | null;
};

function splitSecrets(value: string | undefined) {
  return (value ?? '')
    .split(',')
    .map((secret) => secret.trim())
    .filter(Boolean);
}

export function configuredStripeWebhookSecrets(): SecretCandidate[] {
  const candidates: SecretCandidate[] = [];

  for (const value of splitSecrets(process.env.STRIPE_WEBHOOK_SECRET_TEST)) {
    candidates.push({ value, livemode: false });
  }
  for (const value of splitSecrets(process.env.STRIPE_WEBHOOK_SECRET_LIVE)) {
    candidates.push({ value, livemode: true });
  }
  for (const value of splitSecrets(process.env.STRIPE_WEBHOOK_SECRET)) {
    candidates.push({ value, livemode: null });
  }

  const seen = new Set<string>();
  return candidates.filter(({ value, livemode }) => {
    const key = `${livemode === null ? 'any' : livemode ? 'live' : 'test'}:${value}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function parseStripeSignatureHeader(header: string) {
  let timestamp: number | null = null;
  const signatures: string[] = [];

  for (const part of header.split(',')) {
    const separator = part.indexOf('=');
    if (separator <= 0) continue;
    const key = part.slice(0, separator).trim();
    const value = part.slice(separator + 1).trim();

    if (key === 't' && /^\d+$/.test(value)) {
      timestamp = Number(value);
    } else if (key === 'v1' && /^[0-9a-f]{64}$/i.test(value)) {
      signatures.push(value.toLowerCase());
    }
  }

  return { timestamp, signatures };
}

function constantTimeHexEqual(left: string, right: string) {
  if (left.length !== right.length) return false;
  try {
    return timingSafeEqual(Buffer.from(left, 'hex'), Buffer.from(right, 'hex'));
  } catch {
    return false;
  }
}

export function verifyStripeWebhook(
  rawBody: string,
  signatureHeader: string,
  secrets: SecretCandidate[],
  nowSeconds = Math.floor(Date.now() / 1000),
): StripeWebhookEvent {
  if (secrets.length === 0) {
    throw new Error('stripe_webhook_secret_missing');
  }

  const { timestamp, signatures } = parseStripeSignatureHeader(signatureHeader);
  if (!timestamp || signatures.length === 0) {
    throw new Error('stripe_signature_malformed');
  }

  if (Math.abs(nowSeconds - timestamp) > SIGNATURE_TOLERANCE_SECONDS) {
    throw new Error('stripe_signature_stale');
  }

  const signedPayload = `${timestamp}.${rawBody}`;
  let matchedLivemode: boolean | null | undefined;

  for (const candidate of secrets) {
    const expected = createHmac('sha256', candidate.value).update(signedPayload, 'utf8').digest('hex');
    if (signatures.some((signature) => constantTimeHexEqual(signature, expected))) {
      matchedLivemode = candidate.livemode;
      break;
    }
  }

  if (matchedLivemode === undefined) {
    throw new Error('stripe_signature_invalid');
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(rawBody);
  } catch {
    throw new Error('stripe_payload_invalid_json');
  }

  if (!parsed || typeof parsed !== 'object') {
    throw new Error('stripe_payload_invalid');
  }

  const event = parsed as Partial<StripeWebhookEvent>;
  if (
    typeof event.id !== 'string'
    || typeof event.type !== 'string'
    || typeof event.livemode !== 'boolean'
    || !event.data
    || typeof event.data !== 'object'
  ) {
    throw new Error('stripe_event_invalid');
  }

  if (matchedLivemode !== null && event.livemode !== matchedLivemode) {
    throw new Error('stripe_secret_mode_mismatch');
  }

  return event as StripeWebhookEvent;
}

function objectRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('stripe_subscription_invalid');
  }
  return value as Record<string, unknown>;
}

function optionalObjectRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function stringField(value: unknown, pattern: RegExp, errorCode: string) {
  if (typeof value !== 'string' || !pattern.test(value)) throw new Error(errorCode);
  return value;
}

function unixSecondsToIso(value: unknown, errorCode: string) {
  if (typeof value !== 'number' || !Number.isInteger(value) || value <= 0) {
    throw new Error(errorCode);
  }
  const date = new Date(value * 1000);
  if (Number.isNaN(date.getTime())) throw new Error(errorCode);
  return date.toISOString();
}

export type BillingRouteResolver = (country: string | null | undefined) => {
  currency: 'czk' | 'eur' | 'usd';
  managedPayments: boolean;
};

export function normalizeStripeSubscriptionEvent(
  event: StripeWebhookEvent,
  billingRouteForCountry: BillingRouteResolver,
): StripeSubscriptionSync | null {
  if (!SUPPORTED_STRIPE_SUBSCRIPTION_EVENTS.has(event.type)) return null;
  if (!EVENT_ID_RE.test(event.id)) throw new Error('stripe_event_id_invalid');

  const subscription = objectRecord(event.data.object);
  if (subscription.object !== 'subscription') throw new Error('stripe_subscription_object_invalid');

  // Stripe Billing simulations/test clocks create isolated Customer + Subscription copies.
  // Never let those copies mutate real sandbox billing_customer/subscription mappings.
  if (
    event.livemode === false
    && typeof subscription.test_clock === 'string'
    && /^clock_[A-Za-z0-9_]+$/.test(subscription.test_clock)
  ) {
    return null;
  }

  const subscriptionId = stringField(subscription.id, SUBSCRIPTION_ID_RE, 'stripe_subscription_id_invalid');

  const customerValue = subscription.customer;
  const customerId = typeof customerValue === 'string'
    ? stringField(customerValue, CUSTOMER_ID_RE, 'stripe_customer_id_invalid')
    : stringField(objectRecord(customerValue).id, CUSTOMER_ID_RE, 'stripe_customer_id_invalid');

  const metadata = objectRecord(subscription.metadata ?? {});
  const userId = stringField(metadata.syllonaut_user_id, UUID_RE, 'stripe_user_metadata_invalid');
  const billingCountry = typeof metadata.syllonaut_billing_country === 'string'
    ? metadata.syllonaut_billing_country.trim().toUpperCase()
    : '';
  if (!/^[A-Z]{2}$/.test(billingCountry)) throw new Error('stripe_billing_country_metadata_invalid');

  const contractSnapshotId = metadata.syllonaut_contract_snapshot_id === undefined
    ? null
    : stringField(metadata.syllonaut_contract_snapshot_id, UUID_RE, 'stripe_contract_snapshot_metadata_invalid');

  const items = objectRecord(subscription.items);
  const itemData = items.data;
  if (!Array.isArray(itemData) || itemData.length !== 1) {
    throw new Error('stripe_subscription_item_count_invalid');
  }

  const item = objectRecord(itemData[0]);
  const price = objectRecord(item.price);
  const priceId = stringField(price.id, PRICE_ID_RE, 'stripe_price_id_invalid');
  const currency = typeof price.currency === 'string' ? price.currency.toLowerCase() : '';
  if (!['czk', 'eur', 'usd'].includes(currency)) throw new Error('stripe_price_currency_invalid');

  const route = billingRouteForCountry(billingCountry);
  if (route.currency !== currency) throw new Error('stripe_billing_currency_route_mismatch');

  const managedPayments = objectRecord(subscription.managed_payments ?? {});
  const merchantOfRecord = managedPayments.enabled === true;
  if (merchantOfRecord !== route.managedPayments) {
    throw new Error('stripe_managed_payments_route_mismatch');
  }

  const status = typeof subscription.status === 'string' ? subscription.status : '';
  if (![
    'trialing', 'active', 'past_due', 'unpaid', 'canceled',
    'incomplete', 'incomplete_expired', 'paused',
  ].includes(status)) {
    throw new Error('stripe_subscription_status_invalid');
  }

  const currentPeriodStart = unixSecondsToIso(item.current_period_start, 'stripe_period_start_invalid');
  const currentPeriodEnd = unixSecondsToIso(item.current_period_end, 'stripe_period_end_invalid');
  if (currentPeriodEnd <= currentPeriodStart) throw new Error('stripe_period_invalid');

  let canceledAt: string | null = null;
  if (subscription.canceled_at !== null && subscription.canceled_at !== undefined) {
    canceledAt = unixSecondsToIso(subscription.canceled_at, 'stripe_canceled_at_invalid');
  }

  const previousAttributes = optionalObjectRecord(event.data.previous_attributes);
  const previousStatus = previousAttributes && typeof previousAttributes.status === 'string'
    ? previousAttributes.status
    : null;
  const previousCancelAtPeriodEnd = previousAttributes && typeof previousAttributes.cancel_at_period_end === 'boolean'
    ? previousAttributes.cancel_at_period_end
    : null;

  return {
    eventId: event.id,
    eventType: event.type,
    livemode: event.livemode,
    userId,
    customerId,
    subscriptionId,
    priceId,
    currency: currency as 'czk' | 'eur' | 'usd',
    merchantOfRecord,
    status,
    cancelAtPeriodEnd: subscription.cancel_at_period_end === true,
    currentPeriodStart,
    currentPeriodEnd,
    canceledAt,
    billingCountry,
    previousStatus,
    previousCancelAtPeriodEnd,
    contractSnapshotId,
    checkoutSessionId: null,
  };
}


export function normalizeStripeInvoiceEvent(
  event: StripeWebhookEvent,
): StripeInvoiceEventSync | null {
  if (!SUPPORTED_STRIPE_INVOICE_EVENTS.has(event.type)) return null;
  if (!EVENT_ID_RE.test(event.id)) throw new Error('stripe_event_id_invalid');

  const invoice = objectRecord(event.data.object);
  if (invoice.object !== 'invoice') throw new Error('stripe_invoice_object_invalid');

  const invoiceId = stringField(
    invoice.id,
    INVOICE_ID_RE,
    'stripe_invoice_id_invalid',
  );

  const parent = invoice.parent;
  if (!parent || typeof parent !== 'object' || Array.isArray(parent)) return null;
  const parentRecord = parent as Record<string, unknown>;
  if (parentRecord.type !== 'subscription_details') return null;

  const subscriptionDetails = objectRecord(parentRecord.subscription_details);
  const subscriptionId = stringField(
    subscriptionDetails.subscription,
    SUBSCRIPTION_ID_RE,
    'stripe_invoice_subscription_id_invalid',
  );

  const metadata = objectRecord(subscriptionDetails.metadata ?? {});
  if (typeof metadata.syllonaut_user_id !== 'string') return null;
  const userId = stringField(
    metadata.syllonaut_user_id,
    UUID_RE,
    'stripe_invoice_user_metadata_invalid',
  );

  if (event.type !== 'invoice.payment_failed' && event.type !== 'invoice.paid') {
    return null;
  }

  const amountPaid = invoice.amount_paid;
  if (typeof amountPaid !== 'number' || !Number.isSafeInteger(amountPaid) || amountPaid < 0) {
    throw new Error('stripe_invoice_amount_paid_invalid');
  }

  const currency = typeof invoice.currency === 'string' ? invoice.currency.toLowerCase() : '';
  if (!['czk', 'eur', 'usd'].includes(currency)) {
    throw new Error('stripe_invoice_currency_invalid');
  }

  const billingReason = typeof invoice.billing_reason === 'string'
    ? invoice.billing_reason.trim().toLowerCase()
    : '';
  if (!/^[a-z0-9_]{1,64}$/.test(billingReason)) {
    throw new Error('stripe_invoice_billing_reason_invalid');
  }

  const testClock = (
    event.livemode === false
    && typeof invoice.test_clock === 'string'
    && /^clock_[A-Za-z0-9_]+$/.test(invoice.test_clock)
  );

  let paidAt: string | null = null;
  if (event.type === 'invoice.paid') {
    const transitions = optionalObjectRecord(invoice.status_transitions);
    if (transitions?.paid_at !== null && transitions?.paid_at !== undefined) {
      paidAt = unixSecondsToIso(transitions.paid_at, 'stripe_invoice_paid_at_invalid');
    } else if (event.created !== undefined) {
      paidAt = unixSecondsToIso(event.created, 'stripe_invoice_event_created_invalid');
    } else {
      throw new Error('stripe_invoice_paid_at_missing');
    }
  }

  return {
    eventId: event.id,
    eventType: event.type,
    livemode: event.livemode,
    userId,
    subscriptionId,
    invoiceId,
    paidAt,
    amountPaid,
    currency: currency as 'czk' | 'eur' | 'usd',
    billingReason,
    testClock,
  };
}

export type StripeUpcomingInvoiceEventSync = {
  eventId: string;
  livemode: boolean;
  subscriptionId: string;
};

// invoice.upcoming carries an invoice preview without an id, so it cannot go
// through normalizeStripeInvoiceEvent. Only the subscription is needed; its
// owner and plan come from billing_subscriptions.
export function normalizeStripeUpcomingInvoiceEvent(
  event: StripeWebhookEvent,
): StripeUpcomingInvoiceEventSync | null {
  if (event.type !== 'invoice.upcoming') return null;
  if (!EVENT_ID_RE.test(event.id)) throw new Error('stripe_event_id_invalid');

  const invoice = objectRecord(event.data.object);
  if (invoice.object !== 'invoice') throw new Error('stripe_invoice_object_invalid');

  const parent = optionalObjectRecord(invoice.parent);
  if (!parent || parent.type !== 'subscription_details') return null;

  const subscriptionDetails = objectRecord(parent.subscription_details);
  const subscriptionId = stringField(
    subscriptionDetails.subscription,
    SUBSCRIPTION_ID_RE,
    'stripe_invoice_subscription_id_invalid',
  );

  return {
    eventId: event.id,
    livemode: event.livemode,
    subscriptionId,
  };
}

export function normalizeStripeDisputeEvent(
  event: StripeWebhookEvent,
): StripeDisputeEventSync | null {
  if (!SUPPORTED_STRIPE_DISPUTE_EVENTS.has(event.type)) return null;
  if (!EVENT_ID_RE.test(event.id)) throw new Error('stripe_event_id_invalid');

  const dispute = objectRecord(event.data.object);
  if (dispute.object !== 'dispute') throw new Error('stripe_dispute_object_invalid');

  const disputeId = stringField(dispute.id, DISPUTE_ID_RE, 'stripe_dispute_id_invalid');
  const paymentIntentValue = dispute.payment_intent;
  const paymentIntentId = typeof paymentIntentValue === 'string'
    ? stringField(paymentIntentValue, PAYMENT_INTENT_ID_RE, 'stripe_dispute_payment_intent_invalid')
    : stringField(
        objectRecord(paymentIntentValue).id,
        PAYMENT_INTENT_ID_RE,
        'stripe_dispute_payment_intent_invalid',
      );

  const status = typeof dispute.status === 'string' ? dispute.status.trim() : '';
  if (status.length < 1 || status.length > 64) {
    throw new Error('stripe_dispute_status_invalid');
  }

  const amountDisputed = dispute.amount;
  if (typeof amountDisputed !== 'number' || !Number.isSafeInteger(amountDisputed) || amountDisputed <= 0) {
    throw new Error('stripe_dispute_amount_invalid');
  }

  const currency = typeof dispute.currency === 'string' ? dispute.currency.toLowerCase() : '';
  if (!['czk', 'eur', 'usd'].includes(currency)) {
    throw new Error('stripe_dispute_currency_invalid');
  }

  const eventAt = unixSecondsToIso(event.created, 'stripe_dispute_event_created_invalid');

  return {
    eventId: event.id,
    eventType: event.type as StripeDisputeEventSync['eventType'],
    livemode: event.livemode,
    disputeId,
    paymentIntentId,
    status,
    amountDisputed,
    currency: currency as 'czk' | 'eur' | 'usd',
    eventAt,
  };
}


export function normalizeStripeRefundEvent(
  event: StripeWebhookEvent,
): StripeRefundEventSync | null {
  if (!SUPPORTED_STRIPE_REFUND_EVENTS.has(event.type)) return null;
  if (!EVENT_ID_RE.test(event.id)) throw new Error('stripe_event_id_invalid');

  const value = objectRecord(event.data.object);
  let chargeId: string;

  if (event.type === 'charge.refunded') {
    if (value.object !== 'charge') throw new Error('stripe_refund_charge_object_invalid');
    chargeId = stringField(value.id, CHARGE_ID_RE, 'stripe_refund_charge_id_invalid');
  } else {
    if (value.object !== 'refund') throw new Error('stripe_refund_object_invalid');
    const chargeValue = value.charge;
    if (typeof chargeValue === 'string') {
      chargeId = stringField(chargeValue, CHARGE_ID_RE, 'stripe_refund_charge_id_invalid');
    } else {
      chargeId = stringField(
        objectRecord(chargeValue).id,
        CHARGE_ID_RE,
        'stripe_refund_charge_id_invalid',
      );
    }
  }

  const eventAt = unixSecondsToIso(event.created, 'stripe_refund_event_created_invalid');

  return {
    eventId: event.id,
    eventType: event.type as StripeRefundEventSync['eventType'],
    livemode: event.livemode,
    chargeId,
    eventAt,
  };
}


export type StripeOrganizationInvoiceEventSync = {
  eventId: string;
  eventType: 'invoice.payment_failed' | 'invoice.paid';
  livemode: boolean;
  organizationId: string;
  orderId: string;
  invoiceId: string;
  amountPaid: number;
  currency: 'czk' | 'eur' | 'usd';
  billingReason: string;
  billingCountry: string;
  testClock: boolean;
};

export type StripeOrganizationSubscriptionEventSync = {
  eventId: string;
  eventType: string;
  livemode: boolean;
  organizationId: string;
  orderId: string;
  subscriptionId: string;
  status: string;
};

function organizationMetadataFromInvoice(invoice: Record<string, unknown>) {
  const directMetadata = optionalObjectRecord(invoice.metadata) ?? {};
  if (
    typeof directMetadata.syllonaut_organization_id === 'string'
    || typeof directMetadata.syllonaut_order_id === 'string'
  ) {
    return directMetadata;
  }

  const parent = optionalObjectRecord(invoice.parent);
  if (!parent || parent.type !== 'subscription_details') return null;
  const subscriptionDetails = optionalObjectRecord(parent.subscription_details);
  if (!subscriptionDetails) return null;
  return optionalObjectRecord(subscriptionDetails.metadata) ?? null;
}

export function normalizeStripeOrganizationInvoiceEvent(
  event: StripeWebhookEvent,
): StripeOrganizationInvoiceEventSync | null {
  if (!SUPPORTED_STRIPE_INVOICE_EVENTS.has(event.type)) return null;
  if (!EVENT_ID_RE.test(event.id)) throw new Error('stripe_event_id_invalid');

  const invoice = objectRecord(event.data.object);
  if (invoice.object !== 'invoice') throw new Error('stripe_invoice_object_invalid');

  const metadata = organizationMetadataFromInvoice(invoice);
  if (!metadata || typeof metadata.syllonaut_organization_id !== 'string') {
    return null;
  }

  const organizationId = stringField(
    metadata.syllonaut_organization_id,
    UUID_RE,
    'stripe_organization_metadata_invalid',
  );
  const orderId = stringField(
    metadata.syllonaut_order_id,
    UUID_RE,
    'stripe_organization_order_metadata_invalid',
  );

  const invoiceId = stringField(
    invoice.id,
    /^in_[A-Za-z0-9_]+$/,
    'stripe_organization_invoice_id_invalid',
  );
  const amountPaid = invoice.amount_paid;
  if (typeof amountPaid !== 'number' || !Number.isSafeInteger(amountPaid) || amountPaid < 0) {
    throw new Error('stripe_organization_invoice_amount_paid_invalid');
  }

  const currency = typeof invoice.currency === 'string'
    ? invoice.currency.toLowerCase()
    : '';
  if (!['czk', 'eur', 'usd'].includes(currency)) {
    throw new Error('stripe_organization_invoice_currency_invalid');
  }

  const billingReason = typeof invoice.billing_reason === 'string'
    ? invoice.billing_reason.trim().toLowerCase()
    : '';
  if (!/^[a-z0-9_]{1,64}$/.test(billingReason)) {
    throw new Error('stripe_organization_invoice_billing_reason_invalid');
  }

  const testClock = (
    event.livemode === false
    && typeof invoice.test_clock === 'string'
    && /^clock_[A-Za-z0-9_]+$/.test(invoice.test_clock)
  );

  const customerAddress = optionalObjectRecord(invoice.customer_address);
  const billingCountry = typeof customerAddress?.country === 'string'
    ? customerAddress.country.trim().toUpperCase()
    : '';
  if (!/^[A-Z]{2}$/.test(billingCountry)) {
    throw new Error('stripe_organization_invoice_country_invalid');
  }

  if (event.type !== 'invoice.payment_failed' && event.type !== 'invoice.paid') {
    return null;
  }

  return {
    eventId: event.id,
    eventType: event.type,
    livemode: event.livemode,
    organizationId,
    orderId,
    invoiceId,
    amountPaid,
    currency: currency as 'czk' | 'eur' | 'usd',
    billingReason,
    billingCountry,
    testClock,
  };
}

export function normalizeStripeOrganizationSubscriptionEvent(
  event: StripeWebhookEvent,
): StripeOrganizationSubscriptionEventSync | null {
  if (!SUPPORTED_STRIPE_SUBSCRIPTION_EVENTS.has(event.type)) return null;
  if (!EVENT_ID_RE.test(event.id)) throw new Error('stripe_event_id_invalid');

  const subscription = objectRecord(event.data.object);
  if (subscription.object !== 'subscription') {
    throw new Error('stripe_subscription_object_invalid');
  }

  const metadata = optionalObjectRecord(subscription.metadata) ?? {};
  if (typeof metadata.syllonaut_organization_id !== 'string') return null;

  const organizationId = stringField(
    metadata.syllonaut_organization_id,
    UUID_RE,
    'stripe_organization_metadata_invalid',
  );
  const orderId = stringField(
    metadata.syllonaut_order_id,
    UUID_RE,
    'stripe_organization_order_metadata_invalid',
  );
  const subscriptionId = stringField(
    subscription.id,
    SUBSCRIPTION_ID_RE,
    'stripe_subscription_id_invalid',
  );

  const status = typeof subscription.status === 'string' ? subscription.status : '';
  if (![
    'trialing', 'active', 'past_due', 'unpaid', 'canceled',
    'incomplete', 'incomplete_expired', 'paused',
  ].includes(status)) {
    throw new Error('stripe_subscription_status_invalid');
  }

  return {
    eventId: event.id,
    eventType: event.type,
    livemode: event.livemode,
    organizationId,
    orderId,
    subscriptionId,
    status,
  };
}

export const SUPPORTED_STRIPE_TOPUP_CHECKOUT_EVENTS = new Set([
  'checkout.session.completed',
  'checkout.session.async_payment_succeeded',
]);

export type StripeTopupCheckoutSync = {
  eventId: string;
  eventType: 'checkout.session.completed' | 'checkout.session.async_payment_succeeded';
  livemode: boolean;
  checkoutSessionId: string;
  paymentIntentId: string;
  customerId: string | null;
  userId: string;
  packCode: 'grading_60' | 'grading_100' | 'grading_200';
  currency: 'czk' | 'eur' | 'usd';
  // Price before any Managed Payments tax, compared with the contract snapshot.
  amountSubtotal: number;
  contractSnapshotId: string;
  paidAt: string;
};

const CHECKOUT_SESSION_ID_RE = /^cs_(test|live)_[A-Za-z0-9_]+$/;
const TOPUP_PACK_CODES = new Set(['grading_60', 'grading_100', 'grading_200']);

// AI grading suggestion packs (mode=payment). Returns null for any other
// Checkout Session, including subscription checkouts, so unrelated or
// unassigned events never reach the subscription path as errors. A completed
// session that is not paid yet (delayed methods) is also null; the grant then
// comes with checkout.session.async_payment_succeeded.
export function normalizeStripeTopupCheckoutEvent(
  event: StripeWebhookEvent,
): StripeTopupCheckoutSync | null {
  if (!SUPPORTED_STRIPE_TOPUP_CHECKOUT_EVENTS.has(event.type)) return null;
  const session = optionalObjectRecord(event.data.object);
  if (!session || session.object !== 'checkout.session') return null;
  const metadata = optionalObjectRecord(session.metadata);
  if (!metadata || metadata.syllonaut_purchase_kind !== 'ai_grading_topup') return null;
  if (session.mode !== 'payment') throw new Error('stripe_topup_mode_invalid');
  if (session.payment_status !== 'paid') return null;
  if (!EVENT_ID_RE.test(event.id)) throw new Error('stripe_event_id_invalid');

  const checkoutSessionId = stringField(session.id, CHECKOUT_SESSION_ID_RE, 'stripe_topup_session_id_invalid');
  if ((event.livemode && !checkoutSessionId.startsWith('cs_live_')) || (!event.livemode && !checkoutSessionId.startsWith('cs_test_'))) {
    throw new Error('stripe_topup_session_mode_mismatch');
  }
  const paymentIntentValue = session.payment_intent;
  const paymentIntentId = typeof paymentIntentValue === 'string'
    ? stringField(paymentIntentValue, PAYMENT_INTENT_ID_RE, 'stripe_topup_payment_intent_invalid')
    : stringField(objectRecord(paymentIntentValue).id, PAYMENT_INTENT_ID_RE, 'stripe_topup_payment_intent_invalid');
  const customerValue = session.customer;
  const customerId = customerValue === null || customerValue === undefined
    ? null
    : typeof customerValue === 'string'
      ? stringField(customerValue, CUSTOMER_ID_RE, 'stripe_topup_customer_invalid')
      : stringField(objectRecord(customerValue).id, CUSTOMER_ID_RE, 'stripe_topup_customer_invalid');
  const userId = stringField(metadata.syllonaut_user_id, UUID_RE, 'stripe_topup_user_metadata_invalid');
  if (session.client_reference_id !== userId) throw new Error('stripe_topup_client_reference_mismatch');
  const packCode = typeof metadata.syllonaut_pack_code === 'string' ? metadata.syllonaut_pack_code : '';
  if (!TOPUP_PACK_CODES.has(packCode)) throw new Error('stripe_topup_pack_invalid');
  const contractSnapshotId = stringField(metadata.syllonaut_contract_snapshot_id, UUID_RE, 'stripe_topup_snapshot_metadata_invalid');
  const currency = typeof session.currency === 'string' ? session.currency.toLowerCase() : '';
  if (!['czk', 'eur', 'usd'].includes(currency)) throw new Error('stripe_topup_currency_invalid');
  const amountSubtotal = session.amount_subtotal;
  if (typeof amountSubtotal !== 'number' || !Number.isSafeInteger(amountSubtotal) || amountSubtotal <= 0) {
    throw new Error('stripe_topup_amount_invalid');
  }
  const paidAt = unixSecondsToIso(event.created, 'stripe_topup_event_created_invalid');

  return {
    eventId: event.id,
    eventType: event.type as StripeTopupCheckoutSync['eventType'],
    livemode: event.livemode,
    checkoutSessionId,
    paymentIntentId,
    customerId,
    userId,
    packCode: packCode as StripeTopupCheckoutSync['packCode'],
    currency: currency as StripeTopupCheckoutSync['currency'],
    amountSubtotal,
    contractSnapshotId,
    paidAt,
  };
}
