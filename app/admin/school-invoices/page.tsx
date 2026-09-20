import Link from 'next/link';
import { notFound } from 'next/navigation';
import SchoolInvoicesAdmin, {
  type SchoolInvoiceAdminRow,
} from '@/components/SchoolInvoicesAdmin';
import SyllonautMark from '@/components/SyllonautMark';
import styles from '@/components/SchoolAdmin.module.css';
import { getAuthenticatedUserId } from '@/lib/auth';
import { createAdminClient } from '@/lib/supabase/admin';
import { isSuperadminUserId } from '@/lib/superadmin';

export const dynamic = 'force-dynamic';

export default async function SchoolInvoicesAdminPage() {
  const { userId } = await getAuthenticatedUserId();
  if (!isSuperadminUserId(userId)) notFound();

  const admin = createAdminClient();
  const { data: orders, error } = await admin
    .from('organization_orders')
    .select(
      'id, organization_id, invoice_number, invoice_issued_at, invoice_due_date, amount_minor, currency, status, paid_at, payment_confirmation_source, livemode',
    )
    .not('invoice_number', 'is', null)
    .order('invoice_issued_at', { ascending: false });

  if (error) {
    throw new Error('school_invoice_admin_lookup_failed');
  }

  const organizationIds = [...new Set((orders ?? []).map((order) => order.organization_id))];
  const { data: organizations, error: organizationsError } = organizationIds.length
    ? await admin
      .from('organizations')
      .select('id, name, payment_variable_symbol')
      .in('id', organizationIds)
    : { data: [], error: null };

  if (organizationsError) {
    throw new Error('school_invoice_admin_organization_lookup_failed');
  }

  const organizationMap = new Map(
    (organizations ?? []).map((organization) => [organization.id, organization]),
  );

  const rows: SchoolInvoiceAdminRow[] = (orders ?? []).flatMap((order) => {
    const organization = organizationMap.get(order.organization_id);
    if (
      !organization
      || !order.invoice_number
      || !order.invoice_issued_at
      || !order.invoice_due_date
    ) return [];

    return [{
      id: order.id,
      organizationId: order.organization_id,
      organizationName: organization.name,
      invoiceNumber: order.invoice_number,
      variableSymbol: organization.payment_variable_symbol,
      amountMinor: order.amount_minor,
      currency: order.currency,
      status: order.status,
      issuedAt: order.invoice_issued_at,
      dueDate: order.invoice_due_date,
      paidAt: order.paid_at,
      paymentConfirmationSource: order.payment_confirmation_source,
      livemode: order.livemode,
    }];
  });

  return (
    <main className={styles.page}>
      <div className={styles.shell}>
        <header className={styles.header}>
          <Link href="/school" className={styles.brand}>
            <SyllonautMark />
            <span>Syllonaut</span>
          </Link>
          <Link className={styles.back} href="/school">← Moje škola</Link>
        </header>

        <section className={styles.hero}>
          <span className={styles.eyebrow}>SUPERADMIN</span>
          <h1>Vydané školní faktury</h1>
          <p>
            Přehled všech bankovních faktur organizací. Ruční potvrzení úhrady
            současně aktivuje nebo prodlouží licenci.
          </p>
        </section>

        <section className={styles.card + ' ' + styles.wide}>
          <SchoolInvoicesAdmin initialRows={rows} />
        </section>
      </div>
    </main>
  );
}
