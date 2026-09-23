import 'server-only';

import { createHash } from 'node:crypto';
import { cookies } from 'next/headers';
import { createClient as createNeonClient } from '@neondatabase/neon-js';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createServerAuth } from '@/lib/neon/auth';
import { createNeonSql } from '@/lib/neon/server';

const SESSION_COOKIE_SUFFIX = 'neon-auth.session_token';
const tokenCache = new Map<string, { token: string; expiresAt: number }>();
const pendingTokens = new Map<string, Promise<string | null>>();

function jwtExpiry(token: string) {
  try {
    const payload = JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString('utf8'));
    if (typeof payload.exp === 'number') return payload.exp * 1000;
  } catch {
    // Fall through to a short default lifetime.
  }
  return Date.now() + 60_000;
}

/**
 * One Neon Auth /token call per session until the JWT is about to expire.
 * The teacher live view polls several routes, each issuing several Data API
 * queries; minting a JWT per query made Neon Auth reject part of them.
 * Cached by a hash of the session cookie, so a token is only ever returned
 * to the session that minted it.
 */
async function getSessionDataApiToken() {
  const cookieStore = await cookies();
  const session = cookieStore.getAll().find((cookie) => cookie.name.endsWith(SESSION_COOKIE_SUFFIX))?.value;
  if (!session) return null;
  const key = createHash('sha256').update(session).digest('hex');

  const cached = tokenCache.get(key);
  if (cached && cached.expiresAt - 30_000 > Date.now()) return cached.token;

  const pending = pendingTokens.get(key);
  if (pending) return pending;

  const request = (async () => {
    try {
      const { data, error } = await createServerAuth().token();
      if (error || !data?.token) {
        console.warn('Neon Auth token request failed', { status: (error as { status?: number } | null)?.status });
        return cached && cached.expiresAt > Date.now() ? cached.token : null;
      }
      if (tokenCache.size > 5_000) tokenCache.clear();
      tokenCache.set(key, { token: data.token, expiresAt: jwtExpiry(data.token) });
      return data.token;
    } finally {
      pendingTokens.delete(key);
    }
  })();
  pendingTokens.set(key, request);
  return request;
}

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
      getToken: getSessionDataApiToken,
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
