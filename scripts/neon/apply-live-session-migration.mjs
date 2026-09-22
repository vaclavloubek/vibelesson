import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { loadEnvFile } from 'node:process';
import pg from 'pg';

const { Client } = pg;
const APPROVAL = 'I_UNDERSTAND_THIS_ADDS_LIVE_SESSION_OUTBOX_TO_NEON_STAGING';

try {
  loadEnvFile('.env.local');
} catch (error) {
  if (error?.code !== 'ENOENT') throw error;
}

function requiredTargetUrl() {
  for (const name of ['NEON_DATABASE_URL_UNPOOLED', 'DATABASE_URL_UNPOOLED', 'NEON_DATABASE_URL', 'DATABASE_URL']) {
    const value = process.env[name];
    if (value && value !== '[SENSITIVE]') return { name, value };
  }
  throw new Error('Target Neon URL is unavailable.');
}

function validateTargetUrl(name, value) {
  const parsed = new URL(value);
  if (!['postgres:', 'postgresql:'].includes(parsed.protocol)) throw new Error(`${name} must use a PostgreSQL URL.`);
  if (!parsed.hostname.toLowerCase().endsWith('.neon.tech')) throw new Error(`${name} does not point to a Neon host.`);
  if (parsed.hostname.includes('-pooler.')) throw new Error(`${name} must use the direct Neon host for a schema migration.`);
}

if (process.env.NEON_LIVE_SESSION_MIGRATION_APPROVED !== APPROVAL) {
  throw new Error('Live-session outbox migration write gate is missing.');
}
if (process.env.VERCEL_ENV && process.env.VERCEL_ENV !== 'preview') {
  throw new Error('Live-session outbox migration is restricted to Vercel Preview staging.');
}

const { name: targetName, value: connectionString } = requiredTargetUrl();
validateTargetUrl(targetName, connectionString);
const migrationUrl = new URL('../../neon/migrations/0007_live_session_grading_outbox.sql', import.meta.url);
const migrationSql = await readFile(fileURLToPath(migrationUrl), 'utf8');
const client = new Client({
  connectionString,
  connectionTimeoutMillis: 15_000,
  query_timeout: 45_000,
  statement_timeout: 45_000,
  application_name: 'syllonaut-neon-live-session-outbox-migration',
});

let transactionStarted = false;
try {
  await client.connect();
  await client.query('begin');
  transactionStarted = true;
  await client.query("set local statement_timeout = '45s'");
  await client.query(migrationSql);

  const postcondition = await client.query(`
    select
      to_regclass('private.grading_dispatch_outbox') is not null as outbox_exists,
      position('net.http_post' in pg_get_functiondef('private.dispatch_response_evaluation_job(uuid)'::regprocedure)) = 0 as no_pg_net,
      position('grading_dispatch_outbox' in pg_get_functiondef('private.dispatch_response_evaluation_job(uuid)'::regprocedure)) > 0 as dispatches_to_outbox,
      not p.prosecdef as claim_security_invoker,
      not exists (
        select 1
        from aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) acl
        where acl.grantee = 0 and acl.privilege_type = 'EXECUTE'
      ) as no_public_execute
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'private'
      and p.proname = 'claim_next_grading_outbox_job'
      and pg_get_function_identity_arguments(p.oid) = 'p_worker_id text, p_lease_seconds integer'
  `);
  const row = postcondition.rows[0];
  if (!row || !row.outbox_exists || !row.no_pg_net || !row.dispatches_to_outbox
      || !row.claim_security_invoker || !row.no_public_execute) {
    throw new Error('Live-session outbox security postcondition failed.');
  }

  await client.query('commit');
  transactionStarted = false;
  console.log('PASS: live-session grading outbox installed in Neon staging.');
  console.log('Postconditions: no pg_net dispatch; SKIP LOCKED worker claim; PUBLIC EXECUTE revoked.');
} catch (error) {
  if (transactionStarted) await client.query('rollback').catch(() => {});
  const code = error && typeof error === 'object' && 'code' in error ? ` (${error.code})` : '';
  throw new Error(`Live-session outbox migration failed${code}; transaction rolled back.`, { cause: error });
} finally {
  await client.end().catch(() => {});
}
