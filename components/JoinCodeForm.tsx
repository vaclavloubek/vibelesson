'use client';

import Link from 'next/link';
import { FormEvent, useState } from 'react';
import { useRouter } from 'next/navigation';
import SyllonautMark from '@/components/SyllonautMark';
import LocaleSwitcher from '@/components/LocaleSwitcher';
import { useUiLocale } from '@/components/LocaleProvider';

export default function JoinCodeForm() {
  const router = useRouter();
  const locale = useUiLocale();
  const english = locale === 'en';
  const ui = (cs: string, en: string) => english ? en : cs;
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const errorId = 'join-code-error';

  function submit(event: FormEvent) {
    event.preventDefault();
    const normalized = code.trim().toUpperCase();
    if (!/^[A-HJ-NP-Z2-9]{7}$/.test(normalized)) {
      setError(ui('Zadej sedmimístný kód hodiny.', 'Enter the seven-character lesson code.'));
      return;
    }
    setError('');
    router.push(`/join/${normalized}`);
  }

  return (
    <main className="shell join-shell">
      <header className="brand student-brand">
        <div className="brand-identity"><Link href={`/${locale}`} className="brand-home"><SyllonautMark /><strong>Syllonaut</strong></Link><span className="beta">STUDENT</span></div><LocaleSwitcher />
      </header>
      <section className="panel join-card">
        <span className="eyebrow">{ui('Připojit se k hodině', 'Join a lesson')}</span>
        <h1>{ui('Zadej kód hodiny', 'Enter the lesson code')}</h1>
        <form onSubmit={submit} noValidate>
          <label>
            {ui('Kód hodiny', 'Lesson code')}
            <input
              className="join-code-input"
              value={code}
              onChange={(event) => {
                setCode(event.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 7));
                if (error) setError('');
              }}
              autoCapitalize="characters"
              autoCorrect="off"
              inputMode="text"
              placeholder="ABC7K3M"
              required
              aria-invalid={Boolean(error)}
              aria-describedby={error ? errorId : undefined}
            />
          </label>
          <div className="actions"><button className="primary">{ui('Pokračovat', 'Continue')}</button></div>
        </form>
        {error ? <div id={errorId} className="error" role="alert" style={{ marginTop: 12 }}>{error}</div> : null}
      </section>
    </main>
  );
}
