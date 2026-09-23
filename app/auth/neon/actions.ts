'use server';

import { assertApprovedNeonCutover, getDatabaseBackend } from '@/lib/neon/config';
import { createServerAuth } from '@/lib/neon/auth';
import { createNeonSql } from '@/lib/neon/server';
import { verifyNeonAuthChallenge } from '@/lib/neon/turnstile';
import { TERMS_ACCEPTANCE_KEY, TERMS_VERSION } from '@/lib/legal';

type AuthActionResult = { error?: string };
type SignupResult = AuthActionResult & { checkEmail?: boolean };
type NeonAppUser = { id: string; email: string; name?: string };

function neonAppAuthIsAvailable() {
  if (getDatabaseBackend() !== 'neon') return false;
  assertApprovedNeonCutover();
  return Boolean(process.env.NEON_AUTH_BASE_URL && process.env.NEON_AUTH_COOKIE_SECRET);
}

export async function getNeonAppUser(): Promise<NeonAppUser | null> {
  if (!neonAppAuthIsAvailable()) return null;
  try {
    const { data } = await createServerAuth().getSession();
    const user = data?.user;
    return user?.id && user.email
      ? { id: user.id, email: user.email, name: user.name }
      : null;
  } catch {
    return null;
  }
}

export async function signInWithNeonForApp(email: string, password: string, challenge: string): Promise<AuthActionResult> {
  if (!neonAppAuthIsAvailable()) return { error: 'Neon Auth is not active for this deployment.' };
  if (!(await verifyNeonAuthChallenge(challenge, 'signin'))) return { error: 'Security verification failed.' };
  try {
    const { error } = await createServerAuth().signIn.email({ email, password });
    return error ? { error: error.message || 'Sign-in failed.' } : {};
  } catch {
    return { error: 'Sign-in failed.' };
  }
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
    : process.env.VERCEL_URL
      ? `https://${process.env.VERCEL_URL}`
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
