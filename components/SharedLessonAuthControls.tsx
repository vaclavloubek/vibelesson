'use client';

import Link from 'next/link';
import { useCallback, useState } from 'react';
import type { User } from '@supabase/supabase-js';
import AuthControls from '@/components/AuthControls';
import { useUiLocale } from '@/components/LocaleProvider';

type Props = {
  initialOpen: boolean;
  token: string;
  importRequested: boolean;
};

export default function SharedLessonAuthControls({
  initialOpen,
  token,
  importRequested,
}: Props) {
  const locale = useUiLocale();
  const english = locale === 'en';
  const [user, setUser] = useState<User | null>(null);
  const [importError, setImportError] = useState('');
  const handleAuthChange = useCallback((nextUser: User | null) => {
    setUser(nextUser);
  }, []);
  const handleSignInSuccess = useCallback(async (accessToken: string | null) => {
    if (!importRequested) return;

    if (!accessToken) {
      window.location.replace(`/s/${token}?import=1`);
      return;
    }

    setImportError('');

    try {
      const response = await fetch(`/api/lesson-shares/${token}/import`, {
        method: 'POST',
        cache: 'no-store',
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      const data = await response.json() as { lessonId?: string; error?: string };

      if (response.ok && typeof data.lessonId === 'string') {
        try {
          window.sessionStorage.removeItem('syllonaut_pending_share_import_v1');
        } catch {
          // Navigation remains authoritative even when storage is unavailable.
        }
        window.location.replace(`/lessons/${data.lessonId}`);
        return;
      }

      if (response.status === 401) {
        window.location.replace(`/s/${token}?import=1`);
        return;
      }

      setImportError(english
        ? 'The lesson copy could not be saved. Please try again.'
        : 'Kopii lekce se nepodařilo uložit. Zkuste to prosím znovu.');
    } catch {
      setImportError(english
        ? 'The lesson copy could not be saved. Please try again.'
        : 'Kopii lekce se nepodařilo uložit. Zkuste to prosím znovu.');
    }
  }, [english, importRequested, token]);

  return (
    <>
      {user ? (
        <nav className="main-nav" aria-label={english ? 'Account navigation' : 'Navigace účtu'}>
          <Link href="/lessons">{english ? 'My lessons' : 'Moje lekce'}</Link>
        </nav>
      ) : null}
      {importError ? <span className="error" role="alert">{importError}</span> : null}
      <AuthControls
        onAuthChange={handleAuthChange}
        onSignInSuccess={handleSignInSuccess}
        initialOpen={initialOpen}
        initialMode="signin"
        signupRedirectPath={`/s/${token}${importRequested ? '?import=1' : ''}`}
      />
    </>
  );
}
