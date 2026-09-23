'use client';

import AuthControls from '@/components/AuthControls';

// AuthControls reloads the page after sign-in, so a server page re-renders
// with the signed-in content. Its callback prop cannot cross from a server page.
export default function SignInControl() {
  return <AuthControls onAuthChange={() => undefined} />;
}
