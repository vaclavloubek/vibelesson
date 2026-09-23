import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { createFetchWithTimeout } from '@/lib/fetch-with-timeout';
import { assertApprovedNeonCutover, getDatabaseBackend } from '@/lib/neon/config';
import { createNeonRequestCompatClient } from '@/lib/neon/request-client';

export async function createClient() {
  if (getDatabaseBackend() === 'neon') {
    assertApprovedNeonCutover();
    return createNeonRequestCompatClient();
  }

  const cookieStore = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      global: { fetch: createFetchWithTimeout(8_000) },
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
          } catch {
            // Server Components cannot write cookies. proxy.ts refreshes the session.
          }
        },
      },
    },
  );
}
