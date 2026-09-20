'use client';

import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import { useUiLocale } from '@/components/LocaleProvider';
import { localizedApiError } from '@/lib/i18n';

type Challenge = {
  evaluationId: string;
  question: string;
  expiresAt: string;
};

export default function IntegrityChallenge({ sessionId }: { sessionId: string }) {
  const locale = useUiLocale();
  const english = locale === 'en';
  const ui = (cs: string, en: string) => english ? en : cs;
  const [challenge, setChallenge] = useState<Challenge | null>(null);
  const [answer, setAnswer] = useState('');
  const [error, setError] = useState('');
  const [sending, setSending] = useState(false);
  const [now, setNow] = useState(() => Date.now());

  const load = useCallback(async () => {
    try {
      const response = await fetch(`/api/student/sessions/${sessionId}/integrity-challenge`, { cache: 'no-store' });
      const data = await response.json() as { challenge?: Challenge | null; error?: string };
      if (!response.ok) throw new Error(localizedApiError(data.error, locale, 'Kontrolní otázku se nepodařilo načíst.', 'The verification question could not be loaded.'));
      setChallenge(data.challenge ?? null);
      setError('');
    } catch (err) {
      setError(err instanceof Error ? err.message : ui('Kontrolní otázku se nepodařilo načíst.', 'The verification question could not be loaded.'));
    }
  }, [locale, sessionId]);

  useEffect(() => {
    void load();
    const timer = window.setInterval(() => { void load(); }, 4_000);
    return () => window.clearInterval(timer);
  }, [load]);

  useEffect(() => {
    if (!challenge) return;
    const timer = window.setInterval(() => setNow(Date.now()), 250);
    return () => window.clearInterval(timer);
  }, [challenge]);

  const secondsLeft = useMemo(() => challenge
    ? Math.max(0, Math.ceil((Date.parse(challenge.expiresAt) - now) / 1000))
    : 0, [challenge, now]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!challenge || sending || secondsLeft <= 0) return;
    const text = answer.trim();
    if (!text) return;

    setSending(true);
    setError('');
    try {
      const response = await fetch(`/api/student/sessions/${sessionId}/integrity-challenge`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ evaluationId: challenge.evaluationId, answer: text }),
      });
      const data = await response.json() as { error?: string };
      if (!response.ok) throw new Error(localizedApiError(data.error, locale, 'Odpověď se nepodařilo odeslat.', 'The answer could not be submitted.'));
      setChallenge(null);
      setAnswer('');
    } catch (err) {
      setError(err instanceof Error ? err.message : ui('Odpověď se nepodařilo odeslat.', 'The answer could not be submitted.'));
      void load();
    } finally {
      setSending(false);
    }
  }

  if (!challenge && !error) return null;

  return (
    <section className="panel" aria-live="polite" style={{ border: '2px solid var(--border)', display: 'grid', gap: 10 }}>
      {challenge ? (
        <>
          <div>
            <span className="eyebrow">{ui('Krátké ověření odpovědi', 'Quick answer check')}</span>
            <h2 style={{ margin: '6px 0 0' }}>{ui('Doplňující otázka', 'Follow-up question')}</h2>
            <p className="muted-copy" style={{ marginBottom: 0 }}>
              {ui('Odpověz vlastními slovy jednou až dvěma větami. Čas běží od zobrazení otázky.', 'Answer in your own words in one or two sentences. The timer starts when the question is shown.')}
            </p>
          </div>
          <p style={{ margin: 0, whiteSpace: 'pre-wrap' }}><strong>{challenge.question}</strong></p>
          <p style={{ margin: 0 }}><strong>{secondsLeft} s</strong></p>
          <form onSubmit={submit} style={{ display: 'grid', gap: 8 }}>
            <textarea
              value={answer}
              onChange={(event) => setAnswer(event.target.value)}
              maxLength={1000}
              rows={3}
              disabled={sending || secondsLeft <= 0}
              aria-label={ui('Odpověď na doplňující otázku', 'Answer to follow-up question')}
            />
            <div className="actions" style={{ marginTop: 0 }}>
              <button type="submit" disabled={sending || secondsLeft <= 0 || !answer.trim()}>
                {sending ? ui('Odesílám…', 'Submitting…') : secondsLeft > 0 ? ui('Odeslat odpověď', 'Submit answer') : ui('Čas vypršel', 'Time expired')}
              </button>
            </div>
          </form>
        </>
      ) : null}
      {error ? <p className="muted-copy" style={{ margin: 0 }}>{error}</p> : null}
    </section>
  );
}
