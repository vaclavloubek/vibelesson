'use client';

import AuthControls from '@/components/AuthControls';

// AuthControls reloads the page after sign-in, so the server page re-renders
// with the complaint form. Its callback prop cannot cross from a server page.
export default function ComplaintSignIn() {
  return <AuthControls onAuthChange={() => undefined} />;
}
