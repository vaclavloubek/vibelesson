'use client';

import { useCallback } from 'react';
import type { User } from '@supabase/supabase-js';
import AuthControls from '@/components/AuthControls';

type Props = {
  initialOpen: boolean;
  token: string;
  importRequested: boolean;
  continueImportAfterAuth: boolean;
};

export default function SharedLessonAuthControls({
  initialOpen,
  token,
  importRequested,
  continueImportAfterAuth,
}: Props) {
  const handleAuthChange = useCallback((user: User | null) => {
    if (!user || !continueImportAfterAuth) return;
    window.location.replace(`/s/${token}?import=1`);
  }, [continueImportAfterAuth, token]);

  return (
    <AuthControls
      onAuthChange={handleAuthChange}
      initialOpen={initialOpen}
      initialMode="signin"
      signupRedirectPath={`/s/${token}${importRequested ? '?import=1' : ''}`}
    />
  );
}
