'use client';

import { createClient as createNeonClient, SupabaseAuthAdapter } from '@neondatabase/neon-js';

export function createClient() {
  const dataApiUrl = process.env.NEXT_PUBLIC_NEON_DATA_API_URL;
  if (!dataApiUrl) {
    throw new Error('Public Neon configuration is incomplete.');
  }
  if (typeof window === 'undefined') {
    // Client components may create the client while being server-rendered
    // (e.g. in useMemo); it is only used in effects and handlers, which never
    // run on the server. Any server-side use still fails loudly.
    return new Proxy({}, {
      get() {
        throw new Error('The Neon browser client is not available during server rendering.');
      },
    }) as unknown as ReturnType<typeof createNeonClient>;
  }

  // The Next.js Auth proxy owns the httpOnly session cookie. A direct call to
  // the Neon Auth hostname cannot read the application's first-party cookie.
  const authUrl = new URL('/api/auth', window.location.origin).toString();

  return createNeonClient({
    auth: { adapter: SupabaseAuthAdapter(), url: authUrl },
    dataApi: { url: dataApiUrl },
  });
}
