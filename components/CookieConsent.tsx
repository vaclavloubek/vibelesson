'use client';

import { useEffect, useRef, useState } from 'react';
import { usePathname } from 'next/navigation';
import { useUiLocale } from '@/components/LocaleProvider';
import styles from './CookieConsent.module.css';
import {
  ANALYTICS_CONSENT_COOKIE,
  ANALYTICS_CONSENT_VERSION,
  GA_DEBUG_MODE,
  GA_MEASUREMENT_ID,
  gaDisableKey,
} from '@/lib/analytics';

const CONSENT_COOKIE = ANALYTICS_CONSENT_COOKIE;
const CONSENT_VERSION = ANALYTICS_CONSENT_VERSION;
const COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 180;
const GA_COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 395;
const OPEN_SETTINGS_EVENT = 'syllonaut:open-cookie-settings';
const LESSON_SHARE_PATH = /^\/s\/[0-9a-f]{48}(?:\/|$)/;
const WORKSHEET_PATH = /^\/lessons\/[^/]+\/worksheet(?:\/|$)/;

type Consent = {
  version: string;
  analytics: boolean;
  decidedAt: string;
};


function readConsent(): Consent | null {
  const raw = document.cookie
    .split('; ')
    .find((entry) => entry.startsWith(`${CONSENT_COOKIE}=`))
    ?.slice(CONSENT_COOKIE.length + 1);

  if (!raw) return null;

  try {
    const parsed = JSON.parse(decodeURIComponent(raw)) as Partial<Consent>;
    if (parsed.version !== CONSENT_VERSION || typeof parsed.analytics !== 'boolean' || typeof parsed.decidedAt !== 'string') return null;
    return parsed as Consent;
  } catch {
    return null;
  }
}

function writeConsent(analytics: boolean): Consent {
  const next: Consent = { version: CONSENT_VERSION, analytics, decidedAt: new Date().toISOString() };
  const secure = window.location.protocol === 'https:' ? '; Secure' : '';
  document.cookie = `${CONSENT_COOKIE}=${encodeURIComponent(JSON.stringify(next))}; Path=/; Max-Age=${COOKIE_MAX_AGE_SECONDS}; SameSite=Lax${secure}`;
  return next;
}

function clearGaCookies() {
  const secure = window.location.protocol === 'https:' ? '; Secure' : '';
  const syllonautDomain = window.location.hostname === 'syllonaut.com' || window.location.hostname.endsWith('.syllonaut.com')
    ? '; Domain=.syllonaut.com'
    : '';

  for (const pair of document.cookie.split('; ')) {
    const name = pair.split('=')[0];
    if (!name.startsWith('_ga')) continue;
    document.cookie = `${name}=; Path=/; Max-Age=0; SameSite=Lax${secure}`;
    if (syllonautDomain) {
      document.cookie = `${name}=; Path=/; Max-Age=0; SameSite=Lax${syllonautDomain}${secure}`;
    }
  }
}

function ensureGoogleAnalytics(measurementId: string) {
  (window as unknown as Record<string, unknown>)[gaDisableKey(measurementId)] = false;
  window.dataLayer = window.dataLayer ?? [];
  window.gtag = window.gtag ?? function gtag() {
    window.dataLayer?.push(arguments);
  };

  window.gtag?.('consent', 'default', {
    analytics_storage: 'granted',
    ad_storage: 'denied',
    ad_user_data: 'denied',
    ad_personalization: 'denied',
  });

  if (!document.querySelector('script[data-syllonaut-ga4]')) {
    const script = document.createElement('script');
    script.async = true;
    script.src = `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(measurementId)}`;
    script.dataset.syllonautGa4 = 'true';
    document.head.appendChild(script);
    window.gtag?.('js', new Date());
  }
}

export default function CookieConsent() {
  const english = useUiLocale() === 'en';
  const pathname = usePathname();
  const worksheetRoute = WORKSHEET_PATH.test(pathname);
  const analyticsBlocked = LESSON_SHARE_PATH.test(pathname) || worksheetRoute;
  const [consent, setConsent] = useState<Consent | null>(null);
  const [ready, setReady] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [draftAnalytics, setDraftAnalytics] = useState(false);
  const dialogRef = useRef<HTMLDivElement | null>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);
  const gaConfiguredRef = useRef(false);

  useEffect(() => {
    const stored = readConsent();
    setConsent(stored);
    setDraftAnalytics(stored?.analytics ?? false);
    setReady(true);

    function openSettings() {
      previousFocusRef.current = document.activeElement as HTMLElement | null;
      const current = readConsent();
      setDraftAnalytics(current?.analytics ?? false);
      setSettingsOpen(true);
    }

    window.addEventListener(OPEN_SETTINGS_EVENT, openSettings);
    return () => window.removeEventListener(OPEN_SETTINGS_EVENT, openSettings);
  }, []);

  useEffect(() => {
    if (!settingsOpen) return;

    const focusable = () => Array.from(
      dialogRef.current?.querySelectorAll<HTMLElement>('button:not([disabled]), input:not([disabled]), a[href]') ?? [],
    );
    window.requestAnimationFrame(() => focusable()[0]?.focus());

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        event.preventDefault();
        setSettingsOpen(false);
        window.requestAnimationFrame(() => previousFocusRef.current?.focus());
        return;
      }
      if (event.key !== 'Tab') return;
      const controls = focusable();
      if (controls.length === 0) return;
      const first = controls[0];
      const last = controls[controls.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }

    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [settingsOpen]);

  useEffect(() => {
    if (!ready || !GA_MEASUREMENT_ID) return;
    const runtime = window as unknown as Record<string, unknown>;

    if (analyticsBlocked || !consent?.analytics) {
      runtime[gaDisableKey(GA_MEASUREMENT_ID)] = true;
      gaConfiguredRef.current = false;
      if (analyticsBlocked) return;
      window.gtag?.('consent', 'update', {
        analytics_storage: 'denied',
        ad_storage: 'denied',
        ad_user_data: 'denied',
        ad_personalization: 'denied',
      });
      clearGaCookies();
      return;
    }

    ensureGoogleAnalytics(GA_MEASUREMENT_ID);
    window.gtag?.('consent', 'update', {
      analytics_storage: 'granted',
      ad_storage: 'denied',
      ad_user_data: 'denied',
      ad_personalization: 'denied',
    });

    if (!gaConfiguredRef.current) {
      window.gtag?.('config', GA_MEASUREMENT_ID, {
        send_page_view: true,
        allow_google_signals: false,
        allow_ad_personalization_signals: false,
        cookie_expires: GA_COOKIE_MAX_AGE_SECONDS,
        ...(GA_DEBUG_MODE ? { debug_mode: true } : {}),
      });
      gaConfiguredRef.current = true;
    }
  }, [analyticsBlocked, consent, ready]);

  function save(analytics: boolean) {
    const next = writeConsent(analytics);
    setConsent(next);
    setDraftAnalytics(analytics);
    setSettingsOpen(false);
    window.requestAnimationFrame(() => previousFocusRef.current?.focus());
  }

  function closeSettings() {
    setSettingsOpen(false);
    window.requestAnimationFrame(() => previousFocusRef.current?.focus());
  }

  if (!ready || worksheetRoute) return null;

  return (
    <>
      {!consent && !settingsOpen ? (
        <section className={styles.banner} aria-label={english ? 'Cookie settings' : 'Nastavení cookies'}>
          <div className={styles.bannerCopy}>
            <strong>{english ? 'You control your cookies.' : 'Cookies pod kontrolou.'}</strong>
            <p>
              {english
                ? 'We use essential cookies for sign-in, security and core Syllonaut functionality. Google Analytics 4 is enabled only with your consent; this version does not use advertising or remarketing signals.'
                : 'Nezbytné cookies používáme pro přihlášení, bezpečnost a fungování Syllonautu. Analytiku pomocí Google Analytics 4 zapneme jen s vaším souhlasem; reklamní a remarketingové signály v této verzi nepoužíváme.'}
            </p>
          </div>
          <div className={styles.bannerActions}>
            <button type="button" className={styles.accept} onClick={() => save(true)}>{english ? 'Allow analytics' : 'Povolit analytické'}</button>
            <button type="button" className={styles.reject} onClick={() => save(false)}>{english ? 'Essential only' : 'Jen nezbytné'}</button>
            <button
              type="button"
              className={styles.settings}
              onClick={() => {
                previousFocusRef.current = document.activeElement as HTMLElement | null;
                setDraftAnalytics(false);
                setSettingsOpen(true);
              }}
            >
              {english ? 'Settings' : 'Nastavení'}
            </button>
          </div>
        </section>
      ) : null}

      {settingsOpen ? (
        <div className={styles.overlay} role="presentation" onMouseDown={(event) => {
          if (event.target === event.currentTarget) closeSettings();
        }}>
          <div
            ref={dialogRef}
            className={styles.dialog}
            role="dialog"
            aria-modal="true"
            aria-labelledby="cookie-settings-title"
            aria-describedby="cookie-settings-description"
          >
            <div className={styles.dialogHeader}>
              <div>
                <span>{english ? 'Privacy' : 'Soukromí'}</span>
                <h2 id="cookie-settings-title">{english ? 'Cookie settings' : 'Nastavení cookies'}</h2>
              </div>
              <button type="button" className={styles.close} aria-label={english ? 'Close cookie settings' : 'Zavřít nastavení cookies'} onClick={closeSettings}>×</button>
            </div>
            <p id="cookie-settings-description" className={styles.dialogLead}>
              {english ? 'You can change this choice at any time. Refusing analytics does not limit your use of Syllonaut.' : 'Volbu můžete kdykoli změnit. Odmítnutí analytiky neomezí používání Syllonautu.'}
            </p>
            <div className={styles.preference}>
              <div>
                <strong>{english ? 'Essential cookies' : 'Nezbytné cookies'}</strong>
                <p>{english ? 'Sign-in, security, abuse protection and storing your cookie choice.' : 'Přihlášení, bezpečnost, ochrana proti zneužití a uložení vaší volby cookies.'}</p>
              </div>
              <span className={styles.alwaysOn}>{english ? 'Always active' : 'Vždy aktivní'}</span>
            </div>
            <label className={styles.preference}>
              <div>
                <strong>{english ? 'Analytics cookies' : 'Analytické cookies'}</strong>
                <p>{english ? 'They help us understand how the service is used. Google Analytics 4 loads only after consent, without advertising signals, and analytics cookies are limited to roughly 13 months.' : 'Pomohou nám pochopit používání služby. Google Analytics 4 se načte pouze po souhlasu, bez reklamních signálů a s analytickými cookies omezenými přibližně na 13 měsíců.'}</p>
              </div>
              <input type="checkbox" checked={draftAnalytics} onChange={(event) => setDraftAnalytics(event.target.checked)} aria-label={english ? 'Allow analytics cookies' : 'Povolit analytické cookies'} />
            </label>
            <p className={styles.legalNote}>{english ? 'Details are available in ' : 'Podrobnosti jsou na stránce '}<a href="/gdpr">{english ? 'Privacy (GDPR)' : 'Ochrana osobních údajů (GDPR)'}</a>.</p>
            <div className={styles.dialogActions}>
              <button type="button" className={styles.save} onClick={() => save(draftAnalytics)}>{english ? 'Save choice' : 'Uložit volbu'}</button>
              <button type="button" className={styles.reject} onClick={() => save(false)}>{english ? 'Essential only' : 'Jen nezbytné'}</button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}

export const COOKIE_SETTINGS_EVENT = OPEN_SETTINGS_EVENT;
