import pg from 'pg';

const { Client } = pg;

function required(name, ...fallbacks) {
  for (const key of [name, ...fallbacks]) {
    const value = process.env[key];
    if (value && value !== '[SENSITIVE]') return value;
  }
  throw new Error(`${name} is unavailable in this Preview build`);
}

function parsePostgresUrl(name, value) {
  const parsed = new URL(value);
  if (!['postgres:', 'postgresql:'].includes(parsed.protocol)) {
    throw new Error(`${name} must use a PostgreSQL URL`);
  }
  return parsed;
}

function validateSource(value) {
  const parsed = parsePostgresUrl('SUPABASE_DB_URL', value);
  const hostname = parsed.hostname.toLowerCase();
  const sessionPooler = hostname.endsWith('.pooler.supabase.com') && parsed.port === '5432';
  if (!sessionPooler) {
    throw new Error('SUPABASE_DB_URL must use the Session pooler on port 5432 for this Preview build');
  }
}

function validateTarget(value) {
  const hostname = parsePostgresUrl('DATABASE_URL_UNPOOLED', value).hostname.toLowerCase();
  if (!hostname.endsWith('.neon.tech')) {
    throw new Error('DATABASE_URL_UNPOOLED points to an unexpected host');
  }
}

async function inspect(label, connectionString, queries) {
  const client = new Client({
    connectionString,
    connectionTimeoutMillis: 15_000,
    query_timeout: 15_000,
    statement_timeout: 15_000,
    application_name: 'syllonaut-neon-preview-preflight',
  });

  try {
    await client.connect();
    await client.query('begin read only');
    for (const [description, sql] of queries) {
      const result = await client.query(sql);
      const row = result.rows[0] ?? {};
      console.log(`${label} ${description}: ${Object.values(row).join('; ')}`);
    }
    await client.query('commit');
  } catch (error) {
    try { await client.query('rollback'); } catch {}
    const code = error && typeof error === 'object' && 'code' in error ? ` (${error.code})` : '';
    throw new Error(`${label} connection or read-only query failed${code}`);
  } finally {
    await client.end().catch(() => {});
  }
}

const source = required('SUPABASE_DB_URL');
const target = required('DATABASE_URL_UNPOOLED', 'NEON_DATABASE_URL_UNPOOLED', 'DATABASE_URL');
validateSource(source);
validateTarget(target);

await inspect('Source', source, [
  ['version/size', "select current_setting('server_version') as version, pg_size_pretty(pg_database_size(current_database())) as size"],
  ['schemas', "select coalesce(string_agg(nspname, ', ' order by nspname), 'none') as schemas from pg_namespace where nspname in ('public','private','auth')"],
  ['tables', "select count(*)::text as count from pg_tables where schemaname in ('public','private')"],
  ['auth users', "select count(*)::text as count from auth.users"],
]);

await inspect('Target', target, [
  ['version/size', "select current_setting('server_version') as version, pg_size_pretty(pg_database_size(current_database())) as size"],
  ['app tables', "select count(*)::text as count from pg_tables where schemaname in ('public','private','app_identity')"],
  ['Data API roles', "select coalesce(string_agg(rolname, ', ' order by rolname), 'none') as roles from pg_roles where rolname in ('anonymous','authenticated')"],
  ['Neon Auth', "select case when to_regclass('neon_auth.\"user\"') is null then 'missing' else 'ready' end as status"],
]);

console.log('PASS: Preview build read-only preflight completed; no database writes were performed.');
