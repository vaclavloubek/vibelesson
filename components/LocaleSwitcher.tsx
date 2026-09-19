'use client';

import { useMemo } from 'react';
import { usePathname } from 'next/navigation';
import { useUiLocale } from '@/components/LocaleProvider';
import { createClient } from '@/lib/supabase/client';
import { LOCALE_COOKIE, LOCALE_COOKIE_MAX_AGE, type UiLocale } from '@/lib/i18n';
import styles from './LocaleSwitcher.module.css';

function targetPath(pathname: string, locale: UiLocale) {
  const segments = pathname.split('/').filter(Boolean);
  if (segments[0] === 'cs' || segments[0] === 'en') {
    segments[0] = locale;
    return `/${segments.join('/')}`;
  }
  if (pathname === '/') return `/${locale}`;
  if (pathname === '/pricing' || pathname === '/gdpr') return `/${locale}${pathname}`;
  return pathname;
}

export default function LocaleSwitcher() {
  const locale = useUiLocale();
  const pathname = usePathname();
  const supabase = useMemo(() => createClient(), []);

  async function switchLocale(nextLocale: UiLocale) {
    if (nextLocale === locale) return;
    const secure = window.location.protocol === 'https:' ? '; Secure' : '';
    document.cookie = `${LOCALE_COOKIE}=${nextLocale}; Path=/; Max-Age=${LOCALE_COOKIE_MAX_AGE}; SameSite=Lax${secure}`;

    try {
      const { data } = await supabase.auth.getSession();
      if (data.session) {
        const { error } = await supabase.rpc('set_ui_locale', { p_locale: nextLocale });
        if (error) console.warn('persist UI locale failed', { code: error.code });
      }
    } catch {
      // Locale navigation must remain available even if preference persistence fails.
    }

    window.location.assign(targetPath(pathname, nextLocale));
  }

  return (
    <div className={styles.switcher} role="group" aria-label={locale === 'en' ? 'Interface language' : 'Jazyk rozhraní'}>
      <button type="button" className={locale === 'cs' ? styles.active : undefined} aria-pressed={locale === 'cs'} onClick={() => switchLocale('cs')}>CZ</button>
      <span aria-hidden="true">/</span>
      <button type="button" className={locale === 'en' ? styles.active : undefined} aria-pressed={locale === 'en'} onClick={() => switchLocale('en')}>EN</button>
    </div>
  );
}
