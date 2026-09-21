import 'server-only';

import { createNeonAuth } from '@neondatabase/auth/next/server';

export function createServerAuth() {
  const baseUrl = process.env.NEON_AUTH_BASE_URL;
  const secret = process.env.NEON_AUTH_COOKIE_SECRET;
  if (!baseUrl || !secret) throw new Error('Neon Auth server configuration is incomplete.');

  return createNeonAuth({
    baseUrl,
    cookies: { secret, sessionDataTtl: 300 },
    logLevel: 'warn',
  });
}
