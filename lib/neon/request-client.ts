import 'server-only';

import { createHash } from 'node:crypto';
import { headers } from 'next/headers';
import { createClient as createNeonClient } from '@neondatabase/neon-js';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createServerAuth } from '@/lib/neon/auth';
import { readNeonSessionTokenCookie } from '@/lib/neon/auth-cookies';
import { isTransientNeonAuthFailure } from '@/lib/neon/auth-failure';
import { createNeonSql } from '@/lib/neon/server';

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
 * The session cookie exactly as Neon Auth receives it: the library reads the
 * request Cookie header, so this must too (not the cookie store, which also
 * reflects cookies set earlier in the same server action).
 */
async function requestSessionCookie() {
  return readNeonSessionTokenCookie((await headers()).get('cookie'));
}

function sessionCacheKey(cookieValue: string) {
  return createHash('sha256').update(cookieValue).digest('hex');
}

/**
 * One Neon Auth /token call per session until the JWT is about to expire.
 * The teacher live view polls several routes, each issuing several Data API
 * queries; minting a JWT per query made Neon Auth reject part of them.
 * Cached by a hash of the session cookie, so a token is only ever returned
 * to the session that minted it. An ambiguous cookie pair gets no token.
 */
async function getSessionDataApiToken() {
  const cookie = await requestSessionCookie();
  if (cookie.state !== 'single') return null;
  const key = sessionCacheKey(cookie.value);

  const cached = tokenCache.get(key);
  if (cached && cached.expiresAt - 30_000 > Date.now()) return cached.token;

  const pending = pendingTokens.get(key);
  if (pending) return pending;

  const request = (async () => {
    try {
      const { data, error } = await createServerAuth().token();
      if (error || !data?.token) {
        console.warn('Neon Auth token request failed', { status: (error as { status?: number } | null)?.status });
        return isTransientNeonAuthFailure(error) && cached && cached.expiresAt > Date.now() ? cached.token : null;
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

type NeonSessionResult = Awaited<ReturnType<ReturnType<typeof createServerAuth>['getSession']>>;
const SESSION_CACHE_MS = 60_000;
const SESSION_STALE_MS = 300_000;
const sessionCache = new Map<string, { result: NeonSessionResult; verifiedAt: number }>();
const pendingSessions = new Map<string, Promise<NeonSessionResult>>();

const NO_SESSION = { data: null, error: null } as NeonSessionResult;

function sessionTokenOf(result: NeonSessionResult) {
  const token = (result.data?.session as { token?: unknown } | undefined)?.token;
  return typeof token === 'string' ? token : null;
}

/**
 * The library answers getSession() from its signed session_data cookie
 * without checking that the copy belongs to the session cookie sent with it,
 * so a copy left over from the previous account could name the wrong user.
 * The copy is used only when it carries this cookie's session token;
 * otherwise the session is verified upstream with the cookie itself.
 */
async function getSessionForCookie(token: string, hasSessionData: boolean): Promise<NeonSessionResult> {
  const auth = createServerAuth();
  if (hasSessionData) {
    const fromCookieCache = await auth.getSession();
    if (fromCookieCache.data?.user && sessionTokenOf(fromCookieCache) === token) return fromCookieCache;
  }

  const verified = await auth.getSession({ query: { disableCookieCache: 'true' } });
  const verifiedToken = sessionTokenOf(verified);
  if (verified.data?.user && verifiedToken !== null && verifiedToken !== token) {
    console.error('Neon Auth session does not match the request session cookie');
    return NO_SESSION;
  }
  return verified;
}

/**
 * The signed session_data cookie expires after sessionDataTtl and is not
 * refreshed for API requests, after which every call verified the session
 * upstream; the polling teacher view then got part of them rejected (401).
 * Successful verifications are reused for 60 s per session (keyed by a hash
 * of the session cookie); a transient upstream failure falls back to the last
 * verification for up to 5 minutes. Only an unavailable or rate-limited
 * Neon Auth counts as transient; a 401/403 rejects the session and drops the
 * cached verification. Signing out removes the cookie and key.
 * Two session cookies at once (see lib/neon/auth-cookies.ts) resolve to no
 * user; proxy.ts expires the legacy one on the same response.
 */
export async function getVerifiedNeonSession(): Promise<NeonSessionResult> {
  const cookie = await requestSessionCookie();
  if (cookie.state === 'ambiguous') {
    console.warn('Neon Auth session cookie is ambiguous; treating the request as signed out');
    return NO_SESSION;
  }
  if (cookie.state === 'none') return NO_SESSION;
  const key = sessionCacheKey(cookie.value);

  const cached = sessionCache.get(key);
  if (cached && Date.now() - cached.verifiedAt < SESSION_CACHE_MS) return cached.result;

  const pending = pendingSessions.get(key);
  if (pending) return pending;

  const request = (async () => {
    try {
      const result = await getSessionForCookie(cookie.token, cookie.hasSessionData);
      if (!result.error && result.data?.user) {
        if (sessionCache.size > 5_000) sessionCache.clear();
        sessionCache.set(key, { result, verifiedAt: Date.now() });
        return result;
      }
      if (result.error && isTransientNeonAuthFailure(result.error) && cached && Date.now() - cached.verifiedAt < SESSION_STALE_MS) {
        console.warn('Neon Auth session check failed; using recent verification');
        return cached.result;
      }
      sessionCache.delete(key);
      return result;
    } finally {
      pendingSessions.delete(key);
    }
  })();
  pendingSessions.set(key, request);
  return request;
}

export async function getNeonRequestUser() {
  const { data, error } = await getVerifiedNeonSession();
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
