'use client';

import Link from 'next/link';
import { FormEvent, useState } from 'react';
import { useRouter } from 'next/navigation';
import SyllonautMark from '@/components/SyllonautMark';
import LocaleSwitcher from '@/components/LocaleSwitcher';
import { useUiLocale } from '@/components/LocaleProvider';
import { trackEvent } from '@/lib/analytics';
import { saveLiveControlAccess, type LiveControlAccess } from '@/lib/live-control-client';

export default function StudentJoinForm({ joinCode }: { joinCode: string }) {
  const router = useRouter();
  const locale = useUiLocale();
  const english = locale === 'en';
  const ui = (cs: string, en: string) => english ? en : cs;
  const [displayName, setDisplayName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const errorId = 'student-join-error';

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError('');
    try {
      const response = await fetch('/api/student/join', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ joinCode, displayName }),
      });
      const data = await response.json() as { sessionId?: string; liveControl?: LiveControlAccess | null; error?: string };
      if (!response.ok || !data.sessionId) throw new Error(data.error || ui('Ke hodině se nepodařilo připojit.', 'Could not join the lesson.'));
      trackEvent('student_join_completed');
      saveLiveControlAccess(data.sessionId, 'student', data.liveControl ?? null);
      router.replace(`/student/${data.sessionId}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : ui('Ke hodině se nepodařilo připojit.', 'Could not join the lesson.'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="shell join-shell">
      <header className="brand student-brand">
        <div className="brand-identity"><Link href={`/${locale}`} className="brand-home"><SyllonautMark /><strong>Syllonaut</strong></Link><span className="beta">STUDENT</span></div><LocaleSwitcher />
      </header>
      <section className="panel join-card" aria-busy={busy}>
        <span className="eyebrow">{ui('Kód', 'Code')} {joinCode}</span>
        <h1>{ui('Jak ti máme říkat?', 'What should we call you?')}</h1>
        <form onSubmit={submit}>
          <label>
            {ui('Zobrazované jméno', 'Display name')}
            <input
              value={displayName}
              onChange={(event) => {
                setDisplayName(event.target.value.slice(0, 60));
                if (error) setError('');
              }}
              autoComplete="nickname"
              placeholder={ui('Např. Tereza', 'E.g. Alex')}
              required
              aria-invalid={Boolean(error)}
              aria-describedby={error ? errorId : undefined}
            />
          </label>
          <div className="actions"><button className="primary" disabled={busy}>{busy ? ui('Připojuji…', 'Joining…') : ui('Připojit se', 'Join lesson')}</button><Link href="/join" className="secondary button-link">{ui('Jiný kód', 'Different code')}</Link></div>
        </form>
        {error ? <div id={errorId} className="error" role="alert" style={{ marginTop: 12 }}>{error}</div> : null}
      </section>
    </main>
  );
}
