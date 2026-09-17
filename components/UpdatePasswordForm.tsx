'use client';

import Link from 'next/link';
import { FormEvent, useMemo, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import PasswordField from '@/components/PasswordField';

export default function UpdatePasswordForm() {
  const supabase = useMemo(() => createClient(), []);
  const [password, setPassword] = useState('');
  const [passwordConfirm, setPasswordConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [success, setSuccess] = useState(false);

  async function updatePassword(e: FormEvent) {
    e.preventDefault();
    setMessage('');

    if (password.length < 8) {
      setMessage('Nové heslo musí mít alespoň 8 znaků.');
      return;
    }
    if (password !== passwordConfirm) {
      setMessage('Hesla se neshodují.');
      return;
    }

    setBusy(true);
    const { error } = await supabase.auth.updateUser({ password });
    setBusy(false);

    if (error) {
      setMessage(error.code === 'weak_password'
        ? 'Heslo nesplňuje bezpečnostní požadavky. Použij delší heslo a kombinaci různých typů znaků.'
        : 'Heslo se nepodařilo změnit. Odkaz mohl vypršet; v takovém případě požádej o nový.');
      return;
    }

    setPassword('');
    setPasswordConfirm('');
    setSuccess(true);
  }

  if (success) {
    return (
      <>
        <span className="eyebrow">Hotovo</span>
        <h1>Heslo bylo změněno</h1>
        <p className="muted-copy">Nové heslo je aktivní. Můžeš pokračovat do svých lekcí.</p>
        <div className="actions">
          <Link href="/lessons" className="button-link primary">Moje lekce</Link>
        </div>
      </>
    );
  }

  return (
    <>
      <span className="eyebrow">Obnovení přístupu</span>
      <h1>Nastavit nové heslo</h1>
      <p className="muted-copy">Zvol nové heslo alespoň o 8 znacích.</p>
      <div className="vibe-editor">
        <form onSubmit={updatePassword}>
          <PasswordField label="Nové heslo" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="new-password" minLength={8} required />
          <PasswordField label="Nové heslo znovu" value={passwordConfirm} onChange={(e) => setPasswordConfirm(e.target.value)} autoComplete="new-password" minLength={8} required />
          <button className="primary" disabled={busy}>{busy ? 'Ukládám…' : 'Uložit nové heslo'}</button>
        </form>
      </div>
      {message ? <div className="auth-message" role="status">{message}</div> : null}
    </>
  );
}
