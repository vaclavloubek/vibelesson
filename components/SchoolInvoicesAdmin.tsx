'use client';

import { useState } from 'react';
import styles from './SchoolAdmin.module.css';

export type SchoolInvoiceAdminRow = {
  id: string;
  organizationId: string;
  organizationName: string;
  invoiceNumber: string;
  variableSymbol: string;
  amountMinor: number;
  currency: string;
  status: string;
  issuedAt: string;
  dueDate: string;
  paidAt: string | null;
  paymentConfirmationSource: string | null;
  livemode: boolean;
};

function money(amountMinor: number, currency: string) {
  return new Intl.NumberFormat('cs-CZ', {
    style: 'currency',
    currency: currency.toUpperCase(),
  }).format(amountMinor / 100);
}

export default function SchoolInvoicesAdmin({
  initialRows,
}: {
  initialRows: SchoolInvoiceAdminRow[];
}) {
  const [rows, setRows] = useState(initialRows);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [message, setMessage] = useState('');

  async function markPaid(row: SchoolInvoiceAdminRow) {
    if (!window.confirm(
      'Označit fakturu ' + row.invoiceNumber + ' za ' + money(row.amountMinor, row.currency)
      + ' jako zaplacenou a aktivovat/prodloužit organizaci ' + row.organizationName + '?',
    )) return;

    setBusyId(row.id);
    setMessage('');

    const response = await fetch(
      '/api/admin/school-invoices/' + encodeURIComponent(row.id) + '/mark-paid',
      { method: 'POST' },
    );
    const payload = await response.json().catch(() => ({})) as {
      error?: string;
      result?: { processed?: boolean };
    };

    setBusyId(null);

    if (!response.ok) {
      setMessage('Potvrzení úhrady se nepodařilo: ' + (payload.error ?? 'unknown_error'));
      return;
    }

    setRows((current) => current.map((item) => (
      item.id === row.id
        ? {
          ...item,
          status: 'paid',
          paidAt: new Date().toISOString(),
          paymentConfirmationSource: 'superadmin_manual',
        }
        : item
    )));
    setMessage('Faktura ' + row.invoiceNumber + ' je označená jako zaplacená.');
  }

  return (
    <>
      {message ? <div className={styles.warning}>{message}</div> : null}

      {rows.length === 0 ? (
        <p>Zatím nebyla vystavena žádná bankovní faktura.</p>
      ) : (
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Faktura</th>
                <th>Organizace</th>
                <th>VS</th>
                <th>Částka</th>
                <th>Splatnost</th>
                <th>Stav</th>
                <th>Zdroj úhrady</th>
                <th>Akce</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id}>
                  <td>
                    <a className={styles.back} href={'/school/invoices/' + row.id}>
                      {row.invoiceNumber}
                    </a>
                    {!row.livemode ? <div className={styles.muted}>SANDBOX</div> : null}
                  </td>
                  <td>{row.organizationName}</td>
                  <td>{row.variableSymbol}</td>
                  <td>{money(row.amountMinor, row.currency)}</td>
                  <td>{new Date(row.dueDate + 'T12:00:00Z').toLocaleDateString('cs-CZ')}</td>
                  <td>{row.status === 'paid' ? 'Zaplacená' : 'Nezaplacená'}</td>
                  <td>{row.paymentConfirmationSource ?? '—'}</td>
                  <td>
                    <div className={styles.rowActions}>
                      <a
                        className={styles.back}
                        href={'/api/organizations/invoices/' + row.id + '/pdf'}
                        target="_blank"
                        rel="noreferrer"
                      >
                        PDF
                      </a>
                      {row.status !== 'paid' ? (
                        <button
                          type="button"
                          className={styles.primary}
                          disabled={busyId !== null}
                          onClick={() => markPaid(row)}
                        >
                          {busyId === row.id ? 'Potvrzuji…' : 'Označit jako zaplacenou'}
                        </button>
                      ) : null}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
