import { spawnSync } from 'node:child_process';

const execute = process.argv.includes('--execute');
const requiredCommands = ['psql', 'pg_dump'];
const missingCommands = requiredCommands.filter((command) =>
  spawnSync(command, ['--version'], { stdio: 'ignore' }).status !== 0,
);

const source = process.env.SUPABASE_DB_URL;
const target = process.env.NEON_DATABASE_URL_UNPOOLED ?? process.env.NEON_DATABASE_URL;
const failures = [];

if (missingCommands.length) failures.push(`missing PostgreSQL tools: ${missingCommands.join(', ')}`);
if (!source) failures.push('SUPABASE_DB_URL is not set');
if (!target) failures.push('NEON_DATABASE_URL_UNPOOLED or NEON_DATABASE_URL is not set');

if (source && target) {
  try {
    const sourceUrl = new URL(source);
    const targetUrl = new URL(target);
    if (`${sourceUrl.hostname}/${sourceUrl.pathname}` === `${targetUrl.hostname}/${targetUrl.pathname}`) {
      failures.push('source and target resolve to the same database');
    }
    if (!targetUrl.hostname.includes('.neon.tech') && !targetUrl.hostname.includes('.neon.build')) {
      failures.push('target hostname does not look like Neon');
    }
  } catch {
    failures.push('a database URL is malformed');
  }
}

if (!execute) {
  console.log('Neon migration preflight: preview only (no network or database writes).');
  console.log('Required tools: psql, pg_dump');
  console.log('Required environment: SUPABASE_DB_URL and NEON_DATABASE_URL_UNPOOLED');
  console.log('Use --execute for read-only database inspection.');
  process.exit(failures.length && missingCommands.length === 0 ? 1 : 0);
}

if (failures.length) {
  for (const failure of failures) console.error(`FAIL: ${failure}`);
  process.exit(1);
}

function inspect(label, connectionString, sql) {
  const result = spawnSync('psql', [connectionString, '-X', '-v', 'ON_ERROR_STOP=1', '-Atc', sql], {
    encoding: 'utf8',
  });
  if (result.status !== 0) {
    console.error(`${label}: connection or query failed (credentials were not printed).`);
    process.exit(1);
  }
  console.log(`${label}: ${result.stdout.trim()}`);
}

inspect('Source', source, "select current_setting('server_version') || '; size=' || pg_size_pretty(pg_database_size(current_database()))");
inspect('Source schemas', source, "select string_agg(nspname, ', ' order by nspname) from pg_namespace where nspname in ('public','private','auth')");
inspect('Target', target, "select current_setting('server_version') || '; database=' || current_database()");
inspect('Target Data API roles', target, "select string_agg(rolname, ', ' order by rolname) from pg_roles where rolname in ('anonymous','authenticated')");
console.log('PASS: read-only preflight completed.');
