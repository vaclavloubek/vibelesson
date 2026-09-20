import type { BillingCurrency } from '@/lib/billing-region';
import type {
  OrganizationBillingPeriod,
  OrganizationPlanCode,
} from '@/lib/organization-billing-catalog';

const STRIPE_VERSION = '2026-07-29.dahlia';

type StripeErrorPayload = {
  error?: { type?: string; code?: string; message?: string };
};

type StripeCustomerPayload = StripeErrorPayload & { id?: string };
type StripeCheckoutPayload = StripeErrorPayload & { id?: string; url?: string | null };
type StripeInvoicePayload = StripeErrorPayload & {
  id?: string;
  hosted_invoice_url?: string | null;
  invoice_pdf?: string | null;
};
type StripeInvoiceItemPayload = StripeErrorPayload & { id?: string };

export class OrganizationStripeError extends Error {
  constructor(
    readonly code: string,
    readonly stripeType?: string | null,
    readonly stripeCode?: string | null,
  ) {
    super(code);
    this.name = 'OrganizationStripeError';
  }
}

function expectedSecret(secretKey: string, livemode: boolean) {
  return livemode
    ? /^(?:sk|rk)_live_/.test(secretKey)
    : /^(?:sk|rk)_test_/.test(secretKey);
}

async function stripePost<T extends StripeErrorPayload>(
  secretKey: string,
  path: string,
  params: URLSearchParams,
  idempotencyKey: string,
): Promise<T> {
  const response = await fetch('https://api.stripe.com' + path, {
    method: 'POST',
    headers: {
      authorization: 'Bearer ' + secretKey,
      'content-type': 'application/x-www-form-urlencoded',
      'idempotency-key': idempotencyKey,
      'stripe-version': STRIPE_VERSION,
    },
    body: params,
    cache: 'no-store',
    signal: AbortSignal.timeout(12_000),
  });

  const payload = await response.json().catch(() => ({})) as T;
  if (!response.ok) {
    throw new OrganizationStripeError(
      'stripe_request_failed',
      payload.error?.type ?? null,
      payload.error?.code ?? null,
    );
  }
  return payload;
}

export async function createOrganizationStripeCustomer(input: {
  secretKey: string;
  livemode: boolean;
  organizationId: string;
  orderId: string;
  name: string;
  legalName?: string | null;
  billingEmail: string;
  billingCountry: string;
  address: {
    line1?: string;
    line2?: string;
    city?: string;
    postalCode?: string;
  };
}) {
  if (!expectedSecret(input.secretKey, input.livemode)) {
    throw new OrganizationStripeError('stripe_secret_mode_invalid');
  }

  const params = new URLSearchParams();
  params.set('email', input.billingEmail);
  params.set('name', input.legalName?.trim() || input.name);
  params.set('address[country]', input.billingCountry);
  if (input.address.line1) params.set('address[line1]', input.address.line1);
  if (input.address.line2) params.set('address[line2]', input.address.line2);
  if (input.address.city) params.set('address[city]', input.address.city);
  if (input.address.postalCode) params.set('address[postal_code]', input.address.postalCode);
  params.set('metadata[syllonaut_organization_id]', input.organizationId);
  params.set('metadata[syllonaut_order_id]', input.orderId);

  const payload = await stripePost<StripeCustomerPayload>(
    input.secretKey,
    '/v1/customers',
    params,
    'syllonaut_org_customer_' + input.orderId,
  );

  if (!payload.id || !/^cus_[A-Za-z0-9_]+$/.test(payload.id)) {
    throw new OrganizationStripeError('stripe_customer_response_invalid');
  }
  return payload.id;
}

export async function createOrganizationCardCheckout(input: {
  secretKey: string;
  livemode: boolean;
  customerId: string;
  priceId: string;
  organizationId: string;
  orderId: string;
  planCode: OrganizationPlanCode;
  managedPayments: boolean;
}) {
  if (!expectedSecret(input.secretKey, input.livemode)) {
    throw new OrganizationStripeError('stripe_secret_mode_invalid');
  }
  if (!/^price_[A-Za-z0-9_]+$/.test(input.priceId)) {
    throw new OrganizationStripeError('stripe_price_id_invalid');
  }

  const params = new URLSearchParams();
  params.set('mode', 'subscription');
  params.set('customer', input.customerId);
  params.set('client_reference_id', input.orderId);
  params.set('billing_address_collection', 'required');
  params.set('customer_update[address]', 'auto');
  params.set('customer_update[name]', 'auto');
  params.set('line_items[0][price]', input.priceId);
  params.set('line_items[0][quantity]', '1');
  params.set('managed_payments[enabled]', input.managedPayments ? 'true' : 'false');
  params.set('metadata[syllonaut_organization_id]', input.organizationId);
  params.set('metadata[syllonaut_order_id]', input.orderId);
  params.set('metadata[syllonaut_plan_code]', input.planCode);
  params.set('subscription_data[metadata][syllonaut_organization_id]', input.organizationId);
  params.set('subscription_data[metadata][syllonaut_order_id]', input.orderId);
  params.set('subscription_data[metadata][syllonaut_plan_code]', input.planCode);

  const env = input.livemode ? 'live' : 'sandbox';
  params.set(
    'success_url',
    'https://www.syllonaut.com/school?checkout=success&billing_env=' + env
      + '&session_id={CHECKOUT_SESSION_ID}',
  );
  params.set(
    'cancel_url',
    'https://www.syllonaut.com/school?checkout=cancelled&billing_env=' + env,
  );

  const payload = await stripePost<StripeCheckoutPayload>(
    input.secretKey,
    '/v1/checkout/sessions',
    params,
    'syllonaut_org_checkout_v2_' + input.orderId,
  );

  const expectedPrefix = input.livemode ? 'cs_live_' : 'cs_test_';
  if (
    !payload.id?.startsWith(expectedPrefix)
    || !payload.url?.startsWith('https://checkout.stripe.com/')
  ) {
    throw new OrganizationStripeError('stripe_checkout_response_invalid');
  }

  return { sessionId: payload.id, url: payload.url };
}

export async function createOrganizationInvoice(input: {
  secretKey: string;
  livemode: boolean;
  customerId: string;
  organizationId: string;
  orderId: string;
  planCode: OrganizationPlanCode;
  billingPeriod: OrganizationBillingPeriod;
  currency: BillingCurrency;
  amountMinor: number;
  registrationNumber?: string | null;
  vatId?: string | null;
  billingCountry: string;
}) {
  if (!expectedSecret(input.secretKey, input.livemode)) {
    throw new OrganizationStripeError('stripe_secret_mode_invalid');
  }

  const invoiceParams = new URLSearchParams();
  invoiceParams.set('customer', input.customerId);
  invoiceParams.set('collection_method', 'send_invoice');
  invoiceParams.set('days_until_due', '14');
  invoiceParams.set('auto_advance', 'false');
  invoiceParams.set('metadata[syllonaut_organization_id]', input.organizationId);
  invoiceParams.set('metadata[syllonaut_order_id]', input.orderId);
  invoiceParams.set('metadata[syllonaut_plan_code]', input.planCode);
  invoiceParams.append('payment_settings[payment_method_types][]', 'card');

  if (input.currency === 'eur') {
    invoiceParams.append('payment_settings[payment_method_types][]', 'customer_balance');
    invoiceParams.set(
      'payment_settings[payment_method_options][customer_balance][funding_type]',
      'bank_transfer',
    );
    invoiceParams.set(
      'payment_settings[payment_method_options][customer_balance][bank_transfer][type]',
      'eu_bank_transfer',
    );
    invoiceParams.set(
      'payment_settings[payment_method_options][customer_balance][bank_transfer][eu_bank_transfer][country]',
      input.billingCountry,
    );
  }

  let customIndex = 0;
  if (input.registrationNumber) {
    invoiceParams.set('custom_fields[' + customIndex + '][name]', 'Registration ID');
    invoiceParams.set('custom_fields[' + customIndex + '][value]', input.registrationNumber);
    customIndex += 1;
  }
  if (input.vatId) {
    invoiceParams.set('custom_fields[' + customIndex + '][name]', 'VAT ID');
    invoiceParams.set('custom_fields[' + customIndex + '][value]', input.vatId);
  }

  const invoice = await stripePost<StripeInvoicePayload>(
    input.secretKey,
    '/v1/invoices',
    invoiceParams,
    'syllonaut_org_invoice_' + input.orderId,
  );
  if (!invoice.id || !/^in_[A-Za-z0-9_]+$/.test(invoice.id)) {
    throw new OrganizationStripeError('stripe_invoice_response_invalid');
  }

  const itemParams = new URLSearchParams();
  itemParams.set('customer', input.customerId);
  itemParams.set('invoice', invoice.id);
  itemParams.set('currency', input.currency);
  itemParams.set('amount', String(input.amountMinor));
  itemParams.set(
    'description',
    'Syllonaut ' + input.planCode + ' · '
      + (input.billingPeriod === 'annual' ? '12 months' : '1 month'),
  );

  const item = await stripePost<StripeInvoiceItemPayload>(
    input.secretKey,
    '/v1/invoiceitems',
    itemParams,
    'syllonaut_org_invoice_item_' + input.orderId,
  );
  if (!item.id || !/^ii_[A-Za-z0-9_]+$/.test(item.id)) {
    throw new OrganizationStripeError('stripe_invoice_item_response_invalid');
  }

  const finalizePayload = await stripePost<StripeInvoicePayload>(
    input.secretKey,
    '/v1/invoices/' + encodeURIComponent(invoice.id) + '/finalize',
    new URLSearchParams(),
    'syllonaut_org_invoice_finalize_' + input.orderId,
  );

  if (
    finalizePayload.id !== invoice.id
    || !finalizePayload.hosted_invoice_url?.startsWith('https://invoice.stripe.com/')
  ) {
    throw new OrganizationStripeError('stripe_invoice_finalize_response_invalid');
  }

  const sendPayload = await stripePost<StripeInvoicePayload>(
    input.secretKey,
    '/v1/invoices/' + encodeURIComponent(invoice.id) + '/send',
    new URLSearchParams(),
    'syllonaut_org_invoice_send_' + input.orderId,
  );

  if (
    sendPayload.id !== invoice.id
    || !sendPayload.hosted_invoice_url?.startsWith('https://invoice.stripe.com/')
  ) {
    throw new OrganizationStripeError('stripe_invoice_send_response_invalid');
  }

  return {
    invoiceId: invoice.id,
    hostedInvoiceUrl: sendPayload.hosted_invoice_url,
    invoicePdfUrl: sendPayload.invoice_pdf ?? null,
  };
}


export async function updateOrganizationSubscriptionCancellation(input: {
  secretKey: string;
  livemode: boolean;
  subscriptionId: string;
  cancelAtPeriodEnd: boolean;
}) {
  if (!expectedSecret(input.secretKey, input.livemode)) {
    throw new OrganizationStripeError('stripe_secret_mode_invalid');
  }
  if (!/^sub_[A-Za-z0-9_]+$/.test(input.subscriptionId)) {
    throw new OrganizationStripeError('stripe_subscription_id_invalid');
  }

  const params = new URLSearchParams();
  params.set('cancel_at_period_end', input.cancelAtPeriodEnd ? 'true' : 'false');

  const payload = await stripePost<StripeErrorPayload & {
    id?: string;
    object?: string;
    cancel_at_period_end?: boolean;
    status?: string;
  }>(
    input.secretKey,
    '/v1/subscriptions/' + encodeURIComponent(input.subscriptionId),
    params,
    'syllonaut_org_subscription_cancel_'
      + input.subscriptionId
      + '_'
      + (input.cancelAtPeriodEnd ? 'on' : 'off'),
  );

  if (
    payload.id !== input.subscriptionId
    || payload.object !== 'subscription'
    || payload.cancel_at_period_end !== input.cancelAtPeriodEnd
  ) {
    throw new OrganizationStripeError('stripe_subscription_update_response_invalid');
  }

  return {
    subscriptionId: payload.id,
    cancelAtPeriodEnd: payload.cancel_at_period_end,
    status: payload.status ?? null,
  };
}
