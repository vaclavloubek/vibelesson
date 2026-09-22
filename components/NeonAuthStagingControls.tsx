'use client';

import { FormEvent, useState } from 'react';
import PasswordField from '@/components/PasswordField';
import { neonAuthClient } from '@/lib/neon/auth-client';

type Props = {
  resetToken?: string;
  resetError?: string;
};

function errorMessage(error: unknown, fallback: string) {
  if (error && typeof error === 'object' && 'message' in error && typeof error.message === 'string') {
    return error.message;
  }
  return fallback;
}

export default function NeonAuthStagingControls({ resetToken, resetError }: Props) {
  const session = neonAuthClient.useSession();
  const [activeResetToken, setActiveResetToken] = useState(resetToken);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [passwordConfirm, setPasswordConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState(
    resetError === 'INVALID_TOKEN'
      ? 'Odkaz pro obnovu hesla je neplatný nebo vypršel. Pošli si nový.'
      : '',
  );

  async function signIn(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setMessage('');
    try {
      const result = await neonAuthClient.signIn.email({ email, password });
      if (result.error) {
        setMessage(errorMessage(result.error, 'Přihlášení se nepodařilo.'));
        return;
      }

      setPassword('');
      await session.refetch();
      setMessage('Přihlášení přes Neon Auth proběhlo úspěšně.');
    } catch (error) {
      setMessage(errorMessage(error, 'Přihlášení se nepodařilo. Zkontroluj e-mail a heslo.'));
    } finally {
      setBusy(false);
    }
  }

  async function requestReset() {
    if (!email) {
      setMessage('Nejdřív vyplň e-mail importovaného účtu.');
      return;
    }

    setBusy(true);
    setMessage('');
    try {
      const redirectTo = `${window.location.origin}/auth/neon-staging`;
      const result = await neonAuthClient.requestPasswordReset({ email, redirectTo });
      if (result.error) {
        setMessage(errorMessage(result.error, 'E-mail pro obnovu se nepodařilo odeslat.'));
        return;
      }

      setMessage('Pokud účet existuje, Neon právě odeslal odkaz pro nastavení nového hesla.');
    } catch (error) {
      setMessage(errorMessage(error, 'E-mail pro obnovu se nepodařilo odeslat.'));
    } finally {
      setBusy(false);
    }
  }

  async function resetPassword(event: FormEvent) {
    event.preventDefault();
    if (!activeResetToken) return;
    if (password.length < 8) {
      setMessage('Nové heslo musí mít alespoň 8 znaků.');
      return;
    }
    if (password !== passwordConfirm) {
      setMessage('Hesla se neshodují.');
      return;
    }

    setBusy(true);
    setMessage('');
    try {
      const result = await neonAuthClient.resetPassword({ newPassword: password, token: activeResetToken });
      if (result.error) {
        setMessage(errorMessage(result.error, 'Heslo se nepodařilo nastavit. Pošli si nový odkaz.'));
        return;
      }

      setPassword('');
      setPasswordConfirm('');
      setActiveResetToken(undefined);
      window.history.replaceState({}, '', '/auth/neon-staging');
      setMessage('Nové heslo je uložené. Teď se s ním přihlas.');
    } catch (error) {
      setMessage(errorMessage(error, 'Heslo se nepodařilo nastavit. Pošli si nový odkaz.'));
    } finally {
      setBusy(false);
    }
  }

  async function signOut() {
    setBusy(true);
    setMessage('');
    try {
      const result = await neonAuthClient.signOut();
      if (result.error) {
        setMessage(errorMessage(result.error, 'Odhlášení se nepodařilo.'));
        return;
      }

      await session.refetch();
      setMessage('Odhlášení z Neon Auth proběhlo úspěšně.');
    } catch (error) {
      setMessage(errorMessage(error, 'Odhlášení se nepodařilo.'));
    } finally {
      setBusy(false);
    }
  }

  if (activeResetToken) {
    return (
      <div className="vibe-editor">
        <form onSubmit={resetPassword}>
          <PasswordField label="Nové heslo" value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="new-password" minLength={8} required />
          <PasswordField label="Nové heslo znovu" value={passwordConfirm} onChange={(event) => setPasswordConfirm(event.target.value)} autoComplete="new-password" minLength={8} required />
          <button className="primary" disabled={busy}>{busy ? 'Ukládám…' : 'Nastavit nové heslo'}</button>
        </form>
        {message ? <div className="auth-message" role="status" aria-live="polite">{message}</div> : null}
      </div>
    );
  }

  if (session.isPending) {
    return <p className="muted-copy">Kontroluji Neon Auth relaci…</p>;
  }

  if (session.data?.user) {
    return (
      <div>
        <p className="muted-copy">Přihlášený Neon účet: <strong>{session.data.user.email}</strong></p>
        <button className="primary" type="button" onClick={signOut} disabled={busy}>
          {busy ? 'Odhlašuji…' : 'Odhlásit testovací účet'}
        </button>
        {message ? <div className="auth-message" role="status" aria-live="polite">{message}</div> : null}
      </div>
    );
  }

  return (
    <div className="vibe-editor">
      <form onSubmit={signIn}>
        <label>
          E-mail importovaného účtu
          <input type="email" value={email} onChange={(event) => setEmail(event.target.value)} autoComplete="email" required />
        </label>
        <PasswordField label="Heslo" value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="current-password" required />
        <button className="primary" disabled={busy}>{busy ? 'Přihlašuji…' : 'Přihlásit přes Neon'}</button>
        <button className="secondary" type="button" onClick={requestReset} disabled={busy}>
          Poslat odkaz pro nové heslo
        </button>
      </form>
      {message ? <div className="auth-message" role="status" aria-live="polite">{message}</div> : null}
    </div>
  );
}
