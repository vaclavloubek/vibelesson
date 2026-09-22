import { createHash, randomUUID } from 'node:crypto';
import { loadEnvFile } from 'node:process';
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

function validateUrl(name, value, hostnameSuffix, { direct = false } = {}) {
  const parsed = new URL(value);
  if (!['postgres:', 'postgresql:'].includes(parsed.protocol) || !parsed.hostname.endsWith(hostnameSuffix)) {
    throw new Error(`${name} points to an unexpected database host.`);
  }
  if (direct && parsed.hostname.includes('-pooler.')) {
    throw new Error(`${name} must use a direct database host.`);
  }
}

function fingerprint(value) {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

const sourceUrl = required('SUPABASE_DB_URL');
const targetUrl = required(
  'NEON_DATABASE_URL_UNPOOLED',
  'DATABASE_URL_UNPOOLED',
  'NEON_DATABASE_URL',
  'DATABASE_URL',
);
validateUrl('SUPABASE_DB_URL', sourceUrl, '.pooler.supabase.com');
validateUrl('NEON_DATABASE_URL_UNPOOLED', targetUrl, '.neon.tech', { direct: true });

const connectionOptions = {
  connectionTimeoutMillis: 15_000,
  query_timeout: 30_000,
  statement_timeout: 30_000,
};
const source = new Client({
  ...connectionOptions,
  connectionString: sourceUrl,
  application_name: 'syllonaut-neon-lesson-delete-source-check',
});
const target = new Client({
  ...connectionOptions,
  connectionString: targetUrl,
  application_name: 'syllonaut-neon-lesson-delete-rollback-check',
});

const lessonFingerprintSql = `
  select id::text as id, owner_id::text as owner_id, title, lesson, folder_id::text as folder_id
  from public.lessons
  order by id asc
`;

let targetTransactionOpen = false;

try {
  await Promise.all([source.connect(), target.connect()]);
  await source.query('begin read only');
  await target.query('begin');
  targetTransactionOpen = true;

  const [sourceBaseline, targetBaseline] = await Promise.all([
    source.query(lessonFingerprintSql),
    target.query(lessonFingerprintSql),
  ]);
  const targetFingerprint = fingerprint(targetBaseline.rows);

  const candidate = await target.query(`
    select id::text as lesson_id, owner_id::text as owner_id
    from public.lessons
    where organization_origin_id is null
    order by id asc
    limit 1
  `);
  const lessonId = candidate.rows[0]?.lesson_id;
  const ownerId = candidate.rows[0]?.owner_id;
  if (typeof lessonId !== 'string' || typeof ownerId !== 'string') {
    throw new Error('No deletable owned lesson exists for the lesson-delete check.');
  }

  const denied = await target.query(
    'delete from public.lessons where id = $1 and owner_id = $2 returning id',
    [lessonId, randomUUID()],
  );
  if (denied.rowCount !== 0) throw new Error('An owner-scoped lesson delete affected another owner.');

  const deleted = await target.query(
    'delete from public.lessons where id = $1 and owner_id = $2 returning id',
    [lessonId, ownerId],
  );
  if (deleted.rowCount !== 1) throw new Error('The owner-scoped lesson delete did not remove exactly one row.');

  const missing = await target.query('select count(*)::int as count from public.lessons where id = $1', [lessonId]);
  if (missing.rows[0]?.count !== 0) throw new Error('The deleted lesson remained visible inside the transaction.');

  await target.query('rollback');
  targetTransactionOpen = false;

  const targetAfterRollback = await target.query(lessonFingerprintSql);
  if (fingerprint(targetAfterRollback.rows) !== targetFingerprint) {
    throw new Error('Neon lesson data changed after the delete rollback.');
  }

  await source.query('commit');
  console.log(`Compared source/target lesson row counts before the delete cycle: ${sourceBaseline.rows.length}/${targetBaseline.rows.length}.`);
  if (fingerprint(sourceBaseline.rows) !== targetFingerprint) {
    console.log('NOTICE: source and staging lesson fingerprints differ; preserve this drift for the final delta-sync plan.');
  } else {
    console.log('Source and staging lesson fingerprints match.');
  }
  console.log('Verified a denied cross-owner delete and one owner-scoped delete inside a rollback-only transaction.');
  console.log('PASS: the complete Neon lesson-delete cycle was rolled back and the staging baseline is unchanged.');
  console.log('No owner ID, lesson ID, lesson title, lesson content, or secret was logged.');
} catch (error) {
  if (targetTransactionOpen) {
    try { await target.query('rollback'); } catch {}
  }
  try { await source.query('rollback'); } catch {}
  throw error;
} finally {
  await Promise.all([
    source.end().catch(() => {}),
    target.end().catch(() => {}),
  ]);
}
