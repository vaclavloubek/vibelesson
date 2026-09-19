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
  const handleAuthChange = useCallback((nextUser: User | null) => {
    setUser(nextUser);
  }, []);
  const handleSignInSuccess = useCallback(() => {
    if (!importRequested) return;
    window.location.replace(`/s/${token}?import=1`);
  }, [importRequested, token]);

  return (
    <>
      {user ? (
        <nav className="main-nav" aria-label={english ? 'Account navigation' : 'Navigace účtu'}>
          <Link href="/lessons">{english ? 'My lessons' : 'Moje lekce'}</Link>
        </nav>
      ) : null}
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
