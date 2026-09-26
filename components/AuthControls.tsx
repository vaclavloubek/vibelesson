'use client';

import { FormEvent, useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from 'react';
import Script from 'next/script';
import type { User } from '@supabase/supabase-js';
import { createClient } from '@/lib/supabase/client';
import { trackEvent } from '@/lib/analytics';
import { TERMS_ACCEPTANCE_KEY } from '@/lib/legal';
import type { AiQuotaSnapshot } from '@/lib/ai-quota';
import PasswordField from '@/components/PasswordField';
import PublicHeaderAccountMenu from '@/components/PublicHeaderAccountMenu';
import { useUiLocale } from '@/components/LocaleProvider';
import { getNeonAppUser, requestNeonPasswordResetForApp, resendNeonEmailVerificationForApp, signInWithNeonForApp, signOutFromNeonApp, signUpWithNeonForApp, verifyNeonEmailForApp } from '@/app/auth/neon/actions';

const TURNSTILE_SITE_KEY = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY || '0x4AAAAAAE53q_PQeEBM9Y2o';
// Loaded only while the sign-in / registration popover is open (LEGAL-022).
const TURNSTILE_SCRIPT_SRC = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
const NEON_APP_AUTH = process.env.NEXT_PUBLIC_DATABASE_BACKEND === 'neon';
const AUTH_POPOVER_ID = 'auth-popover';
const AUTH_POPOVER_TITLE_ID = 'auth-popover-title';
// The code form must survive a reload or a closed tab (e.g. a phone switching
// to the mail app), so the address waiting for its code is kept for 24 hours
// (Privacy Notice 1.11, section 5).
const PENDING_VERIFICATION_KEY = 'syllonaut-pending-email-verification-v1';
const PENDING_VERIFICATION_TTL_MS = 24 * 60 * 60 * 1000;

function rememberPendingVerification(email: string) {
  try {
    window.localStorage.setItem(PENDING_VERIFICATION_KEY, JSON.stringify({ email, savedAt: Date.now() }));
  } catch {
    // Without storage the code form simply does not reopen after a reload.
  }
}

function forgetPendingVerification() {
  try {
    window.localStorage.removeItem(PENDING_VERIFICATION_KEY);
  } catch {
    // Nothing to forget.
  }
}

function readPendingVerification(): string | null {
  try {
    const raw = window.localStorage.getItem(PENDING_VERIFICATION_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { email?: unknown; savedAt?: unknown };
    const age = typeof parsed.savedAt === 'number' ? Date.now() - parsed.savedAt : -1;
    if (typeof parsed.email === 'string' && parsed.email && age >= 0 && age < PENDING_VERIFICATION_TTL_MS) {
      return parsed.email;
    }
  } catch {
    // Corrupt or inaccessible entries are dropped below.
  }
  forgetPendingVerification();
  return null;
}

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
  onSignInSuccess?: (accessToken: string | null) => Promise<void> | void;
  quotaRefreshKey?: number;
  initialOpen?: boolean;
  initialMode?: 'signin' | 'signup';
  signupRedirectPath?: string;
  // The server already knows the visitor is signed in: hold the sign-in button
  // until the client auth check finishes instead of flashing it.
  signedInHint?: boolean;
};

type AuthMode = 'signin' | 'signup' | 'forgot' | 'check-email' | 'verify-email';
type ChallengeStatus = 'loading' | 'checking' | 'interactive' | 'retrying' | 'verified';

type PopoverPosition = {
  top: number;
  left: number;
  maxHeight: number;
};

type TurnstileChallengeProps = {
  ready: boolean;
  unavailable: boolean;
  action: 'signin' | 'signup' | 'recovery' | 'verify';
  onToken: (token: string) => void;
};

function TurnstileChallenge({ ready, unavailable, action, onToken }: TurnstileChallengeProps) {
  const english = useUiLocale() === 'en';
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

  const statusText = unavailable
    ? (english ? 'Security verification is unavailable. Please reload the page or try another browser.' : 'Bezpečnostní ověření není dostupné. Obnovte stránku nebo zkuste jiný prohlížeč.')
    : !ready || status === 'loading'
    ? (english ? 'Loading security verification…' : 'Načítám bezpečnostní ověření…')
    : status === 'checking'
      ? (english ? 'Checking security…' : 'Kontroluji zabezpečení…')
      : status === 'retrying'
        ? (english ? 'Verification failed, trying again…' : 'Ověření se nezdařilo, zkouším znovu…')
        : status === 'verified'
          ? (english ? 'Security verification complete.' : 'Bezpečnostní ověření dokončeno.')
          : '';

  return (
    <div
      aria-label={english ? 'Security verification' : 'Bezpečnostní ověření'}
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

export default function AuthControls({
  onAuthChange,
  onSignInSuccess,
  quotaRefreshKey = 0,
  initialOpen = false,
  initialMode = 'signin',
  signupRedirectPath,
  signedInHint = false,
}: Props) {
  const locale = useUiLocale();
  const english = locale === 'en';
  const supabase = useMemo(() => createClient(), []);
  const [user, setUser] = useState<User | null>(null);
  const [authResolved, setAuthResolved] = useState(false);
  const [quota, setQuota] = useState<AiQuotaSnapshot | null>(null);
  const [open, setOpen] = useState(initialOpen);
  const [mode, setMode] = useState<AuthMode>(initialMode);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [passwordConfirm, setPasswordConfirm] = useState('');
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [marketingConsent, setMarketingConsent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [verificationCode, setVerificationCode] = useState('');
  const [turnstileReady, setTurnstileReady] = useState(false);
  const [turnstileUnavailable, setTurnstileUnavailable] = useState(false);
  const [captchaToken, setCaptchaToken] = useState('');
  const [captchaVersion, setCaptchaVersion] = useState(0);
  const [popoverPosition, setPopoverPosition] = useState<PopoverPosition | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const popoverRef = useRef<HTMLDivElement | null>(null);
  const termsAcceptedId = useId();
  const marketingConsentId = useId();
  const signupStartedRef = useRef(false);
  const pendingVerificationCheckedRef = useRef(false);

  async function loadQuota(nextUser: User | null) {
    if (NEON_APP_AUTH) {
      if (!nextUser) {
        setQuota(null);
        return;
      }
      try {
        const response = await fetch('/api/ai-quota', { cache: 'no-store' });
        setQuota(response.ok ? ((await response.json()) as AiQuotaSnapshot | null) : null);
      } catch {
        setQuota(null);
      }
      return;
    }
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
    setQuota((row as AiQuotaSnapshot | undefined) ?? null);
  }

  useEffect(() => {
    let mounted = true;

    if (NEON_APP_AUTH) {
      void getNeonAppUser().then((neonUser) => {
        if (!mounted) return;
        const nextUser = neonUser
          ? { id: neonUser.id, email: neonUser.email, user_metadata: neonUser.name ? { full_name: neonUser.name } : {} } as User
          : null;
        setUser(nextUser);
        onAuthChange(nextUser);
      }).finally(() => {
        if (mounted) setAuthResolved(true);
      });
      return () => { mounted = false; };
    }

    supabase.auth.getUser().then(({ data }) => {
      if (!mounted) return;
      setUser(data.user);
      setAuthResolved(true);
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
    if (!NEON_APP_AUTH || !authResolved || pendingVerificationCheckedRef.current) return;
    pendingVerificationCheckedRef.current = true;
    if (user) {
      forgetPendingVerification();
      return;
    }
    const pendingEmail = readPendingVerification();
    if (!pendingEmail) return;
    setEmail(pendingEmail);
    setMode('verify-email');
    setOpen(true);
  }, [authResolved, user]);

  useEffect(() => {
    if (!open) return;
    if (window.turnstile) {
      setTurnstileReady(true);
      setTurnstileUnavailable(false);
      return;
    }

    const interval = window.setInterval(() => {
      if (!window.turnstile) return;
      setTurnstileReady(true);
      setTurnstileUnavailable(false);
      window.clearInterval(interval);
    }, 50);

    const timeout = window.setTimeout(() => {
      window.clearInterval(interval);
      if (!window.turnstile) setTurnstileUnavailable(true);
    }, 10000);

    return () => {
      window.clearInterval(interval);
      window.clearTimeout(timeout);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;

    const focusFirstControl = window.requestAnimationFrame(() => {
      popoverRef.current?.querySelector<HTMLElement>('input, button:not([disabled]), a[href], select, textarea')?.focus();
    });
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      setOpen(false);
      window.requestAnimationFrame(() => triggerRef.current?.focus());
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      window.cancelAnimationFrame(focusFirstControl);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [open]);

  useLayoutEffect(() => {
    if (!open) {
      setPopoverPosition(null);
      return;
    }

    const trigger = triggerRef.current;
    const popover = popoverRef.current;
    if (!trigger || !popover) return;

    const margin = 12;
    const gap = 8;

    const repositionPopover = () => {
      const triggerRect = trigger.getBoundingClientRect();
      const popoverRect = popover.getBoundingClientRect();
      const viewport = window.visualViewport;
      const viewportWidth = viewport?.width ?? window.innerWidth;
      const viewportHeight = viewport?.height ?? window.innerHeight;
      const viewportLeft = viewport?.offsetLeft ?? 0;
      const viewportTop = viewport?.offsetTop ?? 0;
      const maxHeight = Math.max(160, viewportHeight - (margin * 2));
      const measuredHeight = Math.min(popoverRect.height, maxHeight);

      const minLeft = viewportLeft + margin;
      const maxLeft = Math.max(
        minLeft,
        viewportLeft + viewportWidth - margin - popoverRect.width,
      );
      const left = Math.min(
        Math.max(triggerRect.left, minLeft),
        maxLeft,
      );

      const minTop = viewportTop + margin;
      const maxTop = Math.max(
        minTop,
        viewportTop + viewportHeight - margin - measuredHeight,
      );
      const belowTop = triggerRect.bottom + gap;
      const aboveTop = triggerRect.top - gap - measuredHeight;
      const top = belowTop + measuredHeight <= viewportTop + viewportHeight - margin
        ? belowTop
        : aboveTop >= minTop
          ? aboveTop
          : Math.min(Math.max(belowTop, minTop), maxTop);

      setPopoverPosition({ top, left, maxHeight });
    };

    repositionPopover();
    const resizeObserver = new ResizeObserver(repositionPopover);
    resizeObserver.observe(popover);
    window.addEventListener('resize', repositionPopover);
    window.addEventListener('scroll', repositionPopover, true);
    window.visualViewport?.addEventListener('resize', repositionPopover);
    window.visualViewport?.addEventListener('scroll', repositionPopover);

    return () => {
      resizeObserver.disconnect();
      window.removeEventListener('resize', repositionPopover);
      window.removeEventListener('scroll', repositionPopover, true);
      window.visualViewport?.removeEventListener('resize', repositionPopover);
      window.visualViewport?.removeEventListener('scroll', repositionPopover);
    };
  }, [mode, open]);

  useEffect(() => {
    if (!initialOpen || initialMode !== 'signup' || signupStartedRef.current) return;
    signupStartedRef.current = true;
    trackEvent('signup_started');
  }, [initialMode, initialOpen]);

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

  function startSignupFromAuth() {
    trackEvent('free_signup_click', { location: 'auth' });
    if (!signupStartedRef.current) {
      signupStartedRef.current = true;
      trackEvent('signup_started');
    }
    switchMode('signup');
  }

  function authRedirectOrigin() {
    return window.location.origin;
  }

  function signupRedirectUrl() {
    if (!signupRedirectPath?.startsWith('/')) return authRedirectOrigin();
    return new URL(signupRedirectPath, window.location.origin).toString();
  }

  async function verifyEmailCode(e: FormEvent) {
    e.preventDefault();
    const code = verificationCode.replace(/\s+/g, '');
    if (!/^\d{6}$/.test(code)) {
      setMessage(english ? 'Enter the 6-digit code from the email.' : 'Zadej šestimístný kód z e-mailu.');
      return;
    }
    setBusy(true);
    setMessage('');
    const result = await verifyNeonEmailForApp(email, code);
    setBusy(false);
    if (result.error) {
      setMessage(english ? 'The code is invalid or has expired. Check it or request a new one.' : 'Kód není platný nebo vypršel. Zkontroluj ho, nebo si nech poslat nový.');
      return;
    }
    setVerificationCode('');
    forgetPendingVerification();
    if (result.signedIn) {
      window.location.reload();
      return;
    }
    switchMode('signin');
    setMessage(english ? 'Your email is confirmed. You can sign in now.' : 'E-mail je potvrzený. Teď se můžeš přihlásit.');
  }

  async function resendEmailCode() {
    if (!captchaToken) {
      setMessage(english ? 'Please complete the security verification.' : 'Dokonči prosím bezpečnostní ověření.');
      return;
    }
    setBusy(true);
    setMessage('');
    const result = await resendNeonEmailVerificationForApp(email, captchaToken);
    setBusy(false);
    resetCaptcha();
    setMessage(result.error
      ? (english ? 'We could not send a new code. Please try again later.' : 'Nový kód se nepodařilo odeslat. Zkus to prosím později.')
      : (english ? 'If the account still needs confirming, we sent a new code.' : 'Pokud účet ještě čeká na potvrzení, poslali jsme nový kód.'));
  }

  async function signIn(e: FormEvent) {
    e.preventDefault();
    if (!captchaToken) {
      setMessage(english ? 'Please complete the security verification.' : 'Dokonči prosím bezpečnostní ověření.');
      return;
    }
    if (NEON_APP_AUTH) {
      setBusy(true);
      setMessage('');
      const result = await signInWithNeonForApp(email.trim(), password, captchaToken);
      setBusy(false);
      resetCaptcha();
      if (result.needsVerification) {
        rememberPendingVerification(email.trim());
        switchMode('verify-email');
        setMessage(english ? 'Your email is not confirmed yet. We sent you a new code.' : 'E-mail ještě není potvrzený. Poslali jsme ti nový kód.');
        return;
      }
      if (result.error) {
        setMessage(english ? 'Sign-in failed. Check your email and password.' : 'Přihlášení se nepodařilo. Zkontroluj e-mail a heslo.');
        return;
      }
      forgetPendingVerification();
      trackEvent('login_completed');
      window.location.reload();
      return;
    }
    const token = captchaToken;
    setBusy(true);
    setMessage('');
    const { data, error } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
      options: { captchaToken: token },
    });
    resetCaptcha();

    if (!error) {
      trackEvent('login_completed');
      await onSignInSuccess?.(data.session?.access_token ?? null);
      setBusy(false);
      return;
    }

    setBusy(false);
    if (error.code === 'email_not_confirmed') {
      setMessage(english ? 'Confirm your email first using the link we sent when you registered.' : 'Nejdřív potvrď e-mail odkazem, který jsme poslali při registraci.');
      return;
    }
    setMessage(english ? 'Sign-in failed. Check your email and password.' : 'Přihlášení se nepodařilo. Zkontroluj e-mail a heslo.');
  }

  async function signUp(e: FormEvent) {
    e.preventDefault();
    const normalizedEmail = email.trim();

    if (!normalizedEmail || password.length < 8) {
      setMessage(english ? 'Enter a valid email address and a password of at least 8 characters.' : 'Zadej platný e-mail a heslo alespoň o 8 znacích.');
      return;
    }
    if (password !== passwordConfirm) {
      setMessage(english ? 'The passwords do not match.' : 'Hesla se neshodují.');
      return;
    }
    if (!termsAccepted) {
      setMessage(english ? 'Accept the Terms of Service to create an account.' : 'Pro vytvoření účtu je potřeba odsouhlasit obchodní podmínky.');
      return;
    }
    if (!captchaToken) {
      setMessage(english ? 'Please complete the security verification.' : 'Dokonči prosím bezpečnostní ověření.');
      return;
    }

    const token = captchaToken;
    setBusy(true);
    setMessage('');
    if (NEON_APP_AUTH) {
      const result = await signUpWithNeonForApp({
        email: normalizedEmail,
        password,
        termsAccepted,
        marketingConsent,
        locale,
        challenge: token,
      });
      setBusy(false);
      resetCaptcha();
      if (result.error) {
        setMessage(english ? 'We could not complete the registration. Please try again later.' : 'Registraci se nepodařilo dokončit. Zkus to prosím později.');
        return;
      }
      trackEvent('signup_completed');
      if (!result.checkEmail) {
        window.location.reload();
        return;
      }
      rememberPendingVerification(normalizedEmail);
      switchMode('verify-email');
      return;
    }
    const termsAcceptedAt = new Date().toISOString();
    const { data, error } = await supabase.auth.signUp({
      email: normalizedEmail,
      password,
      options: {
        emailRedirectTo: signupRedirectUrl(),
        captchaToken: token,
        data: {
          terms_accepted: true,
          terms_acceptance_version: TERMS_ACCEPTANCE_KEY,
          terms_accepted_at: termsAcceptedAt,
          marketing_email_consent: marketingConsent,
          ui_locale: locale,
        },
      },
    });
    setBusy(false);
    resetCaptcha();

    if (error) {
      setMessage(error.code === 'weak_password'
        ? (english ? 'The password does not meet the security requirements. Use a longer password with a mix of character types.' : 'Heslo nesplňuje bezpečnostní požadavky. Použij delší heslo a kombinaci různých typů znaků.')
        : (english ? 'We could not complete the registration. Check the details or try again later.' : 'Registraci se nepodařilo dokončit. Zkontroluj zadané údaje nebo to zkus později.'));
      return;
    }

    if (data.session) {
      trackEvent('signup_completed');
      await onSignInSuccess?.(data.session.access_token);
      setMessage(english ? 'Your account has been created and you are signed in.' : 'Účet je vytvořený a jsi přihlášený.');
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
      setMessage(english ? 'Enter the email address you use to sign in.' : 'Zadej e-mail, který používáš pro přihlášení.');
      return;
    }
    if (!captchaToken) {
      setMessage(english ? 'Please complete the security verification.' : 'Dokonči prosím bezpečnostní ověření.');
      return;
    }

    const token = captchaToken;
    setBusy(true);
    setMessage('');
    if (NEON_APP_AUTH) {
      const result = await requestNeonPasswordResetForApp(normalizedEmail, token);
      setBusy(false);
      resetCaptcha();
      if (result.error) {
        setMessage(english ? 'Security verification failed. Please try again.' : 'Bezpečnostní ověření se nezdařilo. Zkus to prosím znovu.');
        return;
      }
      setMode('check-email');
      setMessage(english ? 'If an account exists for this address, we will send a link to set a new password.' : 'Pokud pro tuto adresu existuje účet, pošleme na ni odkaz pro nastavení nového hesla.');
      return;
    }
    const { error } = await supabase.auth.resetPasswordForEmail(normalizedEmail, {
      redirectTo: authRedirectOrigin(),
      captchaToken: token,
    });
    setBusy(false);
    resetCaptcha();

    if (error) console.error('password recovery request failed', error);
    setMode('check-email');
    setMessage(english ? 'If an account exists for this address, we will send a link to set a new password.' : 'Pokud pro tuto adresu existuje účet, pošleme na ni odkaz pro nastavení nového hesla.');
  }

  async function signOut() {
    setBusy(true);
    try {
      await fetch('/api/auth/clear-live-resume', {
        method: 'POST',
        cache: 'no-store',
      });
    } catch {
      // Logout still clears the primary Supabase session. Live recovery tickets
      // are short-lived and the server endpoint will be retried on a later logout.
    }
    const { error } = NEON_APP_AUTH
      ? await signOutFromNeonApp()
      : await supabase.auth.signOut();
    setBusy(false);
    setOpen(false);
    switchMode('signin');

    if (!error) {
      window.location.assign('/');
    }
  }

  if (user) {
    return (
      <PublicHeaderAccountMenu
        user={user}
        quota={quota}
        quotaRefreshKey={quotaRefreshKey}
        onSignOut={signOut}
      />
    );
  }

  if (signedInHint && !authResolved) return <div className="auth-wrap" aria-hidden="true" />;

  return (
    <div className="auth-wrap">
      <button
        ref={triggerRef}
        type="button"
        className="secondary auth-trigger"
        onClick={() => {
          if (open) {
            setOpen(false);
            return;
          }
          switchMode('signin');
          setOpen(true);
        }}
        aria-expanded={open}
        aria-haspopup="dialog"
        aria-controls={AUTH_POPOVER_ID}
      >
        {english ? 'Sign in' : 'Přihlásit se'}
      </button>
      {open ? <Script id="syllonaut-turnstile" src={TURNSTILE_SCRIPT_SRC} strategy="afterInteractive" /> : null}
      {open ? (
        <div
          ref={popoverRef}
          id={AUTH_POPOVER_ID}
          className="auth-popover"
          style={popoverPosition
            ? {
                top: popoverPosition.top,
                left: popoverPosition.left,
                maxHeight: popoverPosition.maxHeight,
                visibility: 'visible',
              }
            : { visibility: 'hidden' }}
          role="dialog"
          aria-modal="false"
          aria-labelledby={AUTH_POPOVER_TITLE_ID}
        >
          {mode === 'signin' ? (
            <>
              <strong id={AUTH_POPOVER_TITLE_ID}>{english ? 'Sign in to Syllonaut' : 'Přihlášení do Syllonautu' }</strong>
              <p>{english ? 'An account is required for AI features and saving your own lessons.' : 'Účet je potřeba pro AI funkce a ukládání vlastních lekcí.' }</p>
              <form onSubmit={signIn}>
                <label>{english ? 'Email' : 'E-mail'}<input type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" required /></label>
                <PasswordField label={english ? 'Password' : 'Heslo'} value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" minLength={8} required />
                <TurnstileChallenge key={`signin-${captchaVersion}`} ready={turnstileReady} unavailable={turnstileUnavailable} action="signin" onToken={setCaptchaToken} />
                <button className="primary" disabled={busy || !captchaToken}>{busy ? (english ? 'Signing in…' : 'Přihlašuji…') : (english ? 'Sign in' : 'Přihlásit se')}</button>
              </form>
              <button type="button" className="auth-link auth-signup" onClick={() => switchMode('forgot')} disabled={busy}>{english ? 'Forgot password' : 'Zapomenuté heslo' }</button>
              <span aria-hidden="true"> · </span>
              <button type="button" className="auth-link" onClick={startSignupFromAuth} disabled={busy}>{english ? 'Create a free account' : 'Vytvořit účet zdarma' }</button>
            </>
          ) : null}

          {mode === 'signup' ? (
            <>
              <strong id={AUTH_POPOVER_TITLE_ID}>{english ? 'Create a free account' : 'Vytvořit účet zdarma' }</strong>
              <p>{english ? 'The Free account includes 3 new AI lessons and 10 AI edits per month. No plan selection and no payment card required.' : 'Free účet obsahuje 3 nové AI lekce a 10 AI úprav za měsíc. Bez výběru tarifu a bez platební karty.' }</p>
              <form onSubmit={signUp}>
                <label>{english ? 'Email' : 'E-mail'}<input type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" required /></label>
                <PasswordField label={english ? 'Password' : 'Heslo'} value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="new-password" minLength={8} required />
                <PasswordField label={english ? 'Password again' : 'Heslo znovu'} value={passwordConfirm} onChange={(e) => setPasswordConfirm(e.target.value)} autoComplete="new-password" minLength={8} required />
                <div className="auth-marketing-consent">
                  <input
                    id={termsAcceptedId}
                    type="checkbox"
                    checked={termsAccepted}
                    onChange={(event) => setTermsAccepted(event.target.checked)}
                    required
                  />
                  <label htmlFor={termsAcceptedId}>
                    {english ? 'I agree to the ' : 'Souhlasím s '}
                    <a href={`/${locale}/terms`} target="_blank" rel="noreferrer">{english ? 'Terms of Service' : 'obchodními podmínkami'}</a>
                    {english ? ' and have read the ' : ' a seznámil(a) jsem se s '}
                    <a href={`/${locale}/gdpr`} target="_blank" rel="noreferrer">{english ? 'Privacy Notice' : 'ochranou osobních údajů'}</a>.
                  </label>
                </div>
                <div className="auth-marketing-consent">
                  <input
                    id={marketingConsentId}
                    type="checkbox"
                    checked={marketingConsent}
                    onChange={(event) => setMarketingConsent(event.target.checked)}
                  />
                  <label htmlFor={marketingConsentId}>
                    {english
                      ? 'I want to receive Syllonaut news, case studies and occasional offers by email. Consent is optional and can be withdrawn at any time. '
                      : 'Chci dostávat e-mailem novinky, případové studie a občasné nabídky Syllonautu. Souhlas je dobrovolný a můžu ho kdykoli odvolat. '}
                    <a href={`/${locale}/gdpr`} target="_blank" rel="noreferrer">{english ? 'More about data processing.' : 'Více o zpracování údajů.'}</a>
                  </label>
                </div>
                <TurnstileChallenge key={`signup-${captchaVersion}`} ready={turnstileReady} unavailable={turnstileUnavailable} action="signup" onToken={setCaptchaToken} />
                <button className="primary" disabled={busy || !captchaToken || !termsAccepted}>{busy ? (english ? 'Creating account…' : 'Vytvářím účet…') : (english ? 'Create account' : 'Vytvořit účet')}</button>
              </form>
              <button type="button" className="auth-link auth-signup" onClick={() => switchMode('signin')} disabled={busy}>{english ? 'I already have an account' : 'Už mám účet' }</button>
            </>
          ) : null}

          {mode === 'forgot' ? (
            <>
              <strong id={AUTH_POPOVER_TITLE_ID}>{english ? 'Reset password' : 'Obnovení hesla' }</strong>
              <p>{english ? 'Enter the email address for your account. To protect privacy, we do not reveal whether an address is registered.' : 'Zadej e-mail k účtu. Kvůli ochraně soukromí neprozrazujeme, zda je adresa v systému registrovaná.' }</p>
              <form onSubmit={requestPasswordReset}>
                <label>{english ? 'Email' : 'E-mail'}<input type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" required /></label>
                <TurnstileChallenge key={`recovery-${captchaVersion}`} ready={turnstileReady} unavailable={turnstileUnavailable} action="recovery" onToken={setCaptchaToken} />
                <button className="primary" disabled={busy || !captchaToken}>{busy ? (english ? 'Sending…' : 'Odesílám…') : (english ? 'Send reset link' : 'Poslat odkaz pro obnovu')}</button>
              </form>
              <button type="button" className="auth-link auth-signup" onClick={() => switchMode('signin')} disabled={busy}>{english ? 'Back to sign in' : 'Zpět k přihlášení' }</button>
            </>
          ) : null}

          {mode === 'verify-email' ? (
            <>
              <strong id={AUTH_POPOVER_TITLE_ID}>{english ? 'Confirm your email' : 'Potvrďte e-mail' }</strong>
              <p>{english ? `We sent a 6-digit code to ${email}. Enter it to finish creating your account.` : `Na adresu ${email} jsme poslali šestimístný kód. Zadáním kódu dokončíš vytvoření účtu.` }</p>
              <form onSubmit={verifyEmailCode}>
                <label>{english ? 'Code from the email' : 'Kód z e-mailu'}<input type="text" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9 ]*" maxLength={7} value={verificationCode} onChange={(e) => setVerificationCode(e.target.value)} required /></label>
                <button className="primary" disabled={busy || verificationCode.replace(/\s+/g, '').length !== 6}>{busy ? (english ? 'Confirming…' : 'Potvrzuji…') : (english ? 'Confirm email' : 'Potvrdit e-mail')}</button>
              </form>
              <p>{english ? 'Did not get it? Check your spam folder, or request a new code.' : 'Nepřišel? Zkontroluj spam, nebo si nech poslat nový kód.' }</p>
              <TurnstileChallenge key={`verify-${captchaVersion}`} ready={turnstileReady} unavailable={turnstileUnavailable} action="verify" onToken={setCaptchaToken} />
              <button type="button" className="auth-link auth-signup" onClick={resendEmailCode} disabled={busy || !captchaToken}>{english ? 'Send a new code' : 'Poslat nový kód' }</button>
              <span aria-hidden="true"> · </span>
              <button type="button" className="auth-link" onClick={() => { forgetPendingVerification(); switchMode('signin'); }} disabled={busy}>{english ? 'Back to sign in' : 'Zpět k přihlášení' }</button>
            </>
          ) : null}

          {mode === 'check-email' ? (
            <>
              <strong id={AUTH_POPOVER_TITLE_ID}>{english ? 'Check your email' : 'Zkontrolujte e-mail' }</strong>
              <p>
                {message || (english ? 'If this is a new address, we sent a confirmation link. Complete registration with one click.' : 'Pokud je tato adresa nová, poslali jsme na ni potvrzovací odkaz. Registraci dokončíš jedním kliknutím.')}
              </p>
              {!message ? <p>{english ? 'If an account already exists for this address, a new one will not be created. You can sign in or reset your password.' : 'Pokud už účet na této adrese existuje, nový účet se nevytvoří. Můžeš se přihlásit nebo obnovit heslo.' }</p> : null}
              <button type="button" className="auth-link" onClick={() => switchMode('signin')}>{english ? 'Back to sign in' : 'Zpět k přihlášení' }</button>
            </>
          ) : null}

          {message && mode !== 'check-email' ? <div className="auth-message" role="status" aria-live="polite">{message}</div> : null}
        </div>
      ) : null}
    </div>
  );
}
