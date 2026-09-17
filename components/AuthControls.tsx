'use client';

import { FormEvent, useEffect, useMemo, useRef, useState } from 'react';
import type { User } from '@supabase/supabase-js';
import { createClient } from '@/lib/supabase/client';

const TURNSTILE_SITE_KEY = '0x4AAAAAAE53q_PQeEBM9Y2o';

type TurnstileApi = {
  render: (
    container: HTMLElement,
    options: {
      sitekey: string;
      action?: string;
      theme?: 'light' | 'dark' | 'auto';
      appearance?: 'always' | 'execute' | 'interaction-only';
      callback: (token: string) => void;
      'before-interactive-callback'?: () => void;
      'after-interactive-callback'?: () => void;
      'expired-callback'?: () => void;
      'timeout-callback'?: () => void;
      'error-callback'?: (errorCode?: string) => void;
    },
  ) => string;
  remove: (widgetId: string) => void;
};

declare global {
  interface Window {
    turnstile?: TurnstileApi;
  }
}

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
type ChallengeStatus = 'loading' | 'checking' | 'interactive' | 'retrying' | 'verified';

type TurnstileChallengeProps = {
  ready: boolean;
  action: 'signin' | 'signup' | 'recovery';
  onToken: (token: string) => void;
};

function TurnstileChallenge({ ready, action, onToken }: TurnstileChallengeProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [status, setStatus] = useState<ChallengeStatus>('loading');

  useEffect(() => {
    if (!ready || !containerRef.current || !window.turnstile) {
      setStatus('loading');
      return;
    }

    onToken('');
    setStatus('checking');
    const widgetId = window.turnstile.render(containerRef.current, {
      sitekey: TURNSTILE_SITE_KEY,
      action,
      theme: 'auto',
      appearance: 'interaction-only',
      callback: (token) => {
        setStatus('verified');
        onToken(token);
      },
      'before-interactive-callback': () => setStatus('interactive'),
      'after-interactive-callback': () => setStatus((current) => current === 'verified' ? current : 'checking'),
      'expired-callback': () => {
        setStatus('checking');
        onToken('');
      },
      'timeout-callback': () => {
        setStatus('interactive');
        onToken('');
      },
      'error-callback': (errorCode) => {
        console.warn('Turnstile challenge failed', errorCode);
        setStatus('retrying');
        onToken('');
      },
    });

    return () => {
      window.turnstile?.remove(widgetId);
    };
  }, [action, onToken, ready]);

  const statusText = !ready || status === 'loading'
    ? 'Načítám bezpečnostní ověření…'
    : status === 'checking'
      ? 'Kontroluji zabezpečení…'
      : status === 'retrying'
        ? 'Ověření se nezdařilo, zkouším znovu…'
        : status === 'verified'
          ? 'Bezpečnostní ověření dokončeno.'
          : '';

  return (
    <div
      aria-label="Bezpečnostní ověření"
      aria-live="polite"
      style={{ minHeight: 65, position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
    >
      {statusText ? (
        <span style={{ position: 'absolute', color: 'var(--muted)', fontSize: 12, textAlign: 'center' }}>
          {statusText}
        </span>
      ) : null}
      <div ref={containerRef} style={{ width: '100%', display: 'flex', justifyContent: 'center' }} />
    </div>
  );
}

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
  const [turnstileReady, setTurnstileReady] = useState(false);
  const [captchaToken, setCaptchaToken] = useState('');
  const [captchaVersion, setCaptchaVersion] = useState(0);

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

  useEffect(() => {
    if (window.turnstile) {
      setTurnstileReady(true);
      return;
    }

    const interval = window.setInterval(() => {
      if (!window.turnstile) return;
      setTurnstileReady(true);
      window.clearInterval(interval);
    }, 50);

    const timeout = window.setTimeout(() => {
      window.clearInterval(interval);
    }, 10000);

    return () => {
      window.clearInterval(interval);
      window.clearTimeout(timeout);
    };
  }, []);

  function resetCaptcha() {
    setCaptchaToken('');
    setCaptchaVersion((value) => value + 1);
  }

  function switchMode(nextMode: AuthMode) {
    setMode(nextMode);
    setMessage('');
    setPassword('');
    setPasswordConfirm('');
    resetCaptcha();
  }

  function authRedirectOrigin() {
    return window.location.origin;
  }

  async function signIn(e: FormEvent) {
    e.preventDefault();
    if (!captchaToken) {
      setMessage('Dokonči prosím bezpečnostní ověření.');
      return;
    }

    const token = captchaToken;
    setBusy(true);
    setMessage('');
    const { error } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
      options: { captchaToken: token },
    });
    setBusy(false);
    resetCaptcha();

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
    if (!captchaToken) {
      setMessage('Dokonči prosím bezpečnostní ověření.');
      return;
    }

    const token = captchaToken;
    setBusy(true);
    setMessage('');
    const { data, error } = await supabase.auth.signUp({
      email: normalizedEmail,
      password,
      options: {
        emailRedirectTo: authRedirectOrigin(),
        captchaToken: token,
      },
    });
    setBusy(false);
    resetCaptcha();

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
    if (!captchaToken) {
      setMessage('Dokonči prosím bezpečnostní ověření.');
      return;
    }

    const token = captchaToken;
    setBusy(true);
    setMessage('');
    const { error } = await supabase.auth.resetPasswordForEmail(normalizedEmail, {
      redirectTo: authRedirectOrigin(),
      captchaToken: token,
    });
    setBusy(false);
    resetCaptcha();

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
                <TurnstileChallenge key={`signin-${captchaVersion}`} ready={turnstileReady} action="signin" onToken={setCaptchaToken} />
                <button className="primary" disabled={busy || !captchaToken}>{busy ? 'Přihlašuji…' : 'Přihlásit se'}</button>
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
                <TurnstileChallenge key={`signup-${captchaVersion}`} ready={turnstileReady} action="signup" onToken={setCaptchaToken} />
                <button className="primary" disabled={busy || !captchaToken}>{busy ? 'Vytvářím účet…' : 'Vytvořit účet'}</button>
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
                <TurnstileChallenge key={`recovery-${captchaVersion}`} ready={turnstileReady} action="recovery" onToken={setCaptchaToken} />
                <button className="primary" disabled={busy || !captchaToken}>{busy ? 'Odesílám…' : 'Poslat odkaz pro obnovu'}</button>
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
