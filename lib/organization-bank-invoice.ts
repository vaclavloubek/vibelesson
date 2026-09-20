import { createAdminClient } from '@/lib/supabase/admin';

type Currency = 'czk' | 'eur' | 'usd';

export type OrganizationInvoiceLocale = 'cs' | 'en';

export type OrganizationBankInvoiceSnapshot = {
  documentLocale: OrganizationInvoiceLocale;
  seller: {
    name: string;
    registrationNumber: string;
    vatId: string | null;
    vatPayer?: boolean;
    addressLine1: string;
    addressLine2: string | null;
    city: string;
    postalCode: string;
    country: string;
  };
  bank: {
    account: string;
    iban: string;
    bic: string | null;
  };
  customer: Record<string, unknown>;
  dueDays: number;
  livemode: boolean;
};

export type OrganizationBankInvoiceData = {
  id: string;
  organizationId: string;
  organizationName: string;
  invoiceNumber: string;
  variableSymbol: string;
  issuedAt: string;
  dueDate: string;
  status: string;
  paidAt: string | null;
  amountMinor: number;
  currency: Currency;
  billingPeriod: 'monthly' | 'annual';
  planCode: string;
  snapshot: OrganizationBankInvoiceSnapshot;
  spayd: string;
};

function requiredEnv(name: string) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error('organization_bank_invoice_not_configured');
  return value;
}

function optionalEnv(name: string) {
  return process.env[name]?.trim() || null;
}

function sellerVatPayer() {
  const raw = process.env.SYLLONAUT_INVOICE_SELLER_VAT_PAYER?.trim().toLowerCase();
  if (!raw) return false;
  if (raw === 'true') return true;
  if (raw === 'false') return false;
  throw new Error('organization_bank_invoice_vat_payer_invalid');
}

function dueDays() {
  const raw = Number(process.env.SYLLONAUT_INVOICE_DUE_DAYS ?? '14');
  if (!Number.isInteger(raw) || raw < 1 || raw > 90) {
    throw new Error('organization_bank_invoice_due_days_invalid');
  }
  return raw;
}

export function organizationInvoiceLocaleForCountry(country: unknown): OrganizationInvoiceLocale {
  const normalized = typeof country === 'string'
    ? country.trim().toUpperCase()
    : '';

  return normalized === 'CZ' || normalized === 'SK' ? 'cs' : 'en';
}

function invoiceConfig(
  livemode: boolean,
  documentLocale: OrganizationInvoiceLocale,
): OrganizationBankInvoiceSnapshot {
  const iban = requiredEnv('SYLLONAUT_INVOICE_BANK_IBAN')
    .replace(/\s+/g, '')
    .toUpperCase();

  if (!/^[A-Z]{2}[A-Z0-9]{13,32}$/.test(iban)) {
    throw new Error('organization_bank_invoice_iban_invalid');
  }

  const vatId = optionalEnv('SYLLONAUT_INVOICE_SELLER_VAT_ID');
  const vatPayer = sellerVatPayer();
  if (vatPayer && !vatId) {
    throw new Error('organization_bank_invoice_vat_id_required');
  }

  return {
    documentLocale,
    seller: {
      name: requiredEnv('SYLLONAUT_INVOICE_SELLER_NAME'),
      registrationNumber: requiredEnv('SYLLONAUT_INVOICE_SELLER_REGISTRATION_NUMBER'),
      vatId,
      vatPayer,
      addressLine1: requiredEnv('SYLLONAUT_INVOICE_SELLER_ADDRESS_LINE1'),
      addressLine2: optionalEnv('SYLLONAUT_INVOICE_SELLER_ADDRESS_LINE2'),
      city: requiredEnv('SYLLONAUT_INVOICE_SELLER_CITY'),
      postalCode: requiredEnv('SYLLONAUT_INVOICE_SELLER_POSTAL_CODE'),
      country: requiredEnv('SYLLONAUT_INVOICE_SELLER_COUNTRY').toUpperCase(),
    },
    bank: {
      account: requiredEnv('SYLLONAUT_INVOICE_BANK_ACCOUNT'),
      iban,
      bic: optionalEnv('SYLLONAUT_INVOICE_BANK_BIC'),
    },
    customer: {},
    dueDays: dueDays(),
    livemode,
  };
}

function isoDateAfterDays(days: number) {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function spaydValue(value: string) {
  return encodeURIComponent(value)
    .replace(/\*/g, '%2A')
    .replace(/%20/g, '%20');
}

export function buildOrganizationQrPaymentSpayd(input: {
  iban: string;
  amountMinor: number;
  currency: Currency;
  variableSymbol: string;
  dueDate: string;
  invoiceNumber: string;
}) {
  const due = input.dueDate.replace(/-/g, '');
  const message = ('SYLLONAUT ' + input.invoiceNumber).slice(0, 60);

  return [
    'SPD*1.0',
    'ACC:' + input.iban.replace(/\s+/g, '').toUpperCase(),
    'AM:' + (input.amountMinor / 100).toFixed(2),
    'CC:' + input.currency.toUpperCase(),
    'DT:' + due,
    'MSG:' + spaydValue(message),
    'X-VS:' + input.variableSymbol,
  ].join('*') + '*';
}

export async function issueOrganizationBankInvoice(orderId: string) {
  const admin = createAdminClient();

  const { data: order, error: orderError } = await admin
    .from('organization_orders')
    .select(
      'id, organization_id, plan_code, billing_period, currency, amount_minor, payment_method, status, billing_snapshot, invoice_number, invoice_issued_at, invoice_due_date, invoice_snapshot, livemode',
    )
    .eq('id', orderId)
    .maybeSingle();

  if (orderError || !order) throw new Error('organization_order_not_found');
  if (order.payment_method !== 'invoice') {
    throw new Error('organization_order_not_bank_invoice');
  }

  const { data: organization, error: organizationError } = await admin
    .from('organizations')
    .select('payment_variable_symbol')
    .eq('id', order.organization_id)
    .maybeSingle();

  if (organizationError || !organization) {
    throw new Error('organization_not_found');
  }

  if (order.invoice_number && order.invoice_due_date && order.invoice_issued_at) {
    return {
      invoiceNumber: order.invoice_number,
      variableSymbol: organization.payment_variable_symbol,
      dueDate: order.invoice_due_date,
      invoiceUrl: '/school/invoices/' + order.id,
      pdfUrl: '/api/organizations/invoices/' + order.id + '/pdf',
    };
  }

  const customer = (order.billing_snapshot ?? {}) as Record<string, unknown>;
  const snapshot = invoiceConfig(
    order.livemode !== false,
    organizationInvoiceLocaleForCountry(customer.billingCountry),
  );
  snapshot.customer = customer;
  const dueDate = isoDateAfterDays(snapshot.dueDays);

  const { data, error } = await admin.rpc('issue_organization_bank_invoice', {
    p_order_id: order.id,
    p_invoice_snapshot: snapshot,
    p_due_date: dueDate,
  });

  if (error) throw new Error(error.message || 'organization_bank_invoice_issue_failed');

  const result = data as {
    invoiceNumber?: string;
    variableSymbol?: string;
    dueDate?: string;
  } | null;

  if (!result?.invoiceNumber || !result.variableSymbol || !result.dueDate) {
    throw new Error('organization_bank_invoice_response_invalid');
  }

  return {
    invoiceNumber: result.invoiceNumber,
    variableSymbol: result.variableSymbol,
    dueDate: result.dueDate,
    invoiceUrl: '/school/invoices/' + order.id,
    pdfUrl: '/api/organizations/invoices/' + order.id + '/pdf',
  };
}

function asSnapshot(value: unknown): OrganizationBankInvoiceSnapshot {
  if (!value || typeof value !== 'object') {
    throw new Error('organization_bank_invoice_snapshot_invalid');
  }

  const snapshot = value as Omit<OrganizationBankInvoiceSnapshot, 'documentLocale'> & {
    documentLocale?: unknown;
  };
  if (!snapshot.seller?.name || !snapshot.bank?.iban) {
    throw new Error('organization_bank_invoice_snapshot_invalid');
  }

  const documentLocale = snapshot.documentLocale === 'cs' || snapshot.documentLocale === 'en'
    ? snapshot.documentLocale
    : organizationInvoiceLocaleForCountry(snapshot.customer?.billingCountry);

  return {
    ...snapshot,
    documentLocale,
  };
}

export async function getOrganizationBankInvoiceData(
  orderId: string,
): Promise<OrganizationBankInvoiceData> {
  const admin = createAdminClient();
  const { data: order, error: orderError } = await admin
    .from('organization_orders')
    .select(
      'id, organization_id, plan_code, billing_period, currency, amount_minor, status, paid_at, invoice_number, invoice_issued_at, invoice_due_date, invoice_snapshot',
    )
    .eq('id', orderId)
    .maybeSingle();

  if (orderError || !order?.invoice_number || !order.invoice_issued_at || !order.invoice_due_date) {
    throw new Error('organization_bank_invoice_not_found');
  }

  const { data: organization, error: organizationError } = await admin
    .from('organizations')
    .select('name, payment_variable_symbol')
    .eq('id', order.organization_id)
    .maybeSingle();

  if (organizationError || !organization) {
    throw new Error('organization_not_found');
  }

  const snapshot = asSnapshot(order.invoice_snapshot);
  const currency = order.currency as Currency;

  return {
    id: order.id,
    organizationId: order.organization_id,
    organizationName: organization.name,
    invoiceNumber: order.invoice_number,
    variableSymbol: organization.payment_variable_symbol,
    issuedAt: order.invoice_issued_at,
    dueDate: order.invoice_due_date,
    status: order.status,
    paidAt: order.paid_at,
    amountMinor: order.amount_minor,
    currency,
    billingPeriod: order.billing_period as 'monthly' | 'annual',
    planCode: order.plan_code,
    snapshot,
    spayd: buildOrganizationQrPaymentSpayd({
      iban: snapshot.bank.iban,
      amountMinor: order.amount_minor,
      currency,
      variableSymbol: organization.payment_variable_symbol,
      dueDate: order.invoice_due_date,
      invoiceNumber: order.invoice_number,
    }),
  };
}
