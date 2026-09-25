'use client';

import Link from 'next/link';
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { User } from '@supabase/supabase-js';
import { useUiLocale } from '@/components/LocaleProvider';
import { createClient } from '@/lib/supabase/client';
import { restartSyllonautGuideForCurrentContext } from '@/lib/onboarding-guide';
import { openHelpPanel, useHelpPanelAvailable } from '@/lib/help/panel-store';
import { SUPERADMIN_USER_ID } from '@/lib/superadmin';
import { quotaSourceLabel, type AiQuotaSnapshot } from '@/lib/ai-quota';
import { signOutFromNeonApp } from '@/app/auth/neon/actions';

export type HeaderAccountUser = Pick<User, 'id' | 'email' | 'user_metadata'>;

type Props = {
  user: HeaderAccountUser;
  quota?: AiQuotaSnapshot | null;
  quotaRefreshKey?: number;
  onSignOut?: () => Promise<void> | void;
};

const ACCOUNT_MENU_ID = 'public-header-account-menu';
const POPOVER_VIEWPORT_GUTTER = 12;

export default function PublicHeaderAccountMenu({ user, quota: controlledQuota, quotaRefreshKey = 0, onSignOut }: Props) {
  const locale = useUiLocale();
  const english = locale === 'en';
  const supabase = useMemo(() => createClient(), []);
  const [loadedQuota, setLoadedQuota] = useState<AiQuotaSnapshot | null>(null);
  const quota = controlledQuota === undefined ? loadedQuota : controlledQuota;
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [hasOrganization, setHasOrganization] = useState(false);
  const helpAvailable = useHelpPanelAvailable();
  const identityBoundaryTriggeredRef = useRef(false);
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const popoverRef = useRef<HTMLDivElement | null>(null);

  const metadata = user.user_metadata as Record<string, unknown> | undefined;
  const metadataName = [metadata?.full_name, metadata?.name, metadata?.given_name]
    .find((value): value is string => typeof value === 'string' && value.trim().length > 0);
  const accountName = metadataName?.trim()
    ?? user.email?.split('@')[0]
    ?? (english ? 'Account' : 'Účet');
  const initial = accountName.trim().charAt(0).toLocaleUpperCase(locale === 'en' ? 'en' : 'cs') || 'S';

  const verifyServerIdentity = useCallback(async () => {
    try {
      const response = await fetch('/api/auth/identity', {
        cache: 'no-store',
        headers: { Accept: 'application/json' },
      });
      if (!response.ok) return true;

      const payload = await response.json().catch(() => ({})) as {
        userId?: string | null;
      };
      const currentUserId = payload.userId ?? null;

      if (currentUserId === user.id) return true;
      if (identityBoundaryTriggeredRef.current) return false;

      identityBoundaryTriggeredRef.current = true;
      setOpen(false);
      setBusy(true);
      setHasOrganization(false);
      window.location.reload();
      return false;
    } catch {
      // Server-side authorization remains authoritative if freshness probing fails.
      return true;
    }
  }, [user.id]);

  const refreshOrganizationMembership = useCallback(async () => {
    if (!(await verifyServerIdentity())) return;
    try {
      const response = await fetch('/api/organizations/membership', {
        cache: 'no-store',
      });
      if (!response.ok) {
        setHasOrganization(false);
        return;
      }
      const payload = await response.json().catch(() => ({})) as {
        hasOrganization?: boolean;
      };
      setHasOrganization(payload.hasOrganization === true);
    } catch {
      setHasOrganization(false);
    }
  }, [verifyServerIdentity]);

  useEffect(() => {
    void verifyServerIdentity().then((matches) => {
      if (matches) void refreshOrganizationMembership();
    });

    const handleFocus = () => {
      void verifyServerIdentity();
    };
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') void verifyServerIdentity();
    };
    const handlePageShow = () => {
      void verifyServerIdentity();
    };

    window.addEventListener('focus', handleFocus);
    window.addEventListener('pageshow', handlePageShow);
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      window.removeEventListener('focus', handleFocus);
      window.removeEventListener('pageshow', handlePageShow);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [refreshOrganizationMembership, verifyServerIdentity]);

  useEffect(() => {
    void fetch('/api/auth/devices/register', {
      method: 'POST',
      cache: 'no-store',
    }).catch(() => {
      // Device enforcement remains server-authoritative on paid operations.
    });
  }, [user.id]);

  useEffect(() => {
    if (controlledQuota !== undefined) return;

    let active = true;
    supabase.rpc('get_ai_quota').then(({ data, error }) => {
      if (!active) return;
      if (error) {
        console.error('load header quota failed', error);
        setLoadedQuota(null);
        return;
      }
      const row = Array.isArray(data) ? data[0] : data;
      setLoadedQuota((row as AiQuotaSnapshot | undefined) ?? null);
    });
    return () => {
      active = false;
    };
  }, [controlledQuota, quotaRefreshKey, supabase, user.id]);

  // The popover is right-aligned to the trigger, but on phones the header stacks
  // and the trigger sits at the left edge, so shift the popover back on screen.
  useLayoutEffect(() => {
    if (!open) return;
    const popover = popoverRef.current;
    if (!popover) return;

    function keepInViewport() {
      if (!popover) return;
      popover.style.transform = '';
      const rect = popover.getBoundingClientRect();
      const viewportWidth = document.documentElement.clientWidth;
      let shift = 0;
      if (rect.left < POPOVER_VIEWPORT_GUTTER) {
        shift = POPOVER_VIEWPORT_GUTTER - rect.left;
      } else if (rect.right > viewportWidth - POPOVER_VIEWPORT_GUTTER) {
        shift = Math.max(viewportWidth - POPOVER_VIEWPORT_GUTTER - rect.right, POPOVER_VIEWPORT_GUTTER - rect.left);
      }
      if (shift !== 0) popover.style.transform = `translateX(${Math.round(shift)}px)`;
    }

    keepInViewport();
    window.addEventListener('resize', keepInViewport);
    return () => window.removeEventListener('resize', keepInViewport);
  }, [open]);

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

    if (onSignOut) {
      try {
        await onSignOut();
      } finally {
        setBusy(false);
      }
      return;
    }

    try {
      await fetch('/api/auth/clear-live-resume', { method: 'POST', cache: 'no-store' });
    } catch {
      // Primary Supabase sign-out remains authoritative.
    }
    const { error } = process.env.NEXT_PUBLIC_DATABASE_BACKEND === 'neon'
      ? await signOutFromNeonApp()
      : await supabase.auth.signOut();
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

  const gradingText = quota?.grading_enabled
    ? quota.grading_unlimited
      ? (english ? 'grading unlimited' : 'hodnocení neomezeně')
      : quota.grading_limit !== null && quota.grading_limit !== undefined
        ? (english ? `grading ${quota.grading_remaining ?? 0}/${quota.grading_limit}` : `hodnocení ${quota.grading_remaining ?? 0}/${quota.grading_limit}`)
        : null
    : null;

  const quotaResetDate = quota?.quota_window_end && !(quota.lesson_unlimited && quota.revision_unlimited)
    ? new Intl.DateTimeFormat(english ? 'en-GB' : 'cs-CZ', {
        dateStyle: 'medium',
        timeZone: 'Europe/Prague',
      }).format(new Date(quota.quota_window_end))
    : null;
  const quotaResetSource = quotaSourceLabel(quota?.quota_source, english);
  const quotaResetText = quotaResetDate
    ? (english
      ? `AI allowance resets: ${quotaResetDate}${quotaResetSource ? ` · ${quotaResetSource}` : ''}`
      : `Obnova AI limitu: ${quotaResetDate}${quotaResetSource ? ` · ${quotaResetSource}` : ''}`)
    : null;

  return (
    <div className="auth-account-wrap" ref={wrapRef}>
      <button
        ref={triggerRef}
        type="button"
        className="auth-account-trigger"
        onClick={async () => {
          if (open) {
            setOpen(false);
            return;
          }
          if (!(await verifyServerIdentity())) return;
          await refreshOrganizationMembership();
          setOpen(true);
        }}
        aria-expanded={open}
        aria-haspopup="menu"
        aria-controls={ACCOUNT_MENU_ID}
      >
        <span className="auth-account-avatar" aria-hidden="true">{initial}</span>
        <span className="auth-account-label">{accountName}</span>
        <span className="auth-account-caret" aria-hidden="true">⌄</span>
      </button>

      {open ? (
        <div ref={popoverRef} id={ACCOUNT_MENU_ID} className="auth-account-popover" role="menu" aria-label={english ? 'Account menu' : 'Nabídka účtu'}>
          <div className="auth-account-summary">
            <strong title={user.email ?? ''}>{user.email ?? accountName}</strong>
            <span>AI: {lessonText} · {revisionText}{gradingText ? ` · ${gradingText}` : ''}</span>
            {quotaResetText ? <span>{quotaResetText}</span> : null}
          </div>

          <div className="auth-account-menu">
            <Link role="menuitem" href="/lessons" className="auth-account-item" onClick={() => setOpen(false)}>
              {english ? 'My lessons' : 'Moje lekce'}
            </Link>
            <Link role="menuitem" href={`/${locale}/subscription`} className="auth-account-item" onClick={() => setOpen(false)}>
              {english ? 'Subscription' : 'Předplatné'}
            </Link>
            {hasOrganization ? (
              <Link role="menuitem" href="/school" className="auth-account-item" onClick={() => setOpen(false)}>
                {english ? 'My school' : 'Moje škola'}
              </Link>
            ) : null}
            {user.id === SUPERADMIN_USER_ID ? (
              <Link
                role="menuitem"
                href="/admin/school-invoices"
                className="auth-account-item"
                onClick={() => setOpen(false)}
              >
                {english ? 'Superadmin invoices' : 'Superadmin faktury'}
              </Link>
            ) : null}
            {helpAvailable ? (
              <button
                type="button"
                role="menuitem"
                className="auth-account-item auth-account-phone-only"
                onClick={() => {
                  setOpen(false);
                  openHelpPanel();
                }}
              >
                {english ? 'Help' : 'Nápověda'}
              </button>
            ) : null}
            <button
              type="button"
              role="menuitem"
              className="auth-account-item"
              onClick={() => {
                setOpen(false);
                restartSyllonautGuideForCurrentContext(user.id);
              }}
            >
              {english ? 'Syllonaut guide' : 'Průvodce Syllonautem'}
            </button>
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
