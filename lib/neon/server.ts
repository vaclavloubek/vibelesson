import 'server-only';

import { neon, neonConfig } from '@neondatabase/serverless';
import { requireNeonServerConfig } from '@/lib/neon/config';

// Every HTTP query gets its own 8 s timeout. A signal created once per client
// kept running across long work (e.g. the AI call in the grading worker), so
// every later query of that client failed immediately with a TimeoutError.
neonConfig.fetchFunction = (input: RequestInfo | URL, init?: RequestInit) =>
  fetch(input, { ...init, signal: init?.signal ?? AbortSignal.timeout(8_000) });

export function createNeonSql() {
  const { databaseUrl } = requireNeonServerConfig();
  return neon(databaseUrl);
}
