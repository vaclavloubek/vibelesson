'use client';

import Link from 'next/link';
import { FormEvent, useState } from 'react';
import { TERMS_ACCEPTANCE_KEY, TERMS_VERSION } from '@/lib/legal';

type Props = {
  locale: 'cs' | 'en';
  returnTo: string;
};

export default function TermsReconsentForm({ locale, returnTo }: Props) {
  const english = locale === 'en';
  const [accepted, setAccepted] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!accepted || busy) return;

    setBusy(true);
    setMessage('');

    try {
      const response = await fetch('/api/legal/terms/reconsent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          termsAccepted: true,
          termsVersion: TERMS_ACCEPTANCE_KEY,
        }),
      });

      if (!response.ok) {
        setMessage(english
          ? 'We could not record your acceptance. Refresh the page and try again.'
          : 'Souhlas se nepodařilo uložit. Obnov stránku a zkus to znovu.');
        setBusy(false);
        return;
      }

      window.location.assign(returnTo);
    } catch {
      setMessage(english
        ? 'We could not record your acceptance. Check your connection and try again.'
        : 'Souhlas se nepodařilo uložit. Zkontroluj připojení a zkus to znovu.');
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} style={{ display: 'grid', gap: 18, marginTop: 24 }}>
      <label style={{ display: 'flex', alignItems: 'flex-start', gap: 10, lineHeight: 1.5 }}>
        <input
          type="checkbox"
          checked={accepted}
          onChange={(event) => setAccepted(event.target.checked)}
          required
          style={{ marginTop: 4 }}
        />
        <span>
          {english ? 'I have read and accept the current ' : 'Přečetl/a jsem si a přijímám aktuální '}
          <Link href={`/${locale}/terms`} target="_blank">
            {english ? 'Terms of Service' : 'obchodní podmínky'}
          </Link>
          {english ? ` (version ${TERMS_VERSION}).` : ` (verze ${TERMS_VERSION}).`}
        </span>
      </label>

      {message ? <div className="error" role="alert">{message}</div> : null}

      <button type="submit" className="primary" disabled={!accepted || busy}>
        {busy
          ? (english ? 'Saving…' : 'Ukládám…')
          : (english ? 'Accept and continue' : 'Přijmout a pokračovat')}
      </button>

      <p style={{ margin: 0, color: 'var(--muted)', fontSize: 14, lineHeight: 1.55 }}>
        {english
          ? 'You do not need to accept the updated Terms to read the legal documents, manage billing or cancel an existing subscription.'
          : 'Aktuální VOP nemusíš přijmout pro přečtení právních dokumentů, správu plateb ani zrušení existujícího předplatného.'}
      </p>

      <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
        <Link href={`/${locale}/gdpr`}>{english ? 'Privacy Notice' : 'Ochrana osobních údajů'}</Link>
        <Link href="/subscription">{english ? 'Subscription' : 'Předplatné'}</Link>
        <Link href="/school">{english ? 'Organisation billing' : 'Školní billing'}</Link>
      </div>
    </form>
  );
}
