import 'server-only';

import { createClient as createNeonClient } from '@neondatabase/neon-js';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createServerAuth } from '@/lib/neon/auth';
import { createNeonSql } from '@/lib/neon/server';

/**
 * User-scoped Data API client. The JWT comes from the Neon Auth session on the
 * current request; a missing or failed session never falls back to a DB owner.
 */
export function createNeonRequestClient() {
  const url = process.env.NEON_DATA_API_URL || process.env.NEXT_PUBLIC_NEON_DATA_API_URL;
  if (!url) throw new Error('Neon Data API URL is not configured.');

  return createNeonClient({
    dataApi: {
      url,
      getToken: async () => {
        const { data, error } = await createServerAuth().token();
        if (error || !data?.token) return null;
        return data.token;
      },
    },
  });
}

export async function getNeonRequestUser() {
  const { data, error } = await createServerAuth().getSession();
  if (error) return { user: null, error };
  const user = data?.user;
  if (!user) return { user: null, error: null };

  // Better Auth identity alone is not enough until every application table has
  // been migrated. Reject sessions that do not map to an imported app identity.
  const sql = createNeonSql();
  const identities = await sql`
    select raw_user_meta_data
    from app_identity.users
    where id = ${user.id}::uuid
      and lower(email) = lower(${user.email})
      and deleted_at is null
    limit 1
  `;
  if (identities.length !== 1) {
    return { user: null, error: new Error('Neon Auth user has no matching application identity.') };
  }
  return {
    user: { ...user, user_metadata: identities[0].raw_user_meta_data ?? {} },
    error: null,
  };
}

/**
 * Transitional PostgREST surface for existing request-scoped routes. It never
 * accepts a caller-provided access token and does not emulate unsupported Auth
 * mutations. Those routes must be ported explicitly before cutover.
 */
export function createNeonRequestCompatClient(): SupabaseClient {
  const dataClient = createNeonRequestClient();
  const auth = {
    getUser: async (accessToken?: string) => {
      if (accessToken) {
        return { data: { user: null }, error: new Error('Bearer-token Auth route requires a Neon-specific implementation.') };
      }
      const { user, error } = await getNeonRequestUser();
      return { data: { user }, error };
    },
    getClaims: async () => {
      const { user, error } = await getNeonRequestUser();
      if (error || !user) {
        return { data: null, error: error ?? new Error('Neon Auth session is missing.') };
      }
      return {
        data: {
          claims: {
            sub: user.id,
            email: user.email,
            user_metadata: user.user_metadata,
          },
        },
        error: null,
      };
    },
    verifyOtp: async () => ({ data: null, error: new Error('Neon Auth verification requires a Neon-specific route.') }),
  };

  return Object.assign(dataClient, { auth }) as unknown as SupabaseClient;
}
