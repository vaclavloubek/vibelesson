// Cookie names used by @neondatabase/auth (src/server/constants.ts).
export const NEON_AUTH_COOKIE_PREFIX = '__Secure-neon-auth.';
export const NEON_AUTH_SESSION_TOKEN_COOKIE = `${NEON_AUTH_COOKIE_PREFIX}session_token`;
export const NEON_AUTH_SESSION_DATA_COOKIE = `${NEON_AUTH_COOKIE_PREFIX}local.session_data`;

/**
 * Neon Auth cookies in a raw Cookie header, in header order. A name can occur
 * more than once: until 0.9.153 the /api/auth proxy set its cookies with
 * `Domain=<host>` while the sign-in/sign-out server actions set host-only
 * ones, so a browser could hold both variants. Signing out cleared only the
 * host-only variant, and the next sign-in then shared the browser with the
 * previous account's session.
 */
export function neonAuthCookies(cookieHeader: string | null | undefined) {
  const found: { name: string; value: string }[] = [];
  for (const chunk of (cookieHeader ?? '').split(';')) {
    const eq = chunk.indexOf('=');
    if (eq === -1) continue;
    const name = chunk.slice(0, eq).trim();
    if (name.startsWith(NEON_AUTH_COOKIE_PREFIX)) found.push({ name, value: chunk.slice(eq + 1).trim() });
  }
  return found;
}

export function duplicatedNeonAuthCookieNames(cookieHeader: string | null | undefined) {
  const seen = new Set<string>();
  const duplicated = new Set<string>();
  for (const { name } of neonAuthCookies(cookieHeader)) {
    if (seen.has(name)) duplicated.add(name);
    seen.add(name);
  }
  return duplicated;
}

export type NeonSessionTokenCookie =
  | { state: 'none' }
  | { state: 'ambiguous' }
  | { state: 'single'; value: string; token: string; hasSessionData: boolean };

/**
 * The session token cookie the request carries. Two session cookies (or two
 * session_data copies) cannot be told apart from the header, and the library
 * and browsers do not agree on which one wins, so that state is ambiguous and
 * must not resolve to any user.
 */
export function readNeonSessionTokenCookie(cookieHeader: string | null | undefined): NeonSessionTokenCookie {
  const cookies = neonAuthCookies(cookieHeader);
  const sessions = cookies.filter((cookie) => cookie.name === NEON_AUTH_SESSION_TOKEN_COOKIE);
  const sessionData = cookies.filter((cookie) => cookie.name === NEON_AUTH_SESSION_DATA_COOKIE);
  if (sessions.length > 1 || sessionData.length > 1) return { state: 'ambiguous' };
  if (sessions.length === 0 || !sessions[0].value) return { state: 'none' };

  let value = sessions[0].value;
  try {
    value = decodeURIComponent(value);
  } catch {
    // Keep the raw value; a malformed cookie simply will not match a session.
  }
  // Better Auth signs the cookie as `<session token>.<signature>`.
  return { state: 'single', value, token: value.split('.')[0], hasSessionData: sessionData.length === 1 };
}

/**
 * Set-Cookie values that expire the `Domain=<host>` variants of the given
 * cookies. Host-only cookies of the same name are a different cookie and
 * stay untouched.
 */
export function neonAuthDomainCookieDeletions(names: Iterable<string>, hostname: string) {
  return [...names].map((name) => (
    `${name}=; Domain=${hostname}; Path=/; Max-Age=0; Expires=Thu, 01 Jan 1970 00:00:00 GMT; Secure; HttpOnly; SameSite=Lax`
  ));
}

/**
 * Rewrites the auth proxy's Set-Cookie headers to host-only cookies, the same
 * scope the server actions use, so sign-out always clears the only copy.
 */
export function withHostOnlyNeonAuthCookies(response: Response) {
  const setCookies = response.headers.getSetCookie();
  if (setCookies.length === 0) return response;

  const headers = new Headers();
  response.headers.forEach((value, name) => {
    if (name.toLowerCase() !== 'set-cookie') headers.append(name, value);
  });
  for (const cookie of setCookies) {
    const name = cookie.slice(0, cookie.indexOf('=')).trim();
    headers.append(
      'set-cookie',
      name.startsWith(NEON_AUTH_COOKIE_PREFIX) ? cookie.replace(/;\s*Domain=[^;]*/gi, '') : cookie,
    );
  }
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}
