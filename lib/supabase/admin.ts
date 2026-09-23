import { createClient } from '@supabase/supabase-js';
import { createFetchWithTimeout } from '@/lib/fetch-with-timeout';
import { getDatabaseBackend } from '@/lib/neon/config';

export function createAdminClient() {
  if (getDatabaseBackend() === 'neon') {
    throw new Error('Privileged Supabase route has not been ported to Neon. Refusing cross-database access.');
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const secretKey = process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !secretKey) {
    throw new Error('Supabase server credentials are not configured.');
  }

  return createClient(url, secretKey, {
    global: { fetch: createFetchWithTimeout(8_000) },
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });
}
