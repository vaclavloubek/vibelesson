'use client';

import Link from 'next/link';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useUiLocale } from '@/components/LocaleProvider';
import { createClient } from '@/lib/supabase/client';

export type HeaderAccountUser = {
  id: string;
  email?: string | null;
  user_metadata?: Record<string, unknown> | null;
};

type Props = {
  user: HeaderAccountUser;
  quotaRefreshKey?: number;
};

type Quota = {
  lesson_limit: number | null;
  lesson_remaining: number | null;
  revision_limit: number | null;
  revision_remaining: number | null;
  lesson_unlimited: boolean;
  revision_unlimited: boolean;
};

const ACCOUNT_MENU_ID = 'public-header-account-menu';

export default function PublicHeaderAccountMenu({ user, quotaRefreshKey = 0 }: Props) {
  const locale = useUiLocale();
  const english = locale === 'en';
  const supabase = useMemo(() => createClient(), []);
  const [quota, setQuota] = useState<Quota | null>(null);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);

  const metadata = user.user_metadata ?? undefined;
  const metadataName = [metadata?.full_name, metadata?.name, metadata?.given_name]
    .find((value): value is string => typeof value === 'string' && value.trim().length > 0);
  const accountName = metadataName?.trim()
    ?? user.email?.split('@')[0]
    ?? (english ? 'Account' : 'Účet');
  const initial = accountName.trim().charAt(0).toLocaleUpperCase(locale === 'en' ? 'en' : 'cs') || 'S';

  useEffect(() => {
    let active = true;
    supabase.rpc('get_ai_quota').then(({ data, error }) => {
      if (!active) return;
      if (error) {
        console.error('load header quota failed', error);
        setQuota(null);
        return;
      }
      const row = Array.isArray(data) ? data[0] : data;
      setQuota((row as Quota | undefined) ?? null);
    });
    return () => {
      active = false;
    };
  }, [quotaRefreshKey, supabase, user.id]);

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

  async function signOut() {
    if (busy) return;
    setBusy(true);
    try {
      await fetch('/api/auth/clear-live-resume', { method: 'POST', cache: 'no-store' });
    } catch {
      // Primary Supabase sign-out remains authoritative.
    }
    const { error } = await supabase.auth.signOut();
    if (error) {
      setBusy(false);
      return;
    }
    window.location.assign(`/${locale}`);
  }

  const lessonText = quota?.lesson_unlimited
    ? (english ? 'lessons unlimited' : 'lekce neomezeně')
    : quota?.lesson_limit !== null && quota?.lesson_limit !== undefined
      ? (english ? `lessons ${quota.lesson_remaining ?? 0}/${quota.lesson_limit}` : `lekce ${quota.lesson_remaining ?? 0}/${quota.lesson_limit}`)
      : (english ? 'lessons loading' : 'lekce načítám');

  const revisionText = quota?.revision_unlimited
    ? (english ? 'edits unlimited' : 'úpravy neomezeně')
    : quota?.revision_limit !== null && quota?.revision_limit !== undefined
      ? (english ? `edits ${quota.revision_remaining ?? 0}/${quota.revision_limit}` : `úpravy ${quota.revision_remaining ?? 0}/${quota.revision_limit}`)
      : (english ? 'edits loading' : 'úpravy načítám');

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
              onClick={signOut}
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
