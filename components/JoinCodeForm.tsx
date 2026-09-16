'use client';

import Link from 'next/link';
import { FormEvent, useState } from 'react';
import { useRouter } from 'next/navigation';

export default function JoinCodeForm() {
  const router = useRouter();
  const [code, setCode] = useState('');
  const [error, setError] = useState('');

  function submit(event: FormEvent) {
    event.preventDefault();
    const normalized = code.trim().toUpperCase();
    if (!/^[A-HJ-NP-Z2-9]{7}$/.test(normalized)) {
      setError('Zadej sedmimístný kód hodiny.');
      return;
    }
    router.push(`/join/${normalized}`);
  }

  return (
    <main className="shell" style={{ maxWidth: 560 }}>
      <header className="brand" style={{ marginBottom: 18 }}>
        <div className="brand-identity"><Link href="/" className="brand-home"><span className="brand-mark">E</span><strong>EduPilot</strong></Link><span className="beta">STUDENT</span></div>
      </header>
      <section className="panel">
        <span className="eyebrow">Připojit se k hodině</span>
        <h1>Zadej kód</h1>
        <form onSubmit={submit}>
          <label>Kód hodiny<input value={code} onChange={(event) => setCode(event.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 7))} autoCapitalize="characters" autoCorrect="off" inputMode="text" placeholder="ABC7K3M" required /></label>
          <div className="actions"><button className="primary">Pokračovat</button></div>
        </form>
        {error ? <div className="error" style={{ marginTop: 12 }}>{error}</div> : null}
      </section>
    </main>
  );
}
