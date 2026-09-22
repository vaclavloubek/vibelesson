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

  return { sourceOnly, targetOnly, changed };
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
  application_name: 'syllonaut-neon-lesson-detail-parity',
});
const target = neon(targetUrl, { fetchOptions: { signal: AbortSignal.timeout(30_000) } });

try {
  await source.connect();
  await source.query('begin read only');

  const sourceAll = await source.query(`
    select
      owner_id::text as owner_id,
      id::text as id,
      source_prompt,
      lesson
    from public.lessons
    order by id asc
  `);
  const targetAll = await target`
    select
      owner_id::text as owner_id,
      id::text as id,
      source_prompt,
      lesson
    from public.lessons
    order by id asc
  `;

  if (fingerprint(canonicalRows(sourceAll.rows)) !== fingerprint(canonicalRows(targetAll))) {
    const delta = anonymousDelta(sourceAll.rows, targetAll);
    console.error(`Lesson-detail row counts: Supabase ${sourceAll.rows.length}, Neon ${targetAll.length}.`);
    console.error(`Anonymous delta: Supabase-only ${delta.sourceOnly}, Neon-only ${delta.targetOnly}, changed ${delta.changed}.`);
    throw new Error('Supabase and Neon lesson-detail tables have different fingerprints.');
  }

  const candidate = targetAll[0];
  if (typeof candidate?.owner_id !== 'string' || typeof candidate?.id !== 'string') {
    throw new Error('No eligible lesson detail exists for parity.');
  }

  const sourceDetail = await source.query(`
    select
      id::text as id,
      source_prompt,
      lesson
    from public.lessons
    where id = $1 and owner_id = $2
    limit 1
  `, [candidate.id, candidate.owner_id]);
  const targetDetail = await target`
    select
      id::text as id,
      source_prompt,
      lesson
    from public.lessons
    where id = ${candidate.id}
      and owner_id = ${candidate.owner_id}
    limit 1
  `;

  if (fingerprint(sourceDetail.rows) !== fingerprint(targetDetail)) {
    throw new Error('Supabase and Neon returned different detail for the same owner-scoped lesson.');
  }

  await source.query('commit');
  console.log(`Compared ${targetAll.length} lesson-detail rows across both databases.`);
  console.log('Compared one owner-scoped lesson detail without logging its lesson ID, owner, prompt, or content.');
  console.log('PASS: Supabase and Neon returned the same lesson-detail table and owner-scoped result.');
  console.log('Read-only parity check completed; no lesson ID, owner ID, prompt, content, or secret was logged.');
} catch (error) {
  try { await source.query('rollback'); } catch {}
  throw error;
} finally {
  await source.end().catch(() => {});
}
