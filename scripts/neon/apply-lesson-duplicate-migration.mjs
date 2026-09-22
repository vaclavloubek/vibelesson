import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { loadEnvFile } from 'node:process';
import pg from 'pg';

const { Client } = pg;
const APPROVAL = 'I_UNDERSTAND_THIS_ADDS_ATOMIC_DUPLICATION_TO_NEON_STAGING';

try {
  loadEnvFile('.env.local');
} catch (error) {
  if (error?.code !== 'ENOENT') throw error;
}

function requiredTargetUrl() {
  for (const name of [
    'NEON_DATABASE_URL_UNPOOLED',
    'DATABASE_URL_UNPOOLED',
    'NEON_DATABASE_URL',
    'DATABASE_URL',
  ]) {
    const value = process.env[name];
    if (value && value !== '[SENSITIVE]') return { name, value };
  }
  throw new Error('Target Neon URL is unavailable.');
}

function validateTargetUrl(name, value) {
  const parsed = new URL(value);
  if (!['postgres:', 'postgresql:'].includes(parsed.protocol)) {
    throw new Error(`${name} must use a PostgreSQL URL.`);
  }
  if (!parsed.hostname.toLowerCase().endsWith('.neon.tech')) {
    throw new Error(`${name} does not point to a Neon host.`);
  }
  if (parsed.hostname.includes('-pooler.')) {
    throw new Error(`${name} must use the direct Neon host for a schema migration.`);
  }
}

if (process.env.NEON_LESSON_DUPLICATE_MIGRATION_APPROVED !== APPROVAL) {
  throw new Error('Atomic lesson-duplication write gate is missing.');
}
if (process.env.VERCEL_ENV && process.env.VERCEL_ENV !== 'preview') {
  throw new Error('Atomic lesson duplication is restricted to Vercel Preview staging.');
}

const { name: targetName, value: connectionString } = requiredTargetUrl();
validateTargetUrl(targetName, connectionString);

const migrationUrl = new URL('../../neon/migrations/0005_atomic_lesson_duplication.sql', import.meta.url);
const migrationSql = await readFile(fileURLToPath(migrationUrl), 'utf8');
const client = new Client({
  connectionString,
  connectionTimeoutMillis: 15_000,
  query_timeout: 30_000,
  statement_timeout: 30_000,
  application_name: 'syllonaut-neon-atomic-lesson-duplication-migration',
});

let transactionStarted = false;

try {
  await client.connect();
  await client.query('begin');
  transactionStarted = true;
  await client.query("set local statement_timeout = '30s'");
  await client.query(migrationSql);

  const postcondition = await client.query(`
    select p.prosecdef as security_definer,
           exists (
             select 1
             from aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) acl
             where acl.grantee = 0
               and acl.privilege_type = 'EXECUTE'
           ) as public_execute
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname = 'duplicate_lesson_server'
      and pg_get_function_identity_arguments(p.oid) = 'p_user_id uuid, p_lesson_id uuid, p_device_token_hash text'
  `);

  const row = postcondition.rows[0];
  if (!row || row.security_definer !== false || row.public_execute !== false) {
    throw new Error('Atomic duplication function security postcondition failed.');
  }

  await client.query('commit');
  transactionStarted = false;
  console.log('PASS: atomic lesson duplication installed in Neon staging.');
  console.log('Postconditions: SECURITY INVOKER; PUBLIC EXECUTE revoked.');
} catch (error) {
  if (transactionStarted) await client.query('rollback').catch(() => {});
  const code = error && typeof error === 'object' && 'code' in error ? ` (${error.code})` : '';
  throw new Error(`Atomic lesson duplication migration failed${code}; transaction rolled back.`, { cause: error });
} finally {
  await client.end().catch(() => {});
}
