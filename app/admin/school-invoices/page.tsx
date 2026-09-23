import Link from 'next/link';
import SchoolInvoicesAdmin, {
  type SchoolInvoiceAdminRow,
} from '@/components/SchoolInvoicesAdmin';
import SyllonautMark from '@/components/SyllonautMark';
import styles from '@/components/SchoolAdmin.module.css';
import { getAuthenticatedUserId } from '@/lib/auth';
import { createAdminClient } from '@/lib/supabase/admin';
import { isSuperadminUserId } from '@/lib/superadmin';
import { assertApprovedNeonCutover, getDatabaseBackend } from '@/lib/neon/config';
import { createNeonSql } from '@/lib/neon/server';

export const dynamic = 'force-dynamic';

export default async function SchoolInvoicesAdminPage() {
  const { userId } = await getAuthenticatedUserId();

  if (!isSuperadminUserId(userId)) {
    return (
      <main className={styles.page}>
        <div className={styles.shell}>
          <header className={styles.header}>
            <Link href="/lessons" className={styles.brand}>
              <SyllonautMark />
              <span>Syllonaut</span>
            </Link>
          </header>

          <section className={styles.hero}>
            <span className={styles.eyebrow}>SUPERADMIN</span>
            <h1>Přístup není dostupný</h1>
            <p>
              Tato sekce je dostupná pouze superadmin účtu.
            </p>
            <Link className={styles.back} href="/lessons">← Zpět na moje lekce</Link>
          </section>
        </div>
      </main>
    );
  }

  const { data: orders, error } = getDatabaseBackend() === 'neon'
    ? await (async () => {
      assertApprovedNeonCutover();
      const rows = await createNeonSql()`
        select id, organization_id, invoice_number, invoice_issued_at,
          invoice_due_date, amount_minor, currency, status, paid_at,
          payment_confirmation_source, livemode
        from public.organization_orders
        where invoice_number is not null
        order by invoice_issued_at desc
      `;
      return { data: rows, error: null };
    })()
    : await createAdminClient().from('organization_orders')
      .select('id, organization_id, invoice_number, invoice_issued_at, invoice_due_date, amount_minor, currency, status, paid_at, payment_confirmation_source, livemode')
      .not('invoice_number', 'is', null)
      .order('invoice_issued_at', { ascending: false });

  if (error) {
    throw new Error('school_invoice_admin_lookup_failed');
  }

  const organizationIds = [...new Set((orders ?? []).map((order) => order.organization_id))];
  const { data: organizations, error: organizationsError } = organizationIds.length
    ? getDatabaseBackend() === 'neon'
      ? await (async () => {
        assertApprovedNeonCutover();
        const rows = await createNeonSql()`
          select id, name, payment_variable_symbol
          from public.organizations
          where id = any(${organizationIds}::uuid[])
        `;
        return { data: rows, error: null };
      })()
      : await createAdminClient().from('organizations')
        .select('id, name, payment_variable_symbol').in('id', organizationIds)
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
