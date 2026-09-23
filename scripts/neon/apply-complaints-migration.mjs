import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { loadEnvFile } from 'node:process';
import pg from 'pg';

// LEGAL-017: apply neon/migrations/0011 in one transaction and verify it.
// Default is a rehearsal that rolls back; commit only with the approval value.
// The connection string is read from NEON_ADMIN_DATABASE_URL (.env.neon-admin)
// and is never printed.

const { Client } = pg;
const APPROVAL = 'I_UNDERSTAND_THIS_ADDS_COMPLAINT_EVIDENCE_TABLES_TO_NEON';

for (const file of ['.env.neon-admin']) {
  try {
    loadEnvFile(file);
  } catch (error) {
    if (error?.code !== 'ENOENT') throw error;
  }
}

const connectionString = process.env.NEON_ADMIN_DATABASE_URL;
if (!connectionString) throw new Error('NEON_ADMIN_DATABASE_URL is unavailable.');
const parsed = new URL(connectionString);
if (!['postgres:', 'postgresql:'].includes(parsed.protocol)) throw new Error('NEON_ADMIN_DATABASE_URL must use a PostgreSQL URL.');
if (!parsed.hostname.toLowerCase().endsWith('.neon.tech')) throw new Error('NEON_ADMIN_DATABASE_URL does not point to a Neon host.');

const commit = process.env.NEON_COMPLAINTS_MIGRATION_APPROVED === APPROVAL;
const endpoint = parsed.hostname.split('.')[0].replace(/-pooler$/, '');
const migrationSql = await readFile(fileURLToPath(new URL('../../neon/migrations/0011_customer_complaints_legal_017.sql', import.meta.url)), 'utf8');

const client = new Client({
  connectionString,
  connectionTimeoutMillis: 15_000,
  query_timeout: 45_000,
  statement_timeout: 45_000,
  application_name: 'syllonaut-legal-017-complaints-migration',
});

let transactionStarted = false;
try {
  await client.connect();
  await client.query('begin');
  transactionStarted = true;
  await client.query("set local statement_timeout = '45s'");
  await client.query(migrationSql);

  const { rows: [check] } = await client.query(`
    select
      to_regclass('private.customer_complaints') is not null as complaints,
      to_regclass('private.customer_complaint_resolutions') is not null as resolutions,
      to_regclass('private.customer_complaint_email_deliveries') is not null as deliveries,
      (select count(*) from pg_trigger where not tgisinternal and tgname in (
        'customer_complaints_append_only', 'customer_complaint_resolutions_append_only')) = 2 as append_only,
      (select bool_and(c.relrowsecurity) from pg_class c join pg_namespace n on n.oid = c.relnamespace
        where n.nspname = 'private' and c.relname like 'customer_complaint%') as rls,
      not exists (
        select 1 from information_schema.role_table_grants g
        where g.table_schema = 'private' and g.table_name like 'customer_complaint%'
          and g.grantee in ('PUBLIC', 'anon', 'anonymous', 'authenticated', 'authenticator')
      ) as no_client_grants
  `);
  if (!check || Object.values(check).some((value) => value !== true)) {
    throw new Error(`Complaint migration postcondition failed: ${JSON.stringify(check)}`);
  }

  // Behavioural rehearsal inside the transaction: append-only and constraints.
  await client.query('savepoint behaviour');
  const { rows: [receipt] } = await client.query(`
    insert into private.customer_complaints (
      user_id, resolution_due_at, locale, contact_email, customer_name, subject_area, description,
      requested_remedy, payload_sha256, client_request_id
    ) values (gen_random_uuid(), now() + interval '30 days', 'cs', 'test@example.com', 'Test Rehearsal', 'other',
      'Zkouška migrace bez trvalého zápisu.', 'bring_into_conformity', repeat('a', 64), gen_random_uuid())
    returning id
  `);
  let appendOnly = false;
  try {
    await client.query('savepoint mutate');
    await client.query('update private.customer_complaints set description = description where id = $1', [receipt.id]);
  } catch {
    appendOnly = true;
    await client.query('rollback to savepoint mutate');
  }
  let remedyEnforced = false;
  try {
    await client.query('savepoint remedy');
    await client.query(`insert into private.customer_complaint_resolutions (complaint_id, outcome, explanation, resolved_by, payload_sha256)
      values ($1, 'accepted', 'Chybí způsob vyřízení.', gen_random_uuid(), repeat('b', 64))`, [receipt.id]);
  } catch {
    remedyEnforced = true;
    await client.query('rollback to savepoint remedy');
  }
  await client.query('rollback to savepoint behaviour');
  if (!appendOnly || !remedyEnforced) throw new Error(`Complaint behaviour check failed: ${JSON.stringify({ appendOnly, remedyEnforced })}`);

  await client.query(commit ? 'commit' : 'rollback');
  transactionStarted = false;
  console.log(JSON.stringify({ endpoint, committed: commit, ...check, appendOnly, remedyEnforced }));
} catch (error) {
  if (transactionStarted) await client.query('rollback').catch(() => undefined);
  console.error(JSON.stringify({ endpoint, committed: false, error: error instanceof Error ? error.message : 'unknown' }));
  process.exitCode = 1;
} finally {
  await client.end().catch(() => undefined);
}
