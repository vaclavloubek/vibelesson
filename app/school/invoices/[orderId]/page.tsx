import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import OrganizationPaymentQr from '@/components/OrganizationPaymentQr';
import SyllonautMark from '@/components/SyllonautMark';
import styles from '@/components/SchoolAdmin.module.css';
import { getAuthenticatedUserId } from '@/lib/auth';
import { getOrganizationBankInvoiceData, getOrganizationIdForInvoiceOrder } from '@/lib/organization-bank-invoice';
import { canManageOrganization, getCurrentOrganizationForUser } from '@/lib/organizations';
import { isSuperadminUserId } from '@/lib/superadmin';

export const dynamic = 'force-dynamic';

function money(amountMinor: number, currency: string, locale: 'cs' | 'en') {
  return new Intl.NumberFormat(locale === 'cs' ? 'cs-CZ' : 'en-US', {
    style: 'currency',
    currency: currency.toUpperCase(),
  }).format(amountMinor / 100);
}

function date(value: string, locale: 'cs' | 'en') {
  return new Intl.DateTimeFormat(locale === 'cs' ? 'cs-CZ' : 'en-GB', {
    dateStyle: 'medium',
    timeZone: 'Europe/Prague',
  }).format(new Date(value + (value.length === 10 ? 'T12:00:00Z' : '')));
}

export default async function OrganizationInvoicePage({
  params,
}: {
  params: Promise<{ orderId: string }>;
}) {
  const { orderId } = await params;
  const { userId } = await getAuthenticatedUserId();
  if (!userId) redirect('/school');

  const organizationId = await getOrganizationIdForInvoiceOrder(orderId);
  if (!organizationId) notFound();

  if (!isSuperadminUserId(userId)) {
    const organization = await getCurrentOrganizationForUser(userId);
    if (
      !organization
      || organization.id !== organizationId
      || !canManageOrganization(organization.role)
    ) {
      notFound();
    }
  }

  let invoice;
  try {
    invoice = await getOrganizationBankInvoiceData(orderId);
  } catch {
    notFound();
  }

  const locale = invoice.snapshot.documentLocale;
  const english = locale === 'en';
  const ui = (cs: string, en: string) => english ? en : cs;
  const customer = invoice.snapshot.customer;
  const address = (customer.billingAddress ?? {}) as Record<string, unknown>;

  return (
    <main className={styles.page}>
      <div className={styles.shell}>
        <header className={styles.header}>
          <Link href="/school" className={styles.brand}>
            <SyllonautMark />
            <span>Syllonaut</span>
          </Link>
          <Link href="/school" className={styles.back}>
            {ui('← Moje škola', '← My school')}
          </Link>
        </header>

        <div className={styles.hero}>
          <span className={styles.eyebrow}>
            {ui('Školní fakturace', 'School billing')}
          </span>
          <h1>{invoice.invoiceNumber}</h1>
          <p>
            {invoice.status === 'paid'
              ? ui('Faktura je zaplacená.', 'The invoice is paid.')
              : ui('Faktura čeká na úhradu bankovním převodem.', 'The invoice is awaiting bank transfer.')}
          </p>
        </div>

        {!invoice.snapshot.livemode ? (
          <div className={styles.error}>
            <strong>{ui('TESTOVACÍ DOKLAD — NEPLAŤTE', 'TEST DOCUMENT — DO NOT PAY')}</strong>
          </div>
        ) : null}

        <div className={styles.grid}>
          <section className={styles.card}>
            <span className={styles.status}>
              {invoice.status === 'paid'
                ? ui('ZAPLACENO', 'PAID')
                : ui('NEZAPLACENO', 'UNPAID')}
            </span>
            <h2 style={{ marginTop: 14 }}>{ui('Faktura', 'Invoice')}</h2>
            <p>
              {ui('Vystaveno', 'Issued')}: <strong>{date(invoice.issuedAt, locale)}</strong><br />
              {ui('Splatnost', 'Due date')}: <strong>{date(invoice.dueDate, locale)}</strong><br />
              {ui('Částka', 'Amount')}: <strong>{money(invoice.amountMinor, invoice.currency, locale)}</strong>
            </p>
            <a
              href={'/api/organizations/invoices/' + invoice.id + '/pdf'}
              className={styles.primary}
              style={{ display: 'inline-flex', textDecoration: 'none', alignItems: 'center' }}
            >
              {ui('Stáhnout PDF', 'Download PDF')}
            </a>
          </section>

          <section className={styles.card}>
            <h2>{ui('Bankovní převod', 'Bank transfer')}</h2>
            <p>
              {ui('Účet', 'Account')}: <strong>{invoice.snapshot.bank.account}</strong><br />
              IBAN: <strong>{invoice.snapshot.bank.iban}</strong><br />
              {invoice.snapshot.bank.bic ? <>BIC/SWIFT: <strong>{invoice.snapshot.bank.bic}</strong><br /></> : null}
              {ui('Variabilní symbol', 'Variable symbol')}: <strong>{invoice.variableSymbol}</strong><br />
              {ui('Částka', 'Amount')}: <strong>{money(invoice.amountMinor, invoice.currency, locale)}</strong>
            </p>
            <OrganizationPaymentQr value={invoice.spayd} size={180} />
            <p className={styles.muted}>{ui('QR platba', 'QR payment')}</p>
          </section>

          <section className={styles.card}>
            <h2>{ui('Dodavatel', 'Supplier')}</h2>
            <p>
              <strong>{invoice.snapshot.seller.name}</strong><br />
              {invoice.snapshot.seller.addressLine1}<br />
              {invoice.snapshot.seller.addressLine2 ? <>{invoice.snapshot.seller.addressLine2}<br /></> : null}
              {invoice.snapshot.seller.postalCode} {invoice.snapshot.seller.city}<br />
              {invoice.snapshot.seller.country}<br />
              {ui('IČO', 'Registration No.')}: {invoice.snapshot.seller.registrationNumber}<br />
              {invoice.snapshot.seller.vatId
                ? <>{ui('DIČ / VAT ID', 'VAT ID')}: {invoice.snapshot.seller.vatId}<br /></>
                : null}
              {(invoice.snapshot.seller.vatPayer ?? Boolean(invoice.snapshot.seller.vatId))
                ? null
                : <strong>{ui('Dodavatel není plátcem DPH.', 'Supplier is not registered for VAT.')}</strong>}
            </p>
          </section>

          <section className={styles.card}>
            <h2>{ui('Odběratel', 'Customer')}</h2>
            <p>
              <strong>{String(customer.legalName || customer.name || invoice.organizationName)}</strong><br />
              {address.line1 ? <>{String(address.line1)}<br /></> : null}
              {address.line2 ? <>{String(address.line2)}<br /></> : null}
              {(address.postalCode || address.city)
                ? <>{String(address.postalCode ?? '')} {String(address.city ?? '')}<br /></>
                : null}
              {customer.billingCountry ? <>{String(customer.billingCountry)}<br /></> : null}
              {customer.registrationNumber
                ? <>{ui('IČO', 'Registration No.')}: {String(customer.registrationNumber)}<br /></>
                : null}
              {customer.vatId
                ? <>{ui('DIČ / VAT ID', 'VAT ID')}: {String(customer.vatId)}</>
                : null}
            </p>
          </section>
        </div>
      </div>
    </main>
  );
}
