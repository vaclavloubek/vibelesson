import { createBrowserClient } from '@supabase/ssr';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createFetchWithTimeout } from '@/lib/fetch-with-timeout';
import { createClient as createNeonClient } from '@/lib/neon/client';

export function createClient() {
  if (process.env.NEXT_PUBLIC_DATABASE_BACKEND === 'neon') {
    return createNeonClient() as unknown as SupabaseClient;
  }

  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    { global: { fetch: createFetchWithTimeout(8_000) } },
  );
}
