import 'server-only';

import { createHash, timingSafeEqual } from 'node:crypto';

// Vercel Cron sends `Authorization: Bearer <CRON_SECRET>`. Both sides are
// hashed first so timingSafeEqual always compares equal-length buffers and the
// comparison time does not depend on how much of the secret matched.
export function isAuthorizedCronRequest(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const expected = createHash('sha256').update('Bearer ' + secret).digest();
  const actual = createHash('sha256').update(request.headers.get('authorization') ?? '').digest();
  return timingSafeEqual(expected, actual);
}
