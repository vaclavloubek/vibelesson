import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const { Client } = pg;
const APPROVAL = 'I_UNDERSTAND_THIS_REVOKES_PUBLIC_EXECUTE_IN_NEON_STAGING';

function requiredTargetUrl() {
  for (const name of [
    'DATABASE_URL_UNPOOLED',
    'NEON_DATABASE_URL_UNPOOLED',
    'NEON_DATABASE_DATABASE_URL_UNPOOLED',
    'NEON_DATABASE_URL',
    'DATABASE_URL',
  ]) {
    const value = process.env[name];
    if (value && value !== '[SENSITIVE]') return { name, value };
  }
  throw new Error('Target Neon URL is unavailable');
}

function validateTargetUrl(name, value) {
  let parsed;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error(`${name} is not a valid URL`);
  }
  if (!['postgres:', 'postgresql:'].includes(parsed.protocol)) {
    throw new Error(`${name} must use a PostgreSQL URL`);
  }
  if (!parsed.hostname.toLowerCase().endsWith('.neon.tech')) {
    throw new Error(`${name} does not point to a Neon host`);
  }
}

if (process.env.NEON_SECURITY_HARDENING_APPROVED !== APPROVAL) {
  throw new Error('NEON_SECURITY_HARDENING_APPROVED write gate is missing');
}
if (process.env.VERCEL_ENV && process.env.VERCEL_ENV !== 'preview') {
  throw new Error('Security hardening is restricted to Vercel Preview');
}

const { name: targetName, value: connectionString } = requiredTargetUrl();
validateTargetUrl(targetName, connectionString);

const migrationUrl = new URL('../../neon/migrations/0004_harden_security_definer_execute.sql', import.meta.url);
const migrationSql = await readFile(fileURLToPath(migrationUrl), 'utf8');
const client = new Client({
  connectionString,
  connectionTimeoutMillis: 15_000,
  query_timeout: 30_000,
  statement_timeout: 30_000,
  application_name: 'syllonaut-neon-security-hardening',
});

let transactionStarted = false;

try {
  await client.connect();
  await client.query('begin');
  transactionStarted = true;
  await client.query("set local statement_timeout = '30s'");
  await client.query(migrationSql);

  const result = await client.query(
    `select count(*) filter (
              where exists (
                select 1
                  from aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) acl
                 where acl.grantee = 0
                   and acl.privilege_type = 'EXECUTE'
              )
            )::int as public_execute_count,
            count(*) filter (
              where not exists (
                select 1
                  from unnest(coalesce(p.proconfig, array[]::text[])) as settings(value)
                 where value like 'search_path=%'
              )
            )::int as missing_search_path_count
       from pg_proc p
       join pg_namespace n on n.oid = p.pronamespace
      where n.nspname in ('public', 'private', 'app_identity')
        and p.prosecdef`,
  );

  const { public_execute_count: publicExecute, missing_search_path_count: missingSearchPath } = result.rows[0];
  if (publicExecute !== 0 || missingSearchPath !== 0) {
    throw new Error(
      `Postcondition failed: PUBLIC execute=${publicExecute}; missing search_path=${missingSearchPath}`,
    );
  }

  await client.query('commit');
  transactionStarted = false;
  console.log('PASS: Neon staging SECURITY DEFINER hardening applied.');
  console.log('Postconditions: PUBLIC execute=0; missing search_path=0.');
} catch (error) {
  if (transactionStarted) await client.query('rollback').catch(() => {});
  const code = error && typeof error === 'object' && 'code' in error ? ` (${error.code})` : '';
  throw new Error(`Neon staging security hardening failed${code}; transaction rolled back`);
} finally {
  await client.end().catch(() => {});
}
