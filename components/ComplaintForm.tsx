'use client';

import { useRef, useState } from 'react';
import {
  COMPLAINT_REMEDIES,
  COMPLAINT_REMEDY_CODES,
  COMPLAINT_RESOLUTION_DAYS,
  COMPLAINT_SUBJECT_AREAS,
  COMPLAINT_SUBJECT_AREA_CODES,
  type ComplaintRemedy,
} from '@/lib/complaint-options';
import styles from '@/app/complaint/ComplaintPage.module.css';

type Receipt = { complaintId: string; submittedAt: string; resolutionDueAt: string; confirmationSent: boolean };

const ERRORS: Record<string, [string, string]> = {
  complaint_rate_limited: ['Za posledních 24 hodin jste odeslali příliš mnoho reklamací. Zkuste to prosím později nebo nám napište e-mail.', 'You have sent too many complaints in the last 24 hours. Please try later or email us.'],
  complaint_remedy_note_required: ['U jiného způsobu vyřízení prosím popište, co požadujete.', 'Please describe the remedy you request.'],
  complaints_unavailable: ['Online reklamace je dočasně nedostupná. Reklamaci prosím pošlete e-mailem.', 'Online complaints are temporarily unavailable. Please send your complaint by email.'],
  authentication_required: ['Pro online reklamaci se prosím přihlaste.', 'Please sign in to submit a complaint online.'],
};

export default function ComplaintForm({ locale, defaultEmail, supportEmail }: { locale: 'cs' | 'en'; defaultEmail: string; supportEmail: string }) {
  const english = locale === 'en';
  const ui = (cs: string, en: string) => (english ? en : cs);
  const requestId = useRef<string>(crypto.randomUUID());
  const [remedy, setRemedy] = useState<ComplaintRemedy>('bring_into_conformity');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [receipt, setReceipt] = useState<Receipt | null>(null);
  const [retrying, setRetrying] = useState(false);

  const format = (value: string, withTime: boolean) => new Intl.DateTimeFormat(english ? 'en-GB' : 'cs-CZ', {
    dateStyle: 'long', ...(withTime ? { timeStyle: 'short' as const } : {}), timeZone: 'Europe/Prague',
  }).format(new Date(value));

  async function retryConfirmation() {
    if (!receipt) return;
    setRetrying(true);
    try {
      const response = await fetch('/api/legal/complaint', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'retry_confirmation', complaintId: receipt.complaintId }),
      });
      if (response.ok) setReceipt({ ...receipt, confirmationSent: true });
    } finally {
      setRetrying(false);
    }
  }

  if (receipt) {
    return (
      <div className={styles.receipt} role="status" aria-live="polite">
        <strong>{ui('Reklamaci jsme přijali.', 'We received your complaint.')}</strong>
        <dl>
          <dt>{ui('Číslo reklamace', 'Complaint ID')}</dt><dd>{receipt.complaintId}</dd>
          <dt>{ui('Uplatněno', 'Submitted')}</dt><dd>{format(receipt.submittedAt, true)}</dd>
          <dt>{ui('Vyřízení nejpozději do', 'Resolution no later than')}</dt><dd>{format(receipt.resolutionDueAt, false)}</dd>
        </dl>
        <p style={{ margin: '12px 0 0' }}>
          {receipt.confirmationSent
            ? ui('Potvrzení s obsahem reklamace jsme vám poslali e-mailem.', 'We emailed you a confirmation with the content of your complaint.')
            : ui('Reklamace je uložena, ale potvrzení e-mailem se zatím nepodařilo odeslat.', 'Your complaint is recorded, but the email confirmation could not be sent yet.')}
        </p>
        {!receipt.confirmationSent ? (
          <button type="button" className={styles.submit} style={{ marginTop: 12 }} onClick={() => void retryConfirmation()} disabled={retrying}>
            {retrying ? ui('Odesílám…', 'Sending…') : ui('Odeslat potvrzení znovu', 'Send confirmation again')}
          </button>
        ) : null}
      </div>
    );
  }

  return (
    <form
      className={styles.fields}
      onSubmit={async (event) => {
        event.preventDefault();
        const form = new FormData(event.currentTarget);
        setBusy(true);
        setError('');
        try {
          const response = await fetch('/api/legal/complaint', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              action: 'submit',
              clientRequestId: requestId.current,
              customerName: form.get('customerName'),
              contactEmail: form.get('contactEmail'),
              subjectArea: form.get('subjectArea'),
              description: form.get('description'),
              requestedRemedy: remedy,
              remedyNote: form.get('remedyNote') ?? '',
              locale,
            }),
          });
          const data = await response.json().catch(() => ({}));
          if (response.ok && data.complaintId) {
            setReceipt(data as Receipt);
            return;
          }
          const known = typeof data.error === 'string' ? ERRORS[data.error] : undefined;
          setError(known ? ui(known[0], known[1]) : ui(
            `Reklamaci se nepodařilo odeslat. Zkuste to prosím znovu nebo ji pošlete na ${supportEmail}.`,
            `The complaint could not be sent. Please try again or email it to ${supportEmail}.`,
          ));
        } catch {
          setError(ui(`Spojení selhalo. Zkuste to prosím znovu nebo napište na ${supportEmail}.`, `Connection failed. Please try again or email ${supportEmail}.`));
        } finally {
          setBusy(false);
        }
      }}
    >
      <label className={styles.field}>
        {ui('Jméno a příjmení', 'Full name')}
        <input name="customerName" required minLength={2} maxLength={160} autoComplete="name" />
      </label>
      <label className={styles.field}>
        {ui('E-mail pro potvrzení a vyřízení', 'Email for confirmation and resolution')}
        <input name="contactEmail" type="email" required maxLength={254} autoComplete="email" defaultValue={defaultEmail} />
      </label>
      <label className={styles.field}>
        {ui('Čeho se reklamace týká', 'What the complaint concerns')}
        <select name="subjectArea" required defaultValue="ai_generation">
          {COMPLAINT_SUBJECT_AREA_CODES.map((code) => <option key={code} value={code}>{COMPLAINT_SUBJECT_AREAS[code][locale]}</option>)}
        </select>
      </label>
      <label className={styles.field}>
        {ui('Popis vady', 'Description of the defect')}
        <textarea name="description" required minLength={20} maxLength={5000} aria-describedby="complaint-description-hint" />
        <span id="complaint-description-hint" className={styles.hint}>
          {ui(
            'Popište, co nefunguje podle smlouvy, kdy se to stalo a jak to ovlivnilo výuku. Neuvádějte zbytečně osobní údaje studentů.',
            'Describe what does not work as agreed, when it happened and how it affected your teaching. Do not include unnecessary student personal data.',
          )}
        </span>
      </label>
      <label className={styles.field}>
        {ui('Požadovaný způsob vyřízení', 'Requested remedy')}
        <select name="requestedRemedy" value={remedy} onChange={(event) => setRemedy(event.target.value as ComplaintRemedy)}>
          {COMPLAINT_REMEDY_CODES.map((code) => <option key={code} value={code}>{COMPLAINT_REMEDIES[code][locale]}</option>)}
        </select>
      </label>
      <label className={styles.field}>
        {remedy === 'other' ? ui('Popis požadovaného řešení', 'Describe the remedy you request') : ui('Doplnění k požadavku (nepovinné)', 'Additional detail (optional)')}
        <input name="remedyNote" maxLength={1000} required={remedy === 'other'} />
      </label>
      {error ? <div className={styles.error} role="alert">{error}</div> : null}
      <p className={styles.hint} style={{ margin: 0 }}>
        {ui(
          `Po odeslání obdržíte e-mailem potvrzení s datem a časem uplatnění, obsahem reklamace a požadovaným způsobem vyřízení. Reklamaci vyřídíme bez zbytečného odkladu, nejpozději do ${COMPLAINT_RESOLUTION_DAYS} dnů.`,
          `After submitting, you will receive an email confirmation with the date and time of submission, the complaint content and the requested remedy. We will resolve it without undue delay, no later than ${COMPLAINT_RESOLUTION_DAYS} days.`,
        )}
      </p>
      <button type="submit" className={styles.submit} disabled={busy}>{busy ? ui('Odesílám…', 'Sending…') : ui('Odeslat reklamaci', 'Submit complaint')}</button>
    </form>
  );
}
