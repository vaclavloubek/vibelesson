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
  application_name: 'syllonaut-neon-session-access-parity',
});
const target = neon(targetUrl, { fetchOptions: { signal: AbortSignal.timeout(30_000) } });

try {
  await source.connect();
  await source.query('begin read only');

  const sourceAll = await source.query(`
    select id::text as id, teacher_id::text as teacher_id
    from public.sessions
    order by id asc
  `);
  const targetAll = await target`
    select id::text as id, teacher_id::text as teacher_id
    from public.sessions
    order by id asc
  `;

  if (fingerprint(sourceAll.rows) !== fingerprint(targetAll)) {
    throw new Error(`Supabase and Neon session-access rows differ (counts ${sourceAll.rows.length}/${targetAll.length}).`);
  }

  const candidate = targetAll[0];
  if (typeof candidate?.id !== 'string' || typeof candidate?.teacher_id !== 'string') {
    throw new Error('No eligible owner-scoped session exists for parity.');
  }

  const sourceScoped = await source.query(`
    select id::text as id
    from public.sessions
    where id = $1 and teacher_id = $2
    limit 1
  `, [candidate.id, candidate.teacher_id]);
  const targetScoped = await target`
    select id::text as id
    from public.sessions
    where id = ${candidate.id}
      and teacher_id = ${candidate.teacher_id}
    limit 1
  `;

  if (fingerprint(sourceScoped.rows) !== fingerprint(targetScoped)) {
    throw new Error('Supabase and Neon returned different owner-scoped session-access results.');
  }

  const sourceDenied = await source.query(`
    select id::text as id
    from public.sessions
    where id = $1 and teacher_id <> $2
    limit 1
  `, [candidate.id, candidate.teacher_id]);
  const targetDenied = await target`
    select id::text as id
    from public.sessions
    where id = ${candidate.id}
      and teacher_id <> ${candidate.teacher_id}
    limit 1
  `;

  if (sourceDenied.rows.length !== 0 || targetDenied.length !== 0) {
    throw new Error('The negative owner-scope check unexpectedly returned a session.');
  }

  await source.query('commit');
  console.log(`Compared ${targetAll.length} session ownership rows across both databases.`);
  console.log('Compared one allowed and one denied owner-scoped access lookup without logging session or owner IDs.');
  console.log('PASS: Supabase and Neon returned the same session-access decisions.');
  console.log('Read-only parity check completed; no session ID, owner ID, snapshot, join code, or secret was logged.');
} catch (error) {
  try { await source.query('rollback'); } catch {}
  throw error;
} finally {
  await source.end().catch(() => {});
}
