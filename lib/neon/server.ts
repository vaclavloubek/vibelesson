import 'server-only';

import { neon } from '@neondatabase/serverless';
import { requireNeonServerConfig } from '@/lib/neon/config';

export function createNeonSql() {
  const { databaseUrl } = requireNeonServerConfig();
  return neon(databaseUrl, { fetchOptions: { signal: AbortSignal.timeout(8_000) } });
}
