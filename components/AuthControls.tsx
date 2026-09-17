'use client';

import { FormEvent, useEffect, useMemo, useState } from 'react';
import type { User } from '@supabase/supabase-js';
import { createClient } from '@/lib/supabase/client';

type Props = {
  onAuthChange: (user: User | null) => void;
  quotaRefreshKey?: number;
};

type Quota = {
  lesson_used: number;
  lesson_limit: number | null;
  lesson_remaining: number | null;
  revision_used: number;
  revision_limit: number | null;
  revision_remaining: number | null;
  lesson_unlimited: boolean;
  revision_unlimited: boolean;
};

type AuthMode = 'signin' | 'signup' | 'forgot' | 'check-email';

export default function AuthControls({ onAuthChange, quotaRefreshKey = 0 }: Props) {
  const supabase = useMemo(() => createClient(), []);
  const [user, setUser] = useState<User | null>(null);
  const [quota, setQuota] = useState<Quota | null>(null);
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<AuthMode>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [passwordConfirm, setPasswordConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');

  async function loadQuota(nextUser: User | null) {
    if (!nextUser) {
      setQuota(null);
      return;
    }

    const { data, error } = await supabase.rpc('get_ai_quota');
    if (error) {
      console.error('load quota failed', error);
      setQuota(null);
      return;
    }

    const row = Array.isArray(data) ? data[0] : data;
    setQuota((row as Quota | undefined) ?? null);
  }

  useEffect(() => {
    let mounted = true;

    supabase.auth.getUser().then(({ data }) => {
      if (!mounted) return;
      setUser(data.user);
      onAuthChange(data.user);
      void loadQuota(data.user);
    });

    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      const nextUser = session?.user ?? null;
      setUser(nextUser);
      onAuthChange(nextUser);
      void loadQuota(nextUser);
      if (nextUser) setOpen(false);
    });

    return () => {
      mounted = false;
      listener.subscription.unsubscribe();
    };
  }, [onAuthChange, supabase]);

  useEffect(() => {
    if (user) void loadQuota(user);
  }, [quotaRefreshKey, user]);

  function switchMode(nextMode: AuthMode) {
    setMode(nextMode);
    setMessage('');
    setPassword('');
    setPasswordConfirm('');
  }

  function authRedirectOrigin() {
    return window.location.origin;
  }

  async function signIn(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMessage('');
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
    setBusy(false);

    if (!error) return;
    if (error.code === 'email_not_confirmed') {
      setMessage('Nejdřív potvrď e-mail odkazem, který jsme poslali při registraci.');
      return;
    }
    setMessage('Přihlášení se nepodařilo. Zkontroluj e-mail a heslo.');
  }

  async function signUp(e: FormEvent) {
    e.preventDefault();
    const normalizedEmail = email.trim();

    if (!normalizedEmail || password.length < 8) {
      setMessage('Zadej platný e-mail a heslo alespoň o 8 znacích.');
      return;
    }
    if (password !== passwordConfirm) {
      setMessage('Hesla se neshodují.');
      return;
    }

    setBusy(true);
    setMessage('');
    const { data, error } = await supabase.auth.signUp({
      email: normalizedEmail,
      password,
      options: {
        emailRedirectTo: authRedirectOrigin(),
      },
    });
    setBusy(false);

    if (error) {
      setMessage(error.code === 'weak_password'
        ? 'Heslo nesplňuje bezpečnostní požadavky. Použij delší heslo a kombinaci různých typů znaků.'
        : 'Registraci se nepodařilo dokončit. Zkontroluj zadané údaje nebo to zkus později.');
      return;
    }

    if (data.session) {
      setMessage('Účet je vytvořený a jsi přihlášený.');
      return;
    }

    setMode('check-email');
    setPassword('');
    setPasswordConfirm('');
  }

  async function requestPasswordReset(e: FormEvent) {
    e.preventDefault();
    const normalizedEmail = email.trim();
    if (!normalizedEmail) {
      setMessage('Zadej e-mail, který používáš pro přihlášení.');
      return;
    }

    setBusy(true);
    setMessage('');
    const { error } = await supabase.auth.resetPasswordForEmail(normalizedEmail, {
      redirectTo: authRedirectOrigin(),
    });
    setBusy(false);

    if (error) console.error('password recovery request failed', error);
    setMode('check-email');
    setMessage('Pokud pro tuto adresu existuje účet, pošleme na ni odkaz pro nastavení nového hesla.');
  }

  async function signOut() {
    setBusy(true);
    await supabase.auth.signOut();
    setBusy(false);
    setOpen(false);
    switchMode('signin');
  }

  if (user) {
    const lessonText = quota?.lesson_unlimited
      ? 'lekce neomezeně'
      : quota && quota.lesson_limit !== null
        ? `lekce ${quota.lesson_remaining ?? 0}/${quota.lesson_limit}`
        : 'lekce načítám';

    const revisionText = quota?.revision_unlimited
      ? 'úpravy neomezeně'
      : quota && quota.revision_limit !== null
        ? `úpravy ${quota.revision_remaining ?? 0}/${quota.revision_limit}`
        : 'úpravy načítám';

    return (
      <div className="auth-signed-in">
        <span title={user.email ?? ''}>{user.email}</span>
        <span className="auth-quota">AI: {lessonText} · {revisionText}</span>
        <button type="button" className="auth-link" onClick={signOut} disabled={busy}>Odhlásit</button>
      </div>
    );
  }

  return (
    <div className="auth-wrap">
      <button
        type="button"
        className="secondary auth-trigger"
        onClick={() => {
          setOpen((value) => !value);
          if (!open) switchMode('signin');
        }}
        aria-expanded={open}
      >
        Přihlásit se
      </button>
      {open ? (
        <div className="auth-popover">
          {mode === 'signin' ? (
            <>
              <strong>Přihlášení do Syllonautu</strong>
              <p>Účet je potřeba pro AI funkce a ukládání vlastních lekcí.</p>
              <form onSubmit={signIn}>
                <label>E-mail<input type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" required /></label>
                <label>Heslo<input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" minLength={8} required /></label>
                <button className="primary" disabled={busy}>{busy ? 'Přihlašuji…' : 'Přihlásit se'}</button>
              </form>
              <button type="button" className="auth-link auth-signup" onClick={() => switchMode('forgot')} disabled={busy}>Zapomenuté heslo</button>
              <span aria-hidden="true"> · </span>
              <button type="button" className="auth-link" onClick={() => switchMode('signup')} disabled={busy}>Vytvořit účet zdarma</button>
            </>
          ) : null}

          {mode === 'signup' ? (
            <>
              <strong>Vytvořit účet zdarma</strong>
              <p>Free účet obsahuje 5 nových AI lekcí a 20 AI úprav za kalendářní měsíc. Bez výběru tarifu a bez platební karty.</p>
              <form onSubmit={signUp}>
                <label>E-mail<input type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" required /></label>
                <label>Heslo<input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="new-password" minLength={8} required /></label>
                <label>Heslo znovu<input type="password" value={passwordConfirm} onChange={(e) => setPasswordConfirm(e.target.value)} autoComplete="new-password" minLength={8} required /></label>
                <button className="primary" disabled={busy}>{busy ? 'Vytvářím účet…' : 'Vytvořit účet'}</button>
              </form>
              <button type="button" className="auth-link auth-signup" onClick={() => switchMode('signin')} disabled={busy}>Už mám účet</button>
            </>
          ) : null}

          {mode === 'forgot' ? (
            <>
              <strong>Obnovení hesla</strong>
              <p>Zadej e-mail k účtu. Kvůli ochraně soukromí neprozrazujeme, zda je adresa v systému registrovaná.</p>
              <form onSubmit={requestPasswordReset}>
                <label>E-mail<input type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" required /></label>
                <button className="primary" disabled={busy}>{busy ? 'Odesílám…' : 'Poslat odkaz pro obnovu'}</button>
              </form>
              <button type="button" className="auth-link auth-signup" onClick={() => switchMode('signin')} disabled={busy}>Zpět k přihlášení</button>
            </>
          ) : null}

          {mode === 'check-email' ? (
            <>
              <strong>Zkontrolujte e-mail</strong>
              <p>
                {message || 'Pokud je tato adresa nová, poslali jsme na ni potvrzovací odkaz. Registraci dokončíš jedním kliknutím.'}
              </p>
              {!message ? <p>Pokud už účet na této adrese existuje, nový účet se nevytvoří. Můžeš se přihlásit nebo obnovit heslo.</p> : null}
              <button type="button" className="auth-link" onClick={() => switchMode('signin')}>Zpět k přihlášení</button>
            </>
          ) : null}

          {message && mode !== 'check-email' ? <div className="auth-message" role="status">{message}</div> : null}
        </div>
      ) : null}
    </div>
  );
}
