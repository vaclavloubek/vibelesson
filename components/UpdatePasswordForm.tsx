'use client';

import Link from 'next/link';
import { FormEvent, useMemo, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import PasswordField from '@/components/PasswordField';
import { useUiLocale } from '@/components/LocaleProvider';
import { neonAuthClient } from '@/lib/neon/auth-client';

export default function UpdatePasswordForm({ neonToken, neonError }: { neonToken?: string; neonError?: string }) {
  const english = useUiLocale() === 'en';
  const neon = process.env.NEXT_PUBLIC_DATABASE_BACKEND === 'neon';
  const ui = (cs: string, en: string) => english ? en : cs;
  const supabase = useMemo(() => createClient(), []);
  const [password, setPassword] = useState('');
  const [passwordConfirm, setPasswordConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState(neon && (neonError || !neonToken)
    ? (english ? 'This reset link is invalid or has expired. Request a new one from sign in.' : 'Odkaz pro obnovu je neplatný nebo vypršel. Vyžádej si nový při přihlášení.')
    : '');
  const [success, setSuccess] = useState(false);

  async function updatePassword(e: FormEvent) {
    e.preventDefault();
    setMessage('');

    if (password.length < 8) {
      setMessage(ui('Nové heslo musí mít alespoň 8 znaků.', 'The new password must be at least 8 characters long.'));
      return;
    }
    if (password !== passwordConfirm) {
      setMessage(ui('Hesla se neshodují.', 'The passwords do not match.'));
      return;
    }

    setBusy(true);
    const { error } = neon
      ? neonToken
        ? await neonAuthClient.resetPassword({ newPassword: password, token: neonToken })
        : { error: { message: 'Missing reset token' } }
      : await supabase.auth.updateUser({ password });
    setBusy(false);

    if (error) {
      setMessage('code' in error && error.code === 'weak_password'
        ? ui('Heslo nesplňuje bezpečnostní požadavky. Použij delší heslo a kombinaci různých typů znaků.', 'The password does not meet the security requirements. Use a longer password with a mix of character types.')
        : ui('Heslo se nepodařilo změnit. Odkaz mohl vypršet; v takovém případě požádej o nový.', 'The password could not be changed. The link may have expired; if so, request a new one.'));
      return;
    }

    setPassword('');
    setPasswordConfirm('');
    if (neon) window.history.replaceState({}, '', '/auth/update-password');
    setSuccess(true);
  }

  if (success) {
    return (
      <>
        <span className="eyebrow">{ui('Hotovo', 'Done')}</span>
        <h1>{ui('Heslo bylo změněno', 'Password changed')}</h1>
        <p className="muted-copy">{neon
          ? ui('Nové heslo je aktivní. Přihlas se s ním v hlavní aplikaci.', 'Your new password is active. Sign in with it in the main app.')
          : ui('Nové heslo je aktivní. Můžeš pokračovat do svých lekcí.', 'Your new password is active. You can continue to your lessons.')}</p>
        <div className="actions">
          <Link href={neon ? '/' : '/lessons'} className="button-link primary">{neon ? ui('Přihlásit se', 'Sign in') : ui('Moje lekce', 'My lessons')}</Link>
        </div>
      </>
    );
  }

  return (
    <>
      <span className="eyebrow">{ui('Obnovení přístupu', 'Account recovery')}</span>
      <h1>{ui('Nastavit nové heslo', 'Set a new password')}</h1>
      <p className="muted-copy">{ui('Zvol nové heslo alespoň o 8 znacích.', 'Choose a new password with at least 8 characters.')}</p>
      <div className="vibe-editor">
        <form onSubmit={updatePassword}>
          <PasswordField label={ui('Nové heslo', 'New password')} value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="new-password" minLength={8} required />
          <PasswordField label={ui('Nové heslo znovu', 'New password again')} value={passwordConfirm} onChange={(e) => setPasswordConfirm(e.target.value)} autoComplete="new-password" minLength={8} required />
          <button className="primary" disabled={busy || (neon && !neonToken)}>{busy ? ui('Ukládám…', 'Saving…') : ui('Uložit nové heslo', 'Save new password')}</button>
        </form>
      </div>
      {message ? <div className="auth-message" role="status">{message}</div> : null}
    </>
  );
}
