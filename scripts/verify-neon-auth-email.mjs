import { generateKeyPairSync, sign } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
import {
  neonAuthEmailAction,
  NeonAuthEmailPayloadError,
  renderNeonAuthEmail,
} from '../lib/neon-auth-email-core.ts';
import {
  NeonAuthWebhookSignatureError,
  verifyNeonAuthWebhookSignature,
} from '../lib/neon-auth-webhook-signature.ts';

function assert(condition, message) {
  if (!condition) throw new Error(`Neon Auth email regression: ${message}`);
}

async function rejects(promiseOrFn, ErrorType, code, message) {
  try {
    await (typeof promiseOrFn === 'function' ? promiseOrFn() : promiseOrFn);
  } catch (error) {
    assert(error instanceof ErrorType && error.code === code, `${message} (got ${error?.code ?? error})`);
    return;
  }
  throw new Error(`Neon Auth email regression: ${message} (no error)`);
}

// --- Signature verification -------------------------------------------------
const { publicKey, privateKey } = generateKeyPairSync('ed25519');
const kid = '01dec52b-4666-40f7-87ed-6423552eecaf';
const jwk = { ...publicKey.export({ format: 'jwk' }), kid };
const now = 1_790_000_000_000;

function signBody(rawBody, timestamp, key = privateKey, headerKid = kid) {
  const header = Buffer.from(JSON.stringify({ alg: 'EdDSA', typ: 'JWS', kid: headerKid })).toString('base64url');
  const payloadB64 = Buffer.from(rawBody, 'utf8').toString('base64url');
  const signed = Buffer.from(`${timestamp}.${payloadB64}`, 'utf8').toString('base64url');
  const signature = sign(null, Buffer.from(`${header}.${signed}`), key).toString('base64url');
  return `${header}..${signature}`;
}

const rawBody = JSON.stringify({ event_id: 'evt-1234567890', event_type: 'send.otp' });
const timestamp = String(now - 1_000);
let refreshes = 0;
const loadJwks = async ({ refresh }) => {
  if (refresh) refreshes += 1;
  return refresh ? [jwk] : [];
};

await verifyNeonAuthWebhookSignature({ rawBody, signature: signBody(rawBody, timestamp), kid, timestamp, loadJwks, now });
assert(refreshes === 1, 'unknown kid must trigger exactly one JWKS refresh');

const cachedJwks = async () => [jwk];
await rejects(verifyNeonAuthWebhookSignature({ rawBody: rawBody + ' ', signature: signBody(rawBody, timestamp), kid, timestamp, loadJwks: cachedJwks, now }),
  NeonAuthWebhookSignatureError, 'signature_invalid', 'tampered body must fail');
await rejects(verifyNeonAuthWebhookSignature({ rawBody, signature: signBody(rawBody, timestamp), kid, timestamp: String(now - 1), loadJwks: cachedJwks, now }),
  NeonAuthWebhookSignatureError, 'signature_invalid', 'timestamp is bound into the signature');
await rejects(verifyNeonAuthWebhookSignature({ rawBody, signature: signBody(rawBody, String(now - 6 * 60_000)), kid, timestamp: String(now - 6 * 60_000), loadJwks: cachedJwks, now }),
  NeonAuthWebhookSignatureError, 'timestamp_stale', 'old deliveries must be rejected as replays');
const otherKey = generateKeyPairSync('ed25519').privateKey;
await rejects(verifyNeonAuthWebhookSignature({ rawBody, signature: signBody(rawBody, timestamp, otherKey), kid, timestamp, loadJwks: cachedJwks, now }),
  NeonAuthWebhookSignatureError, 'signature_invalid', 'foreign signing key must fail');
await rejects(verifyNeonAuthWebhookSignature({ rawBody, signature: signBody(rawBody, timestamp), kid: 'other', timestamp, loadJwks: cachedJwks, now }),
  NeonAuthWebhookSignatureError, 'signature_header_invalid', 'kid header mismatch must fail');
await rejects(verifyNeonAuthWebhookSignature({ rawBody, signature: null, kid, timestamp, loadJwks: cachedJwks, now }),
  NeonAuthWebhookSignatureError, 'headers_missing', 'missing signature must fail');
await rejects(verifyNeonAuthWebhookSignature({ rawBody, signature: 'a.b.c', kid, timestamp, loadJwks: cachedJwks, now }),
  NeonAuthWebhookSignatureError, 'signature_format_invalid', 'attached JWS must fail');

// --- Payload → action ---------------------------------------------------------
const authBaseUrl = 'https://ep-green-hat-b24o0won.neonauth.c-6.eu-central-1.aws.neon.tech/neondb/auth';
const options = { authBaseUrl, allowedAppOrigins: ['https://www.syllonaut.com'] };
const expiresAt = new Date(now + 60 * 60_000).toISOString();
const user = { id: '123e4567-e89b-42d3-a456-426614174000', email: 'Teacher@Example.com' };

function magic(linkType, linkUrl, token = 'AbCdEf0123456789') {
  return { event_id: 'evt-magic-0001', event_type: 'send.magic_link', user, event_data: { link_type: linkType, link_url: linkUrl, token, expires_at: expiresAt } };
}

const resetUrl = `${authBaseUrl}/reset-password/AbCdEf0123456789?callbackURL=${encodeURIComponent('https://www.syllonaut.com/auth/update-password')}`;
const reset = neonAuthEmailAction(magic('forget-password', resetUrl), options);
assert(reset.recipient === 'teacher@example.com', 'recipient must be normalized');
assert(reset.action.href === 'https://www.syllonaut.com/auth/update-password?token=AbCdEf0123456789',
  'reset link must go straight to the app form without consuming the token');

const foreignCallback = `${authBaseUrl}/reset-password/AbCdEf0123456789?callbackURL=${encodeURIComponent('https://evil.example/auth/update-password')}`;
assert(neonAuthEmailAction(magic('forget-password', foreignCallback), options).action.href === foreignCallback,
  'untrusted callback must fall back to the Neon-validated link, never be rewritten');

const verifyUrl = `${authBaseUrl}/verify-email?token=abc&callbackURL=${encodeURIComponent('https://www.syllonaut.com/')}`;
assert(neonAuthEmailAction(magic('email-verification', verifyUrl), options).action.href === verifyUrl,
  'verification link must be preserved');

await rejects(() => neonAuthEmailAction(magic('forget-password', 'https://evil.example/reset-password/x'), options),
  NeonAuthEmailPayloadError, 'link_url_untrusted', 'links outside Neon Auth must be refused');
await rejects(() => neonAuthEmailAction(magic('forget-password', `http://ep-green-hat-b24o0won.neonauth.c-6.eu-central-1.aws.neon.tech/neondb/auth/x`), options),
  NeonAuthEmailPayloadError, 'link_url_untrusted', 'plain HTTP links must be refused');
await rejects(() => neonAuthEmailAction({ ...magic('forget-password', resetUrl), event_type: 'user.created' }, options),
  NeonAuthEmailPayloadError, 'event_type_unsupported', 'non-email events must be refused');
await rejects(() => neonAuthEmailAction({ event_id: 'evt-otp-0001', event_type: 'send.otp', user, event_data: { otp_code: '123456', otp_type: 'sign-in', delivery_preference: 'sms' } }, options),
  NeonAuthEmailPayloadError, 'delivery_channel_unsupported', 'SMS OTP must not be emailed');
await rejects(() => neonAuthEmailAction({ event_id: 'evt-otp-0001', event_type: 'send.otp', user: { email: 'nope' }, event_data: { otp_code: '123456', otp_type: 'sign-in' } }, options),
  NeonAuthEmailPayloadError, 'recipient_invalid', 'invalid recipient must be refused');

// --- Rendering ------------------------------------------------------------------
const actions = [
  reset.action,
  { channel: 'link', purpose: 'email-verification', href: verifyUrl, expiresAt },
  { channel: 'link', purpose: 'sign-in', href: `${authBaseUrl}/magic-link/verify?token=x`, expiresAt },
  { channel: 'code', purpose: 'forget-password', code: '482913', expiresAt },
  { channel: 'code', purpose: 'email-verification', code: '482913', expiresAt },
  { channel: 'code', purpose: 'sign-in', code: '482913', expiresAt },
];
const subjects = new Set();
for (const locale of ['cs', 'en']) {
  for (const action of actions) {
    const email = renderNeonAuthEmail(action, locale, new Date(now));
    subjects.add(email.subject);
    assert(email.html.includes(`lang="${locale}"`), 'html lang must match locale');
    assert(email.html.includes('#151721') && email.html.includes('#f6f5f1') && email.html.includes('#5b57e8'), 'Orbital Precision palette must be used');
    assert(!/neon/i.test(email.subject) && !/neon auth|myneon/i.test(email.text), 'Neon branding must not leak');
    assert(!/https?:\/\/fonts\./i.test(email.html), 'no remote fonts');
    const images = email.html.match(/<img\b[^>]*>/gi) ?? [];
    assert(images.length === 1 && images[0].includes('src="https://www.syllonaut.com/email/syllonaut-mark.png"') && images[0].includes('alt="Syllonaut"'),
      'the only image must be the Syllonaut mark (syllonaut-mark.png)');
    assert(!/>\s*S\s*<\/td>/.test(email.html), 'the letter "S" tile must not return');
    assert(!/#8a8c93|#9a9ca3/i.test(email.html), 'low-contrast greys #8a8c93 / #9a9ca3 must not return');
    if (action.channel === 'code') assert(email.html.includes('482913') && email.text.includes('482913'), 'code must be shown');
    else assert(email.html.includes(action.href.replace(/&/g, '&amp;')) && email.text.includes(action.href), 'link must be shown');
    assert(email.text.includes(locale === 'cs' ? 'Platnost vyprší za 60 minut.' : 'It is valid for 60 minutes.'), 'validity must be stated');
  }
}
assert(subjects.has('Obnovení hesla k Syllonautu') && subjects.has('Dokončete registraci do Syllonautu') && subjects.has('Přihlášení do Syllonautu'),
  'Czech subjects must match the previous Supabase templates');

const hostile = renderNeonAuthEmail({ channel: 'link', purpose: 'sign-in', href: 'https://x.test/?a="><script>', expiresAt: null }, 'cs');
assert(!hostile.html.includes('<script>'), 'hrefs must be escaped');

// --- Wiring -----------------------------------------------------------------------
const route = await readFile(new URL('../app/api/webhooks/neon-auth/route.ts', import.meta.url), 'utf8');
assert(route.indexOf('verifyNeonAuthWebhookSignature') < route.indexOf('JSON.parse(rawBody)'), 'signature must be verified before parsing');
assert(route.includes("idempotencyKey: `neon-auth/${eventId}`"), 'Resend idempotency must follow the Neon event id');
const proxy = await readFile(new URL('../proxy.ts', import.meta.url), 'utf8');
assert(proxy.includes('api/webhooks/neon-auth'), 'proxy must not touch the webhook');

// --- Signup email verification (code) -------------------------------------------
const actionsSource = await readFile(new URL('../app/auth/neon/actions.ts', import.meta.url), 'utf8');
const profileInsert = actionsSource.indexOf('insert into public.profiles');
const signupSend = actionsSource.indexOf("sendVerificationOtp({ email, type: 'email-verification' })");
assert(profileInsert > 0 && signupSend > profileInsert, 'signup code must be sent after the profile (and its locale) exists');
// The server SDK normalizes Better Auth error codes, so the sign-in check must
// match the code the installed SDK actually returns, not the upstream one.
const sdkDist = new URL('../node_modules/@neondatabase/auth/dist/', import.meta.url);
const sdkHelpers = (await readdir(sdkDist)).filter((name) => name.startsWith('better-auth-helpers-') && name.endsWith('.mjs'));
assert(sdkHelpers.length === 1, 'expected one Neon Auth SDK error helper chunk');
const sdkHelperSource = await readFile(new URL(sdkHelpers[0], sdkDist), 'utf8');
const unverifiedKey = sdkHelperSource.match(/"EMAIL_NOT_VERIFIED":\s*AuthErrorCode\.(\w+)/)?.[1];
const unverifiedCode = unverifiedKey && sdkHelperSource.match(new RegExp(`\\b${unverifiedKey}:\\s*"([a-z_]+)"`))?.[1];
assert(unverifiedCode, 'could not resolve the SDK code for an unverified email');
assert(actionsSource.includes(`code === '${unverifiedCode}'`) && actionsSource.includes('needsVerification: true'),
  `unverified sign-in (SDK code ${unverifiedCode}) must lead to code entry`);
assert(/verifyNeonAuthChallenge\(challenge, 'verify'\)[\s\S]*sendVerificationOtp/.test(actionsSource), 'resending a code must require Turnstile');
assert(/\^\\d\{6\}\$/.test(actionsSource), 'only 6-digit codes may reach Neon Auth');
const authProxy = await readFile(new URL('../app/api/auth/[...path]/route.ts', import.meta.url), 'utf8');
assert(authProxy.includes("'email-otp/send-verification-otp'") && authProxy.includes("'email-otp/verify-email'"),
  'public auth proxy must not bypass Turnstile for OTP endpoints');
const authControls = await readFile(new URL('../components/AuthControls.tsx', import.meta.url), 'utf8');
assert(authControls.includes("mode === 'verify-email'") && authControls.includes('autoComplete="one-time-code"'),
  'the auth popover must offer code entry');
assert(authControls.includes("switchMode('verify-email')"), 'signup must switch to code entry');
assert(/rememberPendingVerification\(normalizedEmail\);\s*switchMode\('verify-email'\)/.test(authControls)
  && /needsVerification\) \{\s*rememberPendingVerification\(/.test(authControls),
  'signup and unverified sign-in must remember the address waiting for its code');
assert(/readPendingVerification\(\);[\s\S]{0,120}setMode\('verify-email'\);\s*setOpen\(true\)/.test(authControls),
  'a remembered address must reopen code entry after a reload or closed tab');
assert(/setVerificationCode\(''\);\s*forgetPendingVerification\(\)/.test(authControls),
  'a confirmed email must forget the remembered address');
const signupCode = renderNeonAuthEmail({ channel: 'code', purpose: 'email-verification', code: '123456', expiresAt: new Date(now + 15 * 60_000).toISOString() }, 'cs', new Date(now));
assert(signupCode.subject === 'Dokončete registraci do Syllonautu' && signupCode.text.includes('Platnost vyprší za 15 minut.'),
  'signup code email must match the confirm-signup template and state the 15-minute validity');

console.log('Neon Auth branded email checks passed.');
