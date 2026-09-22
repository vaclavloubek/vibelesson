import { createHash } from 'node:crypto';
import { loadEnvFile } from 'node:process';
import { neon } from '@neondatabase/serverless';
import pg from 'pg';

const { Client } = pg;

try {
  loadEnvFile('.env.local');
} catch (error) {
  if (error?.code !== 'ENOENT') throw error;
}

function required(name, ...fallbacks) {
  for (const key of [name, ...fallbacks]) {
    const value = process.env[key];
    if (value && value !== '[SENSITIVE]') return value;
  }
  throw new Error(`${name} is unavailable.`);
}

function parsePostgresUrl(name, value) {
  const parsed = new URL(value);
  if (!['postgres:', 'postgresql:'].includes(parsed.protocol)) {
    throw new Error(`${name} must use a PostgreSQL URL.`);
  }
  return parsed;
}

function validateSource(value) {
  const parsed = parsePostgresUrl('SUPABASE_DB_URL', value);
  if (!parsed.hostname.endsWith('.pooler.supabase.com') || parsed.port !== '5432') {
    throw new Error('SUPABASE_DB_URL must use the Session pooler on port 5432.');
  }
}

function validateTarget(value) {
  const parsed = parsePostgresUrl('NEON_DATABASE_URL', value);
  if (!parsed.hostname.endsWith('.neon.tech')) {
    throw new Error('NEON_DATABASE_URL points to an unexpected host.');
  }
}

function fingerprint(value) {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

function fingerprintCounts(rows) {
  const counts = new Map();
  for (const row of rows) {
    const key = fingerprint(row);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return counts;
}

function countFingerprintDelta(leftRows, rightRows) {
  const left = fingerprintCounts(leftRows);
  const right = fingerprintCounts(rightRows);
  let leftOnly = 0;
  let rightOnly = 0;

  for (const [key, count] of left) leftOnly += Math.max(0, count - (right.get(key) ?? 0));
  for (const [key, count] of right) rightOnly += Math.max(0, count - (left.get(key) ?? 0));

  return { leftOnly, rightOnly };
}

const sourceUrl = required('SUPABASE_DB_URL');
const targetUrl = required(
  'NEON_DATABASE_URL',
  'DATABASE_URL_UNPOOLED',
  'NEON_DATABASE_URL_UNPOOLED',
  'DATABASE_URL',
);
validateSource(sourceUrl);
validateTarget(targetUrl);

const source = new Client({
  connectionString: sourceUrl,
  connectionTimeoutMillis: 15_000,
  query_timeout: 15_000,
  statement_timeout: 15_000,
  application_name: 'syllonaut-neon-folder-parity',
});
const target = neon(targetUrl, { fetchOptions: { signal: AbortSignal.timeout(15_000) } });

try {
  await source.connect();
  await source.query('begin read only');

  const sourceAll = await source.query(`
    select owner_id::text as owner_id, id::text as id, name, parent_id::text as parent_id
    from public.lesson_folders
    order by owner_id asc, name asc, id asc
  `);
  const targetAll = await target`
    select owner_id::text as owner_id, id::text as id, name, parent_id::text as parent_id
    from public.lesson_folders
    order by owner_id asc, name asc, id asc
  `;

  if (fingerprint(sourceAll.rows) !== fingerprint(targetAll)) {
    const delta = countFingerprintDelta(sourceAll.rows, targetAll);
    console.error(`Folder row counts: Supabase ${sourceAll.rows.length}, Neon ${targetAll.length}.`);
    console.error(`Anonymous fingerprint delta: Supabase-only ${delta.leftOnly}, Neon-only ${delta.rightOnly}.`);
    throw new Error('Supabase and Neon lesson-folder tables have different fingerprints.');
  }

  const ownerRows = targetAll.length > 0
    ? [{ id: targetAll[0].owner_id }]
    : await target`select id::text as id from public.profiles order by id asc limit 1`;
  const ownerId = ownerRows[0]?.id;
  if (typeof ownerId !== 'string') throw new Error('No eligible profile exists for folder-read parity.');

  const sourceFiltered = await source.query(`
    select id::text as id, name, parent_id::text as parent_id
    from public.lesson_folders
    where owner_id = $1
    order by name asc, id asc
  `, [ownerId]);
  const targetFiltered = await target`
    select id::text as id, name, parent_id::text as parent_id
    from public.lesson_folders
    where owner_id = ${ownerId}
    order by name asc, id asc
  `;

  if (fingerprint(sourceFiltered.rows) !== fingerprint(targetFiltered)) {
    throw new Error('Supabase and Neon returned different folder rows for the same owner.');
  }

  await source.query('commit');
  console.log(`Compared ${targetAll.length} folder rows across both databases.`);
  console.log('PASS: Supabase and Neon returned the same lesson-folder table and owner-scoped result.');
  console.log('Read-only parity check completed; no owner ID, folder name, or secret was logged.');
} catch (error) {
  try { await source.query('rollback'); } catch {}
  throw error;
} finally {
  await source.end().catch(() => {});
}
