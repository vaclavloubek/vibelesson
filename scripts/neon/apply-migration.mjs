#!/usr/bin/env node
// Apply one neon/migrations/*.sql file in a single transaction on the Neon branch.
// NEON_APPLY_MIGRATION=<file.sql>, NEON_APPLY_MODE=rehearsal (rollback) | execute (commit).
import { readFileSync } from 'node:fs';
import pg from 'pg';

const file = process.env.NEON_APPLY_MIGRATION;
const mode = process.env.NEON_APPLY_MODE;
if (!file || !['rehearsal', 'execute'].includes(mode)) process.exit(0);
if (!/^\d{4}_[a-z0-9_]+\.sql$/.test(file)) { console.error('apply: invalid migration name'); process.exit(2); }
const url = process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL;
if (!url || !new URL(url).hostname.endsWith('.neon.tech')) { console.error('apply: no Neon target'); process.exit(2); }
const sql = readFileSync(new URL(`../../neon/migrations/${file}`, import.meta.url), 'utf8');
const client = new pg.Client({ connectionString: url, connectionTimeoutMillis: 20_000 });
try {
  await client.connect();
  const version = (await client.query('show server_version')).rows[0].server_version;
  await client.query('begin');
  // Diagnostic for 0009: the original unqualified filter on this server version.
  await client.query('savepoint diag');
  try {
    await client.query(`select 1 from jsonb_array_elements_text('["b1"]'::jsonb) value
      where exists (select 1 from jsonb_array_elements('[{"id":"b1"}]'::jsonb) block where block->>'id' = value)`);
    console.log(`apply diag pg=${version} original_filter=ok`);
  } catch (error) {
    console.log(`apply diag pg=${version} original_filter=${error.code}`);
  }
  await client.query('rollback to savepoint diag');
  await client.query('savepoint diag2');
  try {
    await client.query(`select public.sync_stripe_subscription_event('not-an-event', null, false, null, null, null, null, false, null, false, null, null, null, null)`);
    console.log('apply diag stripe_sync=accepted');
  } catch (error) {
    console.log(`apply diag stripe_sync=${error.code}`);
  }
  await client.query('rollback to savepoint diag2');
  await client.query(sql);
  if (mode === 'execute') { await client.query('commit'); console.log(`APPLY RESULT PASS committed ${file}`); }
  else { await client.query('rollback'); console.log(`APPLY RESULT PASS rolled back (rehearsal) ${file}`); }
} catch (error) {
  try { await client.query('rollback'); } catch {}
  console.error(`APPLY RESULT FAIL ${file} ${error?.code ?? ''} ${String(error?.message ?? '').replace(/postgres(ql)?:\/\/\S+/g, '<url>').slice(0, 200)}`);
  process.exitCode = 1;
} finally {
  await client.end().catch(() => {});
}
