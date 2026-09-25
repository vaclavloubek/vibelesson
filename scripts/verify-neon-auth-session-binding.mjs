import { readFile } from 'node:fs/promises';
import {
  NEON_AUTH_SESSION_DATA_COOKIE,
  NEON_AUTH_SESSION_TOKEN_COOKIE,
  duplicatedNeonAuthCookieNames,
  neonAuthDomainCookieDeletions,
  readNeonSessionTokenCookie,
  withHostOnlyNeonAuthCookies,
} from '../lib/neon/auth-cookies.ts';
import { isTransientNeonAuthFailure } from '../lib/neon/auth-failure.ts';

// SEC-018: signing in as one teacher must never resolve to the account that
// previously used the same browser (legacy Domain= cookie next to the
// host-only one, or a session_data copy from the previous session).
function assert(condition, message) {
  if (!condition) throw new Error(`SEC-018 regression: ${message}`);
}

async function source(path) {
  return readFile(new URL(`../${path}`, import.meta.url), 'utf8');
}

const TOKEN = NEON_AUTH_SESSION_TOKEN_COOKIE;
const DATA = NEON_AUTH_SESSION_DATA_COOKIE;

// --- Cookie parsing ---------------------------------------------------------
assert(readNeonSessionTokenCookie(null).state === 'none', 'no header means no session');
assert(readNeonSessionTokenCookie('theme=dark').state === 'none', 'unrelated cookies mean no session');

const single = readNeonSessionTokenCookie(`a=1; ${TOKEN}=tokA.sig%2Fabc%3D; ${DATA}=jwt`);
assert(single.state === 'single', 'one session cookie is unambiguous');
assert(single.token === 'tokA', 'session token is the part before the signature');
assert(single.value === 'tokA.sig/abc=', 'cookie value is URL-decoded like the library does');
assert(single.hasSessionData === true, 'session_data presence is reported');
assert(readNeonSessionTokenCookie(`${TOKEN}=tokA.sig`).hasSessionData === false, 'missing session_data is reported');

assert(
  readNeonSessionTokenCookie(`${TOKEN}=old.sig; ${TOKEN}=new.sig`).state === 'ambiguous',
  'two session cookies (legacy Domain= + host-only) must not resolve to either account',
);
assert(
  readNeonSessionTokenCookie(`${TOKEN}=new.sig; ${DATA}=old; ${DATA}=new`).state === 'ambiguous',
  'two session_data copies must not resolve to either account',
);

const duplicated = duplicatedNeonAuthCookieNames(`${TOKEN}=a; x=1; ${TOKEN}=b; ${DATA}=c; x=2`);
assert(duplicated.size === 1 && duplicated.has(TOKEN), 'only duplicated Neon Auth cookies are reported');

const [deletion] = neonAuthDomainCookieDeletions([TOKEN], 'www.syllonaut.com');
assert(deletion.startsWith(`${TOKEN}=;`), 'deletion targets the cookie name');
assert(/; Domain=www\.syllonaut\.com;/.test(deletion), 'deletion targets only the Domain= variant');
assert(/Max-Age=0/.test(deletion) && /; Secure/.test(deletion) && /; Path=\//.test(deletion), 'deletion expires a __Secure- cookie on /');

// --- Auth proxy responses are host-only -------------------------------------
const upstream = new Response('{"ok":true}', { status: 200, headers: { 'content-type': 'application/json' } });
upstream.headers.append('set-cookie', `${TOKEN}=t.s; Domain=www.syllonaut.com; Path=/; HttpOnly; Secure; SameSite=Lax`);
upstream.headers.append('set-cookie', `${DATA}=jwt; Path=/; domain=ep-x.neonauth.eu-central-1.aws.neon.tech; HttpOnly; Secure`);
upstream.headers.append('set-cookie', 'other=1; Domain=www.syllonaut.com; Path=/');
const rewritten = withHostOnlyNeonAuthCookies(upstream);
const cookies = rewritten.headers.getSetCookie();
assert(rewritten.status === 200 && rewritten.headers.get('content-type') === 'application/json', 'status and headers are kept');
assert(cookies.length === 3, 'every Set-Cookie is kept');
assert(!/domain=/i.test(cookies[0]) && !/domain=/i.test(cookies[1]), 'Neon Auth cookies lose their Domain attribute');
assert(/Domain=www\.syllonaut\.com/.test(cookies[2]), 'non-auth cookies are untouched');
assert((await rewritten.text()) === '{"ok":true}', 'body is kept');

// --- Stale verification only on an unavailable Neon Auth (audit B4) ---------
for (const status of [500, 502, 503, 504, 429]) {
  assert(isTransientNeonAuthFailure({ status }), `status ${status} is a transient Neon Auth failure`);
}
for (const status of [400, 401, 403, 404]) {
  assert(!isTransientNeonAuthFailure({ status }), `status ${status} must not reuse a cached verification`);
}
assert(!isTransientNeonAuthFailure(null) && !isTransientNeonAuthFailure({}), 'an error without a status fails closed');

// --- Call sites ---------------------------------------------------------------
const [route, proxy, requestClient, actions] = await Promise.all([
  source('app/api/auth/[...path]/route.ts'),
  source('proxy.ts'),
  source('lib/neon/request-client.ts'),
  source('app/auth/neon/actions.ts'),
]);

assert(/createServerAuth\(\)\.handler\(\)/.test(route), 'auth proxy must not scope cookies to a Domain');
assert(/withHostOnlyNeonAuthCookies\(/.test(route), 'auth proxy must rewrite upstream cookies to host-only');
assert(/state === 'ambiguous'/.test(route), 'auth proxy must refuse an ambiguous session');
assert(/neonAuthDomainCookieDeletions\(duplicated/.test(proxy), 'proxy must expire legacy Domain= copies');

assert(!/cookies\(\)/.test(requestClient), 'request identity must read the Cookie header the library reads');
assert(/sessionTokenOf\(fromCookieCache\) === token/.test(requestClient), 'session_data copy must match the session cookie');
assert(/disableCookieCache: 'true'/.test(requestClient), 'mismatched copy must be re-verified upstream');
assert(/cookie\.state === 'ambiguous'/.test(requestClient), 'ambiguous cookies must resolve to no user');
assert(/result\.error && isTransientNeonAuthFailure\(result\.error\) && cached/.test(requestClient), 'a 401/403 must not fall back to a cached session verification');
assert(/isTransientNeonAuthFailure\(error\) && cached && cached\.expiresAt/.test(requestClient), 'a 401/403 must not fall back to a cached Data API token');

assert(!/createServerAuth\(\)\.getSession\(/.test(actions), 'server actions must use the verified session');
const signIn = actions.slice(actions.indexOf('export async function signInWithNeonForApp'));
assert(
  signIn.indexOf('dropSessionDataCopy()') > -1 && signIn.indexOf('dropSessionDataCopy()') < signIn.indexOf('signIn.email('),
  'sign-in must drop the previous session_data copy first',
);
const verify = actions.slice(actions.indexOf('export async function verifyNeonEmailForApp'));
assert(
  verify.indexOf('dropSessionDataCopy()') > -1 && verify.indexOf('dropSessionDataCopy()') < verify.indexOf('verifyEmail('),
  'code verification (which signs in) must drop the previous session_data copy first',
);

console.log('Neon Auth session binding checks passed.');
