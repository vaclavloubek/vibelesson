'use client';

import { useCallback } from 'react';
import AuthControls from '@/components/AuthControls';

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
  const handleAuthChange = useCallback(() => {}, []);
  const handleSignInSuccess = useCallback(() => {
    if (!importRequested) return;
    window.location.replace(`/s/${token}?import=1`);
  }, [importRequested, token]);

  return (
    <AuthControls
      onAuthChange={handleAuthChange}
      onSignInSuccess={handleSignInSuccess}
      initialOpen={initialOpen}
      initialMode="signin"
      signupRedirectPath={`/s/${token}${importRequested ? '?import=1' : ''}`}
    />
  );
}
