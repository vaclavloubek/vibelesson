'use client';

import { useEffect, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { useUiLocale } from '@/components/LocaleProvider';
import { localizedApiError } from '@/lib/i18n';

export type StudentIntegrityChallenge = {
  evaluationId: string;
  blockId: string;
  question: string;
  expiresAt: string;
};

function secondsLeft(expiresAt: string) {
  const expires = Date.parse(expiresAt);
  if (!Number.isFinite(expires)) return 0;
  return Math.max(0, Math.ceil((expires - Date.now()) / 1000));
}

export default function IntegrityChallengeCard({
  sessionId,
  challenge,
  contentLanguage = null,
  onResolved,
}: {
  sessionId: string;
  challenge: StudentIntegrityChallenge;
  contentLanguage?: string | null;
  onResolved: () => void;
}) {
  const locale = useUiLocale();
  const english = locale === 'en';
  const ui = (cs: string, en: string) => english ? en : cs;
  const [remaining, setRemaining] = useState(() => secondsLeft(challenge.expiresAt));
  const [answer, setAnswer] = useState('');
  const [busy, setBusy] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState('');
  const expirationRefreshRef = useRef(false);

  useEffect(() => {
    setRemaining(secondsLeft(challenge.expiresAt));
    setAnswer('');
    setSubmitted(false);
    setError('');
    expirationRefreshRef.current = false;
  }, [challenge.evaluationId, challenge.expiresAt]);

  useEffect(() => {
    const timer = window.setInterval(() => setRemaining(secondsLeft(challenge.expiresAt)), 250);
    return () => window.clearInterval(timer);
  }, [challenge.expiresAt]);

  useEffect(() => {
    if (remaining > 0 || expirationRefreshRef.current || submitted) return;
    expirationRefreshRef.current = true;
    const timer = window.setTimeout(onResolved, 500);
    return () => window.clearTimeout(timer);
  }, [onResolved, remaining, submitted]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const value = answer.trim();
    if (!value || busy || submitted || remaining <= 0) return;

    setBusy(true);
    setError('');
    try {
      const response = await fetch(`/api/student/sessions/${sessionId}/integrity-challenge`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ evaluationId: challenge.evaluationId, answer: value }),
      });
      const data = await response.json() as { ok?: boolean; error?: string };
      if (!response.ok || !data.ok) {
        throw new Error(localizedApiError(
          data.error,
          locale,
          'Kontrolní odpověď se nepodařilo uložit.',
          'The verification answer could not be saved.',
        ));
      }
      setSubmitted(true);
      window.setTimeout(onResolved, 500);
    } catch (err) {
      setError(err instanceof Error ? err.message : ui(
        'Kontrolní odpověď se nepodařilo uložit.',
        'The verification answer could not be saved.',
      ));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="panel" aria-busy={busy} style={{ borderWidth: 2 }}>
      <div className="teacher-response-item-head">
        <div>
          <span className="eyebrow">{ui('Rychlé ověření porozumění', 'Quick understanding check')}</span>
          <p className="muted-copy" style={{ margin: '5px 0 0' }}>
            {ui(
              'Odpověz krátce vlastními slovy. Na tuto doplňující otázku máš 60 sekund od jejího zadání.',
              'Answer briefly in your own words. You have 60 seconds from when this follow-up question was issued.',
            )}
          </p>
        </div>
        <strong aria-live="polite">{remaining} s</strong>
      </div>

      <p
        style={{ margin: '12px 0 0', fontWeight: 700 }}
        lang={contentLanguage ?? undefined}
        dir={contentLanguage ? 'auto' : undefined}
      >
        {challenge.question}
      </p>

      {submitted ? (
        <p className="student-save-success" role="status" aria-live="polite" style={{ marginBottom: 0 }}>
          ✓ {ui('Kontrolní odpověď je odevzdaná.', 'The verification answer has been submitted.')}
        </p>
      ) : remaining <= 0 ? (
        <p className="muted-copy" role="status" style={{ marginBottom: 0 }}>
          {ui('Čas na odpověď vypršel.', 'The time to answer has expired.')}
        </p>
      ) : (
        <form onSubmit={submit} style={{ display: 'grid', gap: 10, marginTop: 10 }}>
          <label>
            {ui('Krátká odpověď', 'Short answer')}
            <textarea
              value={answer}
              onChange={(event) => setAnswer(event.target.value)}
              maxLength={1000}
              rows={3}
              disabled={busy}
              autoFocus
              style={{ width: '100%', resize: 'vertical', minHeight: 88, padding: 14, borderRadius: 12, border: '1px solid var(--line)', font: 'inherit' }}
            />
          </label>
          <div className="actions" style={{ marginTop: 0 }}>
            <button className="primary" type="submit" disabled={busy || !answer.trim()}>
              {busy ? ui('Odevzdávám…', 'Submitting…') : ui('Odevzdat', 'Submit')}
            </button>
          </div>
        </form>
      )}
      {error ? <div className="error" role="alert" style={{ marginTop: 10 }}>{error}</div> : null}
    </section>
  );
}
