'use client';

import Link from 'next/link';
import { useEffect, useId, useRef, useState } from 'react';
import styles from './HeaderMobileNav.module.css';

type Props = {
  signedIn: boolean;
  current?: 'home' | 'pricing';
};

export default function HeaderMobileNav({ signedIn, current = 'home' }: Props) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const navigationId = useId();

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
        aria-label={open ? 'Zavřít navigaci' : 'Otevřít navigaci'}
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
        <nav id={navigationId} className={styles.menu} aria-label="Mobilní navigace">
          <a href="/#jak-to-funguje" onClick={() => setOpen(false)}>Jak to funguje</a>
          <Link href="/pricing" aria-current={current === 'pricing' ? 'page' : undefined} onClick={() => setOpen(false)}>Ceník</Link>
          {signedIn ? <Link href="/lessons" onClick={() => setOpen(false)}>Moje lekce</Link> : null}
          <Link href="/new" className={styles.prepareItem} onClick={() => setOpen(false)}>Připravit hodinu</Link>
        </nav>
      ) : null}
    </div>
  );
}
