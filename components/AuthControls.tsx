'use client';

import { FormEvent, useEffect, useMemo, useState } from 'react';
import type { User } from '@supabase/supabase-js';
import { createClient } from '@/lib/supabase/client';

type Props = {
  onAuthChange: (user: User | null) => void;
};

type Quota = {
  used: number;
  monthly_limit: number | null;
  remaining: number | null;
  is_unlimited: boolean;
};

export default function AuthControls({ onAuthChange }: Props) {
  const supabase = useMemo(() => createClient(), []);
  const [user, setUser] = useState<User | null>(null);
  const [quota, setQuota] = useState<Quota | null>(null);
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');

  async function loadQuota(nextUser: User | null) {
    if (!nextUser) {
      setQuota(null);
      return;
    }

    const { data, error } = await supabase.rpc('get_lesson_quota');
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

  async function signIn(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMessage('');
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setBusy(false);
    if (error) setMessage('Přihlášení se nepodařilo. Zkontroluj e-mail a heslo.');
  }

  async function signUp() {
    if (!email || password.length < 8) {
      setMessage('Zadej platný e-mail a heslo alespoň o 8 znacích.');
      return;
    }

    setBusy(true);
    setMessage('');
    const { data, error } = await supabase.auth.signUp({ email, password });
    setBusy(false);

    if (error) {
      setMessage(error.message);
      return;
    }

    setMessage(data.session
      ? 'Účet je vytvořený a jsi přihlášený.'
      : 'Účet je vytvořený. Potvrď registraci odkazem v e-mailu a potom se přihlas.');
  }

  async function signOut() {
    setBusy(true);
    await supabase.auth.signOut();
    setBusy(false);
    setOpen(false);
  }

  if (user) {
    const quotaText = quota?.is_unlimited
      ? 'AI lekce: neomezeně'
      : quota && quota.monthly_limit !== null
        ? `AI lekce: zbývá ${quota.remaining ?? 0} z ${quota.monthly_limit}`
        : 'AI lekce: načítám limit…';

    return (
      <div className="auth-signed-in">
        <span title={user.email ?? ''}>{user.email}</span>
        <span className="auth-quota">{quotaText}</span>
        <button type="button" className="auth-link" onClick={signOut} disabled={busy}>Odhlásit</button>
      </div>
    );
  }

  return (
    <div className="auth-wrap">
      <button type="button" className="secondary auth-trigger" onClick={() => setOpen((value) => !value)} aria-expanded={open}>
        Přihlásit se
      </button>
      {open ? (
        <div className="auth-popover">
          <strong>Přihlášení do EduPilotu</strong>
          <p>Účet je potřeba jen pro AI funkce. Ukázkovou lekci můžeš používat bez přihlášení.</p>
          <form onSubmit={signIn}>
            <label>E-mail<input type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" required /></label>
            <label>Heslo<input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" minLength={8} required /></label>
            <button className="primary" disabled={busy}>{busy ? 'Pracuji…' : 'Přihlásit se'}</button>
          </form>
          <button type="button" className="auth-link auth-signup" onClick={signUp} disabled={busy}>Vytvořit nový účet</button>
          {message ? <div className="auth-message">{message}</div> : null}
        </div>
      ) : null}
    </div>
  );
}
