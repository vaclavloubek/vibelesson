'use client';

import { useMemo, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useUiLocale } from '@/components/LocaleProvider';

export default function DashboardLogoutButton() {
  const locale = useUiLocale();
  const supabase = useMemo(() => createClient(), []);
  const [busy, setBusy] = useState(false);

  async function signOut() {
    if (busy) return;
    setBusy(true);

    try {
      await fetch('/api/auth/clear-live-resume', {
        method: 'POST',
        cache: 'no-store',
      });
    } catch {
      // Supabase sign-out remains authoritative; resume cleanup is best effort.
    }

    const { error } = await supabase.auth.signOut();
    if (error) {
      setBusy(false);
      return;
    }

    window.location.assign(`/${locale}`);
  }

  return (
    <button
      type="button"
      className="auth-link lessons-logout"
      onClick={signOut}
      disabled={busy}
    >
      {busy ? (locale === 'en' ? 'Signing out…' : 'Odhlašuji…') : (locale === 'en' ? 'Sign out' : 'Odhlásit')}
    </button>
  );
}
