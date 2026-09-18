'use client';

import Link from 'next/link';
import { COOKIE_SETTINGS_EVENT } from '@/components/CookieConsent';
import styles from './SiteFooter.module.css';

export default function SiteFooter() {
  return (
    <footer className={styles.footer}>
      <div className={styles.identity}>
        <span>© 2026 Syllonaut</span>
        <span>AI navigátor pro interaktivní výuku.</span>
      </div>
      <nav className={styles.links} aria-label="Právní a soukromí">
        <Link href="/gdpr">Ochrana osobních údajů (GDPR)</Link>
        <button type="button" onClick={() => window.dispatchEvent(new Event(COOKIE_SETTINGS_EVENT))}>Nastavení cookies</button>
      </nav>
    </footer>
  );
}
