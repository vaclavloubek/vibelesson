'use client';

import { createClient as createNeonClient, SupabaseAuthAdapter } from '@neondatabase/neon-js';

export function createClient() {
  const dataApiUrl = process.env.NEXT_PUBLIC_NEON_DATA_API_URL;
  if (typeof window === 'undefined' || !dataApiUrl) {
    throw new Error('Public Neon configuration is incomplete.');
  }

  // The Next.js Auth proxy owns the httpOnly session cookie. A direct call to
  // the Neon Auth hostname cannot read the application's first-party cookie.
  const authUrl = new URL('/api/auth', window.location.origin).toString();

  return createNeonClient({
    auth: { adapter: SupabaseAuthAdapter(), url: authUrl },
    dataApi: { url: dataApiUrl },
  });
}
