import 'server-only';

import { getDatabaseBackend } from '@/lib/neon/config';
import { createNeonSql } from '@/lib/neon/server';
import type { NeonAuthEmailLocale, RenderedNeonAuthEmail } from '@/lib/neon-auth-email-core';

export class NeonAuthEmailDeliveryError extends Error {
  readonly code: string;

  constructor(code: string) {
    super(code);
    this.code = code;
    this.name = 'NeonAuthEmailDeliveryError';
  }
}

const LOCALE_LOOKUP_TIMEOUT_MS = 1_500;

/** Origins the password-reset link may land on (Neon's trusted origins still apply upstream). */
export function neonAuthEmailAllowedOrigins() {
  const origins = ['https://www.syllonaut.com', 'https://syllonaut.com'];
  if (process.env.VERCEL_ENV !== 'production') {
    for (const host of [process.env.VERCEL_BRANCH_URL, process.env.VERCEL_URL]) {
      if (host) origins.push(`https://${host}`);
    }
    if (!process.env.VERCEL_ENV) origins.push('http://localhost:3000');
  }
  return origins;
}

/**
 * Best effort: the webhook sits inside a blocking auth flow with a 5 s budget,
 * so a slow or missing profile falls back to Czech instead of failing delivery.
 * New sign-ups have no profile yet when their verification email is sent.
 */
export async function lookupNeonAuthEmailLocale(input: { userId: string | null; email: string }): Promise<NeonAuthEmailLocale> {
  if (getDatabaseBackend() !== 'neon') return 'cs';
  try {
    const sql = createNeonSql();
    const query = input.userId && /^[0-9a-f-]{36}$/i.test(input.userId)
      ? sql`select p.ui_locale from public.profiles p where p.id = ${input.userId}::uuid limit 1`
      : sql`select p.ui_locale from neon_auth."user" u join public.profiles p on p.id = u.id::uuid
            where lower(u.email) = ${input.email} limit 1`;
    const rows = await Promise.race([
      query,
      new Promise<never>((_, reject) => setTimeout(() => reject(new Error('timeout')), LOCALE_LOOKUP_TIMEOUT_MS)),
    ]);
    return rows[0]?.ui_locale === 'en' ? 'en' : 'cs';
  } catch {
    return 'cs';
  }
}

export async function sendNeonAuthEmail(input: {
  to: string;
  rendered: RenderedNeonAuthEmail;
  idempotencyKey: string;
}) {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey || !apiKey.startsWith('re_')) throw new NeonAuthEmailDeliveryError('resend_api_key_missing');

  let response: Response;
  try {
    response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        // Neon retries with the same event id; Resend then returns the first send.
        'Idempotency-Key': input.idempotencyKey,
      },
      body: JSON.stringify({
        from: process.env.AUTH_EMAIL_FROM ?? 'Syllonaut <noreply@auth.syllonaut.com>',
        to: [input.to],
        subject: input.rendered.subject,
        text: input.rendered.text,
        html: input.rendered.html,
      }),
      signal: AbortSignal.timeout(3_000),
    });
  } catch {
    throw new NeonAuthEmailDeliveryError('resend_network_error');
  }
  if (!response.ok) throw new NeonAuthEmailDeliveryError(`resend_http_${response.status}`);
}
