'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import type { User } from '@supabase/supabase-js';
import { useUiLocale } from '@/components/LocaleProvider';

type Props = {
  user: User;
  lessonText: string;
  revisionText: string;
  busy: boolean;
  onSignOut: () => void;
};

const ACCOUNT_MENU_ID = 'header-account-menu';

export default function HeaderAccountMenu({ user, lessonText, revisionText, busy, onSignOut }: Props) {
  const locale = useUiLocale();
  const english = locale === 'en';
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);

  const metadata = user.user_metadata as Record<string, unknown> | undefined;
  const metadataName = [metadata?.full_name, metadata?.name, metadata?.given_name]
    .find((value): value is string => typeof value === 'string' && value.trim().length > 0);
  const accountName = metadataName?.trim()
    ?? user.email?.split('@')[0]
    ?? (english ? 'Account' : 'Účet');
  const initial = accountName.trim().charAt(0).toLocaleUpperCase(locale === 'en' ? 'en' : 'cs') || 'S';

  useEffect(() => {
    if (!open) return;

    function handlePointerDown(event: PointerEvent) {
      if (!wrapRef.current?.contains(event.target as Node)) setOpen(false);
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      setOpen(false);
      window.requestAnimationFrame(() => triggerRef.current?.focus());
    }

    document.addEventListener('pointerdown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [open]);

  return (
    <div className="auth-account-wrap" ref={wrapRef}>
      <button
        ref={triggerRef}
        type="button"
        className="auth-account-trigger"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        aria-haspopup="menu"
        aria-controls={ACCOUNT_MENU_ID}
      >
        <span className="auth-account-avatar" aria-hidden="true">{initial}</span>
        <span className="auth-account-label">{accountName}</span>
        <span className="auth-account-caret" aria-hidden="true">⌄</span>
      </button>

      {open ? (
        <div id={ACCOUNT_MENU_ID} className="auth-account-popover" role="menu" aria-label={english ? 'Account menu' : 'Nabídka účtu'}>
          <div className="auth-account-summary">
            <strong title={user.email ?? ''}>{user.email ?? accountName}</strong>
            <span>AI: {lessonText} · {revisionText}</span>
          </div>

          <div className="auth-account-menu">
            <Link role="menuitem" href="/lessons" className="auth-account-item" onClick={() => setOpen(false)}>
              {english ? 'My lessons' : 'Moje lekce'}
            </Link>
            <Link role="menuitem" href={`/${locale}/pricing`} className="auth-account-item" onClick={() => setOpen(false)}>
              {english ? 'Subscription' : 'Předplatné'}
            </Link>
            <button
              type="button"
              role="menuitem"
              className="auth-account-item auth-account-signout"
              onClick={onSignOut}
              disabled={busy}
            >
              {busy ? (english ? 'Signing out…' : 'Odhlašuji…') : (english ? 'Sign out' : 'Odhlásit')}
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
