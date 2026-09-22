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
  application_name: 'syllonaut-neon-lesson-reuse-parity',
});
const target = neon(targetUrl, { fetchOptions: { signal: AbortSignal.timeout(30_000) } });

try {
  await source.connect();
  await source.query('begin read only');

  const sourceEntitlements = await source.query(`
    select
      p.id::text as id,
      (
        p.role = 'admin'
        or coalesce(p.active_plan_code, 'free') <> 'free'
        or exists (
          select 1
          from private.current_active_organization(p.id)
        )
      ) as enabled
    from public.profiles p
    order by p.id asc
  `);
  const targetEntitlements = await target`
    select
      p.id::text as id,
      (
        p.role = 'admin'
        or coalesce(p.active_plan_code, 'free') <> 'free'
        or exists (
          select 1
          from private.current_active_organization(p.id)
        )
      ) as enabled
    from public.profiles p
    order by p.id asc
  `;
  if (
    fingerprint(canonicalRows(sourceEntitlements.rows))
    !== fingerprint(canonicalRows(targetEntitlements))
  ) {
    throw new Error('Supabase and Neon returned different lesson-reuse entitlements.');
  }

  const sourceUsage = await source.query(`
    select lesson_id::text as id, owner_id::text as owner_id
    from public.lesson_live_usage
    order by lesson_id asc
  `);
  const targetUsage = await target`
    select lesson_id::text as id, owner_id::text as owner_id
    from public.lesson_live_usage
    order by lesson_id asc
  `;
  if (fingerprint(canonicalRows(sourceUsage.rows)) !== fingerprint(canonicalRows(targetUsage))) {
    throw new Error('Supabase and Neon returned different lesson live-usage ledgers.');
  }

  const candidate = targetUsage[0];
  if (typeof candidate?.id !== 'string' || typeof candidate?.owner_id !== 'string') {
    throw new Error('No eligible lesson live-usage row exists for owner-scoped parity.');
  }

  const sourceScoped = await source.query(`
    select lesson_id::text as id
    from public.lesson_live_usage
    where owner_id = $1 and lesson_id = $2
    order by lesson_id asc
  `, [candidate.owner_id, candidate.id]);
  const targetScoped = await target`
    select lesson_id::text as id
    from public.lesson_live_usage
    where owner_id = ${candidate.owner_id}
      and lesson_id = ${candidate.id}
    order by lesson_id asc
  `;
  if (fingerprint(sourceScoped.rows) !== fingerprint(targetScoped)) {
    throw new Error('Supabase and Neon returned different owner-scoped live-usage results.');
  }

  await source.query('commit');
  console.log(`Compared ${targetEntitlements.length} lesson-reuse entitlements across both databases.`);
  console.log(`Compared ${targetUsage.length} live-usage rows across both databases.`);
  console.log('Compared one owner-scoped live-usage lookup without logging its lesson ID or owner.');
  console.log('PASS: Supabase and Neon returned the same lesson-reuse entitlements and live-usage rows.');
  console.log('Read-only parity check completed; no user ID, lesson ID, or secret was logged.');
} catch (error) {
  try { await source.query('rollback'); } catch {}
  throw error;
} finally {
  await source.end().catch(() => {});
}
