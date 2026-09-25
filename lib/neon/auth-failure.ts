// A failed upstream Neon Auth call may fall back to a recent successful result
// only when the service itself was unavailable (transport failure, reported by
// the library as 502, or any 5xx) or rate limited (429). Any other status, such
// as 401 or 403, is an answer about the session and must not be overridden by
// a cached result.
export function isTransientNeonAuthFailure(error: unknown) {
  const status = (error as { status?: unknown } | null | undefined)?.status;
  return typeof status === 'number' && (status >= 500 || status === 429);
}
