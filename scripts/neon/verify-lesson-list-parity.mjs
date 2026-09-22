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

function canonicalJson(value) {
  if (Array.isArray(value)) return value.map(canonicalJson);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, nested]) => [key, canonicalJson(nested)]),
    );
  }
  return value;
}

function canonicalRows(rows) {
  return [...rows].sort((left, right) => left.id.localeCompare(right.id));
}

function fingerprint(value) {
  return createHash('sha256').update(JSON.stringify(canonicalJson(value))).digest('hex');
}

function anonymousDelta(sourceRows, targetRows) {
  const sourceById = new Map(sourceRows.map((row) => [row.id, fingerprint(row)]));
  const targetById = new Map(targetRows.map((row) => [row.id, fingerprint(row)]));
  let sourceOnly = 0;
  let targetOnly = 0;
  let changed = 0;

  for (const [id, rowFingerprint] of sourceById) {
    if (!targetById.has(id)) sourceOnly += 1;
    else if (targetById.get(id) !== rowFingerprint) changed += 1;
  }
  for (const id of targetById.keys()) {
    if (!sourceById.has(id)) targetOnly += 1;
  }

  const sourceOwners = new Map();
  const targetOwners = new Map();
  for (const row of sourceRows) sourceOwners.set(row.owner_id, (sourceOwners.get(row.owner_id) ?? 0) + 1);
  for (const row of targetRows) targetOwners.set(row.owner_id, (targetOwners.get(row.owner_id) ?? 0) + 1);
  const owners = new Set([...sourceOwners.keys(), ...targetOwners.keys()]);
  let ownersWithCountDrift = 0;
  for (const owner of owners) {
    if ((sourceOwners.get(owner) ?? 0) !== (targetOwners.get(owner) ?? 0)) ownersWithCountDrift += 1;
  }

  return { sourceOnly, targetOnly, changed, ownersWithCountDrift };
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
  query_timeout: 30_000,
  statement_timeout: 30_000,
  application_name: 'syllonaut-neon-lesson-list-parity',
});
const target = neon(targetUrl, { fetchOptions: { signal: AbortSignal.timeout(30_000) } });

const selectColumns = `
  owner_id::text as owner_id,
  id::text as id,
  title,
  lesson,
  folder_id::text as folder_id,
  organization_origin_id::text as organization_origin_id,
  created_at::text as created_at,
  updated_at::text as updated_at
`;

try {
  await source.connect();
  await source.query('begin read only');

  const sourceAll = await source.query(`
    select ${selectColumns}
    from public.lessons
    order by id asc
  `);
  const targetAll = await target`
    select
      owner_id::text as owner_id,
      id::text as id,
      title,
      lesson,
      folder_id::text as folder_id,
      organization_origin_id::text as organization_origin_id,
      created_at::text as created_at,
      updated_at::text as updated_at
    from public.lessons
    order by id asc
  `;

  if (fingerprint(canonicalRows(sourceAll.rows)) !== fingerprint(canonicalRows(targetAll))) {
    const delta = anonymousDelta(sourceAll.rows, targetAll);
    console.error(`Lesson row counts: Supabase ${sourceAll.rows.length}, Neon ${targetAll.length}.`);
    console.error(`Anonymous delta: Supabase-only ${delta.sourceOnly}, Neon-only ${delta.targetOnly}, changed ${delta.changed}, owners with count drift ${delta.ownersWithCountDrift}.`);
    throw new Error('Supabase and Neon lesson tables have different fingerprints.');
  }

  const ownerId = targetAll[0]?.owner_id;
  if (typeof ownerId !== 'string') throw new Error('No eligible lesson owner exists for parity.');

  const sourceFiltered = await source.query(`
    select ${selectColumns.replace('owner_id::text as owner_id,', '')}
    from public.lessons
    where owner_id = $1
    order by updated_at desc, id asc
  `, [ownerId]);
  const targetFiltered = await target`
    select
      id::text as id,
      title,
      lesson,
      folder_id::text as folder_id,
      organization_origin_id::text as organization_origin_id,
      created_at::text as created_at,
      updated_at::text as updated_at
    from public.lessons
    where owner_id = ${ownerId}
    order by updated_at desc, id asc
  `;

  if (fingerprint(canonicalRows(sourceFiltered.rows)) !== fingerprint(canonicalRows(targetFiltered))) {
    throw new Error('Supabase and Neon returned different lesson rows for the same owner.');
  }

  await source.query('commit');
  console.log(`Compared ${targetAll.length} lesson rows across both databases.`);
  console.log(`Compared ${targetFiltered.length} owner-scoped lesson rows without logging their owner or contents.`);
  console.log('PASS: Supabase and Neon returned the same lesson table and owner-scoped result.');
  console.log('Read-only parity check completed; no owner ID, title, lesson content, or secret was logged.');
} catch (error) {
  try { await source.query('rollback'); } catch {}
  throw error;
} finally {
  await source.end().catch(() => {});
}
