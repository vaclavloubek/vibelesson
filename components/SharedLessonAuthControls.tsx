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

  return (
    <AuthControls
      onAuthChange={handleAuthChange}
      initialOpen={initialOpen}
      initialMode="signin"
      signupRedirectPath={`/s/${token}${importRequested ? '?import=1' : ''}`}
    />
  );
}
