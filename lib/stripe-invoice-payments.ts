import { isStripeLiveSecretKey, isStripeSandboxSecretKey } from '@/lib/stripe-checkout';

const STRIPE_VERSION = '2026-07-29.dahlia';

type StripeInvoicePaymentsResponse = {
  data?: Array<{
    status?: string;
    amount_paid?: number;
    currency?: string;
    status_transitions?: {
      paid_at?: number | null;
    } | null;
    payment?: {
      type?: string;
      payment_intent?: string | { id?: string } | null;
    } | null;
  }>;
  has_more?: boolean;
  error?: { type?: string; code?: string; message?: string };
};

export class StripeInvoicePaymentLookupError extends Error {
  readonly stripeCode: string | null;

  constructor(code: string, stripeCode: string | null = null) {
    super(code);
    this.name = 'StripeInvoicePaymentLookupError';
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

export async function listStripePaidInvoicePayments({
  secretKey,
  livemode,
  invoiceId,
}: {
  secretKey: string | undefined;
  livemode: boolean;
  invoiceId: string;
}) {
  if (!validKeyForMode(secretKey, livemode)) {
    throw new StripeInvoicePaymentLookupError('stripe_invoice_payment_key_invalid');
  }
  if (!/^in_[A-Za-z0-9_]+$/.test(invoiceId)) {
    throw new StripeInvoicePaymentLookupError('stripe_invoice_id_invalid');
  }

  const params = new URLSearchParams({
    invoice: invoiceId,
    status: 'paid',
    limit: '100',
  });

  let response: Response;
  try {
    response = await fetch('https://api.stripe.com/v1/invoice_payments?' + params.toString(), {
      method: 'GET',
      headers: {
        authorization: 'Bearer ' + secretKey,
        'stripe-version': STRIPE_VERSION,
      },
      cache: 'no-store',
      signal: AbortSignal.timeout(12_000),
    });
  } catch {
    throw new StripeInvoicePaymentLookupError('stripe_invoice_payment_network_error');
  }

  const payload = await response.json().catch(() => null) as StripeInvoicePaymentsResponse | null;
  if (!response.ok || !payload) {
    throw new StripeInvoicePaymentLookupError(
      'stripe_invoice_payment_api_failed',
      payload?.error?.code ?? null,
    );
  }

  if (payload.has_more === true) {
    throw new StripeInvoicePaymentLookupError('stripe_invoice_payment_pagination_unsupported');
  }

  const payments = new Map<string, {
    paymentIntentId: string;
    amountPaid: number;
    currency: 'czk' | 'eur' | 'usd';
    paidAt: string;
  }>();

  for (const item of payload.data ?? []) {
    if (item.status !== 'paid' || item.payment?.type !== 'payment_intent') continue;

    const id = paymentIntentId(item.payment.payment_intent);
    if (!id || !/^pi_[A-Za-z0-9_]+$/.test(id)) continue;

    const amountPaid = item.amount_paid;
    if (typeof amountPaid !== 'number' || !Number.isSafeInteger(amountPaid) || amountPaid < 0) {
      throw new StripeInvoicePaymentLookupError('stripe_invoice_payment_amount_invalid');
    }

    const currency = typeof item.currency === 'string' ? item.currency.toLowerCase() : '';
    if (!['czk', 'eur', 'usd'].includes(currency)) {
      throw new StripeInvoicePaymentLookupError('stripe_invoice_payment_currency_invalid');
    }

    const paidAtSeconds = item.status_transitions?.paid_at;
    if (typeof paidAtSeconds !== 'number' || !Number.isInteger(paidAtSeconds) || paidAtSeconds <= 0) {
      throw new StripeInvoicePaymentLookupError('stripe_invoice_payment_paid_at_invalid');
    }

    payments.set(id, {
      paymentIntentId: id,
      amountPaid,
      currency: currency as 'czk' | 'eur' | 'usd',
      paidAt: new Date(paidAtSeconds * 1000).toISOString(),
    });
  }

  return [...payments.values()];
}

export async function listStripePaidInvoicePaymentIntents(args: {
  secretKey: string | undefined;
  livemode: boolean;
  invoiceId: string;
}) {
  return (await listStripePaidInvoicePayments(args)).map((payment) => payment.paymentIntentId);
}
