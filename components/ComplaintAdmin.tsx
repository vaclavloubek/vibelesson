'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import {
  COMPLAINT_OUTCOMES,
  COMPLAINT_OUTCOME_CODES,
  COMPLAINT_REMEDIES,
  COMPLAINT_SUBJECT_AREAS,
  type ComplaintOutcome,
} from '@/lib/complaint-options';
import type { AdminComplaint } from '@/lib/complaints';

const dateTime = (value: string) => new Intl.DateTimeFormat('cs-CZ', {
  dateStyle: 'medium', timeStyle: 'short', timeZone: 'Europe/Prague',
}).format(new Date(value));

function deadlineLabel(complaint: AdminComplaint) {
  if (complaint.resolvedAt) return `Vyřízeno ${dateTime(complaint.resolvedAt)}`;
  const days = Math.ceil((new Date(complaint.resolutionDueAt).getTime() - Date.now()) / 86_400_000);
  return days < 0 ? `PO TERMÍNU (${dateTime(complaint.resolutionDueAt)})` : `Zbývá ${days} dní (do ${dateTime(complaint.resolutionDueAt)})`;
}

function ResolveForm({ complaint, onDone }: { complaint: AdminComplaint; onDone: (message: string) => void }) {
  const [outcome, setOutcome] = useState<ComplaintOutcome>('accepted');
  const [busy, setBusy] = useState(false);
  return (
    <form
      onSubmit={async (event) => {
        event.preventDefault();
        const form = new FormData(event.currentTarget);
        if (!window.confirm('Vyřízení je nevratné a zákazník dostane písemné potvrzení. Pokračovat?')) return;
        setBusy(true);
        try {
          const response = await fetch('/api/admin/complaints', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              action: 'resolve',
              complaintId: complaint.id,
              outcome,
              remedyApplied: form.get('remedyApplied'),
              explanation: form.get('explanation'),
            }),
          });
          const data = await response.json().catch(() => ({}));
          onDone(response.ok
            ? (data.confirmationSent ? 'Vyřízeno a potvrzení odesláno.' : 'Vyřízeno; potvrzení se nepodařilo odeslat — zkuste odeslat znovu.')
            : `Chyba: ${data.error ?? response.status}`);
        } finally {
          setBusy(false);
        }
      }}
    >
      <p>
        <label>Výsledek{' '}
          <select value={outcome} onChange={(event) => setOutcome(event.target.value as ComplaintOutcome)}>
            {COMPLAINT_OUTCOME_CODES.map((code) => <option key={code} value={code}>{COMPLAINT_OUTCOMES[code].cs}</option>)}
          </select>
        </label>
      </p>
      <p>
        <label>Způsob vyřízení{outcome === 'rejected' ? ' (nepovinné)' : ' *'}<br />
          <input name="remedyApplied" required={outcome !== 'rejected'} maxLength={1000} style={{ width: '100%' }} placeholder="např. vada opravena v produkci 24. 9.; sleva 200 Kč vrácena na kartu" />
        </label>
      </p>
      <p>
        <label>{outcome === 'rejected' ? 'Písemné odůvodnění zamítnutí *' : 'Popis vyřízení pro zákazníka *'}<br />
          <textarea name="explanation" required minLength={10} maxLength={5000} rows={4} style={{ width: '100%' }} />
        </label>
      </p>
      <button type="submit" disabled={busy}>{busy ? 'Ukládám…' : 'Vyřídit a odeslat potvrzení'}</button>
    </form>
  );
}

export default function ComplaintAdmin({ complaints }: { complaints: AdminComplaint[] }) {
  const router = useRouter();
  const [message, setMessage] = useState('');

  async function retry(complaintId: string, kind: 'receipt' | 'resolution') {
    const response = await fetch('/api/admin/complaints', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'retry_email', complaintId, kind }),
    });
    const data = await response.json().catch(() => ({}));
    setMessage(response.ok ? 'Potvrzení odesláno.' : `Chyba: ${data.error ?? response.status}`);
    router.refresh();
  }

  if (!complaints.length) return <p>Zatím žádné reklamace.</p>;
  return (
    <>
      <p>Reklamaci je nutné vyřídit bez zbytečného odkladu, nejpozději do 30 dnů od uplatnění. Vyřízení je nevratné; zamítnutí musí obsahovat písemné odůvodnění.</p>
      <p role="status" aria-live="polite">{message}</p>
      {complaints.map((complaint) => (
        <article key={complaint.id} style={{ border: '1px solid #dedde8', borderRadius: 12, padding: 16, margin: '16px 0' }}>
          <h2 style={{ fontSize: 18, margin: '0 0 8px' }}>{COMPLAINT_SUBJECT_AREAS[complaint.subjectArea].cs} · {deadlineLabel(complaint)}</h2>
          <p style={{ margin: '4px 0' }}>
            <strong>{complaint.customerName}</strong> · {complaint.contactEmail} · {complaint.locale.toUpperCase()}
            {complaint.planContext ? ` · tarif ${complaint.planContext}` : ''} · uplatněno {dateTime(complaint.submittedAt)}
          </p>
          <p style={{ margin: '4px 0' }}>Požaduje: {COMPLAINT_REMEDIES[complaint.requestedRemedy].cs}{complaint.remedyNote ? ` — ${complaint.remedyNote}` : ''}</p>
          <p style={{ whiteSpace: 'pre-wrap' }}>{complaint.description}</p>
          <p style={{ fontSize: 12, color: '#62646d' }}>
            ID {complaint.id} · potvrzení přijetí: {complaint.receiptStatus ?? '—'}
            {complaint.receiptStatus !== 'sent' ? <> <button type="button" onClick={() => void retry(complaint.id, 'receipt')}>Odeslat znovu</button></> : null}
            {complaint.resolvedAt ? <> · potvrzení vyřízení: {complaint.resolutionStatus ?? '—'}</> : null}
            {complaint.resolvedAt && complaint.resolutionStatus !== 'sent' ? <> <button type="button" onClick={() => void retry(complaint.id, 'resolution')}>Odeslat znovu</button></> : null}
          </p>
          {complaint.resolvedAt ? (
            <p><strong>{complaint.outcome ? COMPLAINT_OUTCOMES[complaint.outcome].cs : ''}</strong>{complaint.remedyApplied ? ` — ${complaint.remedyApplied}` : ''}<br />{complaint.explanation}</p>
          ) : (
            <ResolveForm complaint={complaint} onDone={(text) => { setMessage(text); router.refresh(); }} />
          )}
        </article>
      ))}
    </>
  );
}
