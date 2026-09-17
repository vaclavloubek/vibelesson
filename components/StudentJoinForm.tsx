'use client';

import Link from 'next/link';
import { FormEvent, useState } from 'react';
import { useRouter } from 'next/navigation';
import SyllonautMark from '@/components/SyllonautMark';

export default function StudentJoinForm({ joinCode }: { joinCode: string }) {
  const router = useRouter();
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
      const data = await response.json() as { sessionId?: string; error?: string };
      if (!response.ok || !data.sessionId) throw new Error(data.error || 'Ke hodině se nepodařilo připojit.');
      router.replace(`/student/${data.sessionId}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Ke hodině se nepodařilo připojit.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="shell join-shell">
      <header className="brand student-brand">
        <div className="brand-identity"><Link href="/" className="brand-home"><SyllonautMark /><strong>Syllonaut</strong></Link><span className="beta">STUDENT</span></div>
      </header>
      <section className="panel join-card" aria-busy={busy}>
        <span className="eyebrow">Kód {joinCode}</span>
        <h1>Jak ti máme říkat?</h1>
        <form onSubmit={submit}>
          <label>
            Zobrazované jméno
            <input
              value={displayName}
              onChange={(event) => {
                setDisplayName(event.target.value.slice(0, 60));
                if (error) setError('');
              }}
              autoComplete="nickname"
              placeholder="Např. Tereza"
              required
              aria-invalid={Boolean(error)}
              aria-describedby={error ? errorId : undefined}
            />
          </label>
          <div className="actions"><button className="primary" disabled={busy}>{busy ? 'Připojuji…' : 'Připojit se'}</button><Link href="/join" className="secondary button-link">Jiný kód</Link></div>
        </form>
        {error ? <div id={errorId} className="error" role="alert" style={{ marginTop: 12 }}>{error}</div> : null}
      </section>
    </main>
  );
}
