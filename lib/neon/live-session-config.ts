import 'server-only';

export function useNeonLiveSessionData() {
  if (process.env.DATABASE_BACKEND !== 'neon' && process.env.NEON_LIVE_SESSION_DATA !== 'true') return false;
  if (process.env.VERCEL_ENV === 'production' && process.env.NEON_CUTOVER_APPROVED !== 'true') {
    throw new Error('Neon live-session data is not approved for production.');
  }
  return true;
}
