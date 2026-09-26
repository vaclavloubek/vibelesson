'use server';

import { after } from 'next/server';
import { cookies } from 'next/headers';
import { assertApprovedNeonCutover, getDatabaseBackend } from '@/lib/neon/config';
import { createServerAuth } from '@/lib/neon/auth';
import { NEON_AUTH_SESSION_DATA_COOKIE } from '@/lib/neon/auth-cookies';
import { getVerifiedNeonSession } from '@/lib/neon/request-client';
import { createNeonSql } from '@/lib/neon/server';
import { verifyNeonAuthChallenge } from '@/lib/neon/turnstile';
import { ensureTrustedDeviceCookie } from '@/lib/trusted-device-access';
import { TERMS_ACCEPTANCE_KEY, TERMS_VERSION } from '@/lib/legal';
import { startMarketingOnboarding } from '@/lib/marketing-lifecycle';

type AuthActionResult = { error?: string };
type SignInResult = AuthActionResult & { needsVerification?: boolean };
type SignupResult = AuthActionResult & { checkEmail?: boolean };
type NeonAppUser = { id: string; email: string; name?: string };

/**
 * A sign-in replaces the session cookie, but the library's signed session_data
 * copy is re-minted only when an extra upstream call succeeds. Dropping the old
 * copy first means a failed re-mint cannot leave the previous account's copy
 * next to the new session; a successful re-mint overrides this deletion.
 */
async function dropSessionDataCopy() {
  (await cookies()).delete(NEON_AUTH_SESSION_DATA_COOKIE);
}

function neonAppAuthIsAvailable() {
  if (getDatabaseBackend() !== 'neon') return false;
  assertApprovedNeonCutover();
  return Boolean(process.env.NEON_AUTH_BASE_URL && process.env.NEON_AUTH_COOKIE_SECRET);
}

export async function getNeonAppUser(): Promise<NeonAppUser | null> {
  if (!neonAppAuthIsAvailable()) return null;
  try {
    const { data } = await getVerifiedNeonSession();
    const user = data?.user;
    return user?.id && user.email
      ? { id: user.id, email: user.email, name: user.name }
      : null;
  } catch {
    return null;
  }
}

export async function signInWithNeonForApp(email: string, password: string, challenge: string): Promise<SignInResult> {
  if (!neonAppAuthIsAvailable()) return { error: 'Neon Auth is not active for this deployment.' };
  if (!(await verifyNeonAuthChallenge(challenge, 'signin'))) return { error: 'Security verification failed.' };
  try {
    await dropSessionDataCopy();
    const { error } = await createServerAuth().signIn.email({ email, password });
    if (!error) {
      await ensureTrustedDeviceCookie();
      return {};
    }
    // Neon Auth checks the password first and only then refuses an unverified
    // address; with "send on sign-in" it has already emailed a fresh code.
    // The SDK normalizes Better Auth's EMAIL_NOT_VERIFIED to email_not_confirmed.
    const code = (error as { code?: unknown }).code;
    if (code === 'email_not_confirmed' || code === 'EMAIL_NOT_VERIFIED') {
      return { error: 'Email not verified.', needsVerification: true };
    }
    return { error: error.message || 'Sign-in failed.' };
  } catch {
    return { error: 'Sign-in failed.' };
  }
}

function normalizedAuthEmail(email: string) {
  const value = email.trim().toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value) && value.length <= 254 ? value : null;
}

async function findUnverifiedNeonUserId(email: string): Promise<string | null> {
  try {
    const rows = await createNeonSql()`
      select u.id::text as id from neon_auth."user" u
      where lower(u.email) = ${email} and u."emailVerified" = false
      limit 1
    `;
    const id = rows[0]?.id;
    return typeof id === 'string' ? id : null;
  } catch {
    // Missing one welcome email is safer than sending it twice.
    return null;
  }
}

export async function verifyNeonEmailForApp(email: string, code: string): Promise<AuthActionResult & { signedIn?: boolean }> {
  if (!neonAppAuthIsAvailable()) return { error: 'Neon Auth is not active for this deployment.' };
  const normalizedEmail = normalizedAuthEmail(email);
  const otp = code.replace(/\s+/g, '');
  if (!normalizedEmail || !/^\d{6}$/.test(otp)) return { error: 'Invalid verification code.' };
  try {
    // A verification code can also be requested for an already verified account;
    // only the first verification completes the signup and starts onboarding.
    const pendingUserId = await findUnverifiedNeonUserId(normalizedEmail);
    // Neon Auth limits wrong attempts per code; the user can request a new one.
    await dropSessionDataCopy();
    const { data, error } = await createServerAuth().emailOtp.verifyEmail({ email: normalizedEmail, otp });
    if (error) return { error: 'Invalid verification code.' };
    if (pendingUserId) {
      after(async () => {
        try {
          await startMarketingOnboarding(pendingUserId);
        } catch (marketingError) {
          console.warn('marketing onboarding start failed', {
            code: marketingError instanceof Error ? marketingError.message : 'unknown',
          });
        }
      });
    }
    const signedIn = Boolean((data as { token?: unknown } | null)?.token);
    if (signedIn) await ensureTrustedDeviceCookie();
    return { signedIn };
  } catch {
    return { error: 'Verification failed.' };
  }
}

export async function resendNeonEmailVerificationForApp(email: string, challenge: string): Promise<AuthActionResult> {
  if (!neonAppAuthIsAvailable()) return { error: 'Neon Auth is not active for this deployment.' };
  if (!(await verifyNeonAuthChallenge(challenge, 'verify'))) return { error: 'Security verification failed.' };
  const normalizedEmail = normalizedAuthEmail(email);
  if (!normalizedEmail) return { error: 'Invalid email.' };
  try {
    await createServerAuth().emailOtp.sendVerificationOtp({ email: normalizedEmail, type: 'email-verification' });
  } catch {
    // Do not disclose whether this address exists or is already verified.
  }
  return {};
}

export async function signUpWithNeonForApp(input: {
  email: string;
  password: string;
  termsAccepted: boolean;
  marketingConsent: boolean;
  locale: 'cs' | 'en';
  challenge: string;
}): Promise<SignupResult> {
  if (!neonAppAuthIsAvailable()) return { error: 'Neon Auth is not active for this deployment.' };
  const email = input.email.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
    || email.length > 254
    || input.password.length < 8
    || input.password.length > 128
    || !['cs', 'en'].includes(input.locale)
    || typeof input.marketingConsent !== 'boolean'
    || !input.termsAccepted) {
    return { error: 'Invalid registration details.' };
  }
  if (!(await verifyNeonAuthChallenge(input.challenge, 'signup'))) {
    return { error: 'Security verification failed.' };
  }

  try {
    const result = await createServerAuth().signUp.email({
      email,
      password: input.password,
      name: email.split('@')[0],
    });
    if (result.error || !result.data?.user?.id) return { error: 'Registration failed.' };

    const userId = result.data.user.id;
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(userId)) {
      return { error: 'Registration failed.' };
    }

    const sql = createNeonSql();
    await sql.transaction([
      sql`insert into public.profiles (
        id, marketing_email_consent, marketing_email_consent_at,
        marketing_email_consent_version, ui_locale
      ) values (
        ${userId}::uuid, ${input.marketingConsent},
        case when ${input.marketingConsent} then now() else null end,
        case when ${input.marketingConsent} then '2026-09-18-v1' else null end,
        ${input.locale}
      ) on conflict (id) do nothing`,
      sql`insert into private.terms_acceptance_events (
        user_id, terms_version, acceptance_key, source
      ) values (${userId}::uuid, ${TERMS_VERSION}, ${TERMS_ACCEPTANCE_KEY}, 'signup')
      on conflict (user_id, acceptance_key, source) do nothing`,
      ...(input.marketingConsent ? [sql`insert into private.marketing_consent_events (
        user_id, granted, consent_version, source
      ) values (${userId}::uuid, true, '2026-09-18-v1', 'signup')`] : []),
    ]);
    if (!result.data.token) {
      // Neon Auth is configured not to send on sign-up: sending only after the
      // profile exists lets the email webhook pick the user's UI language.
      try {
        await createServerAuth().emailOtp.sendVerificationOtp({ email, type: 'email-verification' });
      } catch {
        // The verification form offers "send a new code".
      }
    }
    await ensureTrustedDeviceCookie();
    return { checkEmail: !result.data.token };
  } catch {
    // A failed audit write cannot be reported as a completed registration.
    // The product Terms gate remains fail-closed for any such account.
    return { error: 'Registration could not be completed.' };
  }
}

export async function requestNeonPasswordResetForApp(email: string, challenge: string): Promise<AuthActionResult> {
  if (!neonAppAuthIsAvailable()) return { error: 'Neon Auth is not active for this deployment.' };
  if (!(await verifyNeonAuthChallenge(challenge, 'recovery'))) {
    return { error: 'Security verification failed.' };
  }
  const normalizedEmail = email.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail) || normalizedEmail.length > 254) {
    return { error: 'Invalid email.' };
  }

  const origin = process.env.VERCEL_ENV === 'production'
    ? 'https://www.syllonaut.com'
    : process.env.VERCEL_BRANCH_URL || process.env.VERCEL_URL
      ? `https://${process.env.VERCEL_BRANCH_URL || process.env.VERCEL_URL}`
      : 'http://localhost:3000';
  try {
    await createServerAuth().requestPasswordReset({
      email: normalizedEmail,
      redirectTo: `${origin}/auth/update-password`,
    });
  } catch {
    // Do not disclose whether this address exists.
  }
  return {};
}

export async function signOutFromNeonApp(): Promise<AuthActionResult> {
  if (!neonAppAuthIsAvailable()) return { error: 'Neon Auth is not active for this deployment.' };
  try {
    const { error } = await createServerAuth().signOut();
    return error ? { error: error.message || 'Sign-out failed.' } : {};
  } catch {
    return { error: 'Sign-out failed.' };
  }
}
