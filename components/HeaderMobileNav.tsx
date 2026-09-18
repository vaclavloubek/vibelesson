'use client';

import Link from 'next/link';
import { useEffect, useId, useRef, useState } from 'react';
import { useUiLocale } from '@/components/LocaleProvider';
import styles from './HeaderMobileNav.module.css';
import { trackEvent } from '@/lib/analytics';

type Props = {
  signedIn: boolean;
  current?: 'home' | 'pricing';
};

export default function HeaderMobileNav({ signedIn, current = 'home' }: Props) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const navigationId = useId();
  const locale = useUiLocale();
  const english = locale === 'en';

  useEffect(() => {
    if (!open) return;

    function onPointerDown(event: PointerEvent) {
      if (!wrapRef.current?.contains(event.target as Node)) setOpen(false);
    }

    function onKeyDown(event: KeyboardEvent) {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      setOpen(false);
      window.requestAnimationFrame(() => triggerRef.current?.focus());
    }

    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  return (
    <div className={styles.wrap} ref={wrapRef}>
      <button
        ref={triggerRef}
        type="button"
        className={styles.trigger}
        aria-label={open ? (english ? 'Close navigation' : 'Zavřít navigaci') : (english ? 'Open navigation' : 'Otevřít navigaci')}
        aria-expanded={open}
        aria-controls={navigationId}
        onClick={() => setOpen((value) => !value)}
      >
        <span className={styles.icon} aria-hidden="true">
          <span />
          <span />
          <span />
        </span>
      </button>

      {open ? (
        <nav id={navigationId} className={styles.menu} aria-label={english ? 'Mobile navigation' : 'Mobilní navigace'}>
          <a href={`/${locale}#jak-to-funguje`} onClick={() => setOpen(false)}>{english ? 'How it works' : 'Jak to funguje'}</a>
          <Link href={`/${locale}/pricing`} aria-current={current === 'pricing' ? 'page' : undefined} onClick={() => setOpen(false)}>{english ? 'Pricing' : 'Ceník'}</Link>
          {signedIn ? <Link href="/lessons" onClick={() => setOpen(false)}>{english ? 'My lessons' : 'Moje lekce'}</Link> : null}
          <Link href="/new" className={styles.prepareItem} onClick={() => { trackEvent('prepare_lesson_cta_click', { location: 'header' }); setOpen(false); }}>{english ? 'Prepare a lesson' : 'Připravit hodinu'}</Link>
        </nav>
      ) : null}
    </div>
  );
}
