import { createHmac, timingSafeEqual } from 'node:crypto';

const SIGNATURE_TOLERANCE_SECONDS = 5 * 60;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const EVENT_ID_RE = /^evt_[A-Za-z0-9_]+$/;
const SUBSCRIPTION_ID_RE = /^sub_[A-Za-z0-9_]+$/;
const CUSTOMER_ID_RE = /^cus_[A-Za-z0-9_]+$/;
const PRICE_ID_RE = /^price_[A-Za-z0-9_]+$/;

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

type StripeWebhookEvent = {
  id: string;
  type: string;
  livemode: boolean;
  data: {
    object: unknown;
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
};

export type StripeSubscriptionSync = {
  eventId: string;
  eventType: string;
  livemode: boolean;
  userId: string;
  customerId: string;
  subscriptionId: string;
  priceId: string;
  merchantOfRecord: boolean;
  status: string;
  cancelAtPeriodEnd: boolean;
  currentPeriodStart: string;
  currentPeriodEnd: string;
  canceledAt: string | null;
  billingCountry: string;
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

  return {
    eventId: event.id,
    eventType: event.type,
    livemode: event.livemode,
    userId,
    customerId,
    subscriptionId,
    priceId,
    merchantOfRecord,
    status,
    cancelAtPeriodEnd: subscription.cancel_at_period_end === true,
    currentPeriodStart,
    currentPeriodEnd,
    canceledAt,
    billingCountry,
  };
}


export function normalizeStripeInvoiceEvent(
  event: StripeWebhookEvent,
): StripeInvoiceEventSync | null {
  if (!SUPPORTED_STRIPE_INVOICE_EVENTS.has(event.type)) return null;
  if (!EVENT_ID_RE.test(event.id)) throw new Error('stripe_event_id_invalid');

  const invoice = objectRecord(event.data.object);
  if (invoice.object !== 'invoice') throw new Error('stripe_invoice_object_invalid');

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

  return {
    eventId: event.id,
    eventType: event.type,
    livemode: event.livemode,
    userId,
    subscriptionId,
  };
}
