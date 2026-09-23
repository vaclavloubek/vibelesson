'use client';

import Link from 'next/link';
import { COOKIE_SETTINGS_EVENT } from '@/components/CookieConsent';
import { useUiLocale } from '@/components/LocaleProvider';
import { PROVIDER_CONTACT } from '@/lib/provider-contact';
import styles from './SiteFooter.module.css';

export default function SiteFooter() {
  const locale = useUiLocale();
  const english = locale === 'en';

  return (
    <footer className={styles.footer}>
      <div className={styles.identity}>
        <span>© 2026 Syllonaut</span>
        <span>{english ? 'AI navigator for interactive teaching.' : 'AI navigátor pro interaktivní výuku.'}</span>
        <span>{english ? 'Phone' : 'Telefon'}: <a href={PROVIDER_CONTACT.phoneHref}>{PROVIDER_CONTACT.phoneDisplay}</a></span>
      </div>
      <nav className={styles.links} aria-label={english ? 'Legal and privacy' : 'Právní a soukromí'}>
        <Link href={`/${locale}/terms`}>{english ? 'Terms of Service' : 'Obchodní podmínky'}</Link>
        <Link href={`/${locale}/withdrawal`}>{english ? 'Withdrawal form' : 'Formulář pro odstoupení'}</Link>
        <Link href={`/${locale}/complaint`}>{english ? 'Complaints' : 'Reklamace'}</Link>
        <Link href={`/${locale}/requirements`}>{english ? 'Technical requirements' : 'Technické požadavky'}</Link>
        <Link href={`/${locale}/dpa`}>{english ? 'Data Processing Agreement' : 'Zpracovatelská smlouva (DPA)'}</Link>
        <Link href={`/${locale}/gdpr`}>{english ? 'Privacy (GDPR)' : 'Ochrana osobních údajů (GDPR)'}</Link>
        <button type="button" onClick={() => window.dispatchEvent(new Event(COOKIE_SETTINGS_EVENT))}>{english ? 'Cookie settings' : 'Nastavení cookies'}</button>
      </nav>
    </footer>
  );
}
