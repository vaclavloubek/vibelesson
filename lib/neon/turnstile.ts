import 'server-only';

import { headers } from 'next/headers';

type TurnstileAction = 'signin' | 'signup' | 'recovery' | 'verify';

export async function verifyNeonAuthChallenge(token: string, action: TurnstileAction): Promise<boolean> {
  const secret = process.env.TURNSTILE_SECRET_KEY;
  if (!secret || !token || token.length > 2048) return false;

  const requestHeaders = await headers();
  const expectedHost = requestHeaders.get('host')?.split(':')[0]?.toLowerCase();
  if (!expectedHost) return false;

  try {
    const response = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ secret, response: token }),
      cache: 'no-store',
      signal: AbortSignal.timeout(8_000),
    });
    if (!response.ok) return false;
    const result = await response.json() as {
      success?: boolean;
      action?: string;
      hostname?: string;
    };
    return result.success === true
      && result.action === action
      && result.hostname?.toLowerCase() === expectedHost;
  } catch {
    return false;
  }
}
