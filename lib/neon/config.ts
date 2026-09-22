export type DatabaseBackend = 'supabase' | 'neon';

export function getDatabaseBackend(): DatabaseBackend {
  const value = process.env.DATABASE_BACKEND ?? 'supabase';
  if (value !== 'supabase' && value !== 'neon') {
    throw new Error(`Unsupported DATABASE_BACKEND: ${value}`);
  }
  return value;
}

export function requireNeonServerConfig() {
  const databaseUrl = process.env.NEON_DATABASE_URL ?? process.env.DATABASE_URL;
  const authBaseUrl = process.env.NEON_AUTH_BASE_URL;
  const dataApiUrl = process.env.NEON_DATA_API_URL;
  if (!databaseUrl || !authBaseUrl || !dataApiUrl) {
    throw new Error('Neon server configuration is incomplete.');
  }
  return { databaseUrl, authBaseUrl, dataApiUrl };
}

export function assertApprovedNeonCutover() {
  if (getDatabaseBackend() !== 'neon') return;
  if (process.env.NEON_CUTOVER_APPROVED !== 'true') {
    throw new Error('Neon runtime cutover is not approved. Set NEON_CUTOVER_APPROVED=true only during the runbook cutover.');
  }
}
