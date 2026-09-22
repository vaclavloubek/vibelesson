import { createHash } from 'node:crypto';
import { loadEnvFile } from 'node:process';
import pg from 'pg';

const { Client } = pg;
const expectedBranch = 'codex/neon-staging-import-20260921-v2';

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

function validateUrl(name, value, hostnameSuffix) {
  const parsed = new URL(value);
  if (!['postgres:', 'postgresql:'].includes(parsed.protocol) || !parsed.hostname.endsWith(hostnameSuffix)) {
    throw new Error(`${name} points to an unexpected database host.`);
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

function fingerprint(value) {
  return createHash('sha256').update(JSON.stringify(canonicalJson(value))).digest('hex');
}

function rowsById(rows) {
  return [...rows].sort((left, right) => left.id.localeCompare(right.id));
}

function compareRows(sourceRows, targetRows) {
  const sourceById = new Map(sourceRows.map((row) => [row.id, fingerprint(row)]));
  const targetById = new Map(targetRows.map((row) => [row.id, fingerprint(row)]));
  const sourceOnly = [...sourceById.keys()].filter((id) => !targetById.has(id));
  const targetOnly = [...targetById.keys()].filter((id) => !sourceById.has(id));
  const changed = [...sourceById].filter(([id, hash]) => targetById.has(id) && targetById.get(id) !== hash);
  return { sourceOnly, targetOnly, changed };
}

if (process.argv[2] !== '--approved-staging-only') {
  throw new Error('The explicit staging reconciliation argument is required.');
}
if (process.env.VERCEL_ENV !== 'preview' || process.env.VERCEL_GIT_COMMIT_REF !== expectedBranch) {
  throw new Error('Staging reconciliation is restricted to the exact Preview branch.');
}

const sourceUrl = required('SUPABASE_DB_URL');
const targetUrl = required(
  'NEON_DATABASE_URL',
  'DATABASE_URL_UNPOOLED',
  'NEON_DATABASE_URL_UNPOOLED',
  'DATABASE_URL',
);
validateUrl('SUPABASE_DB_URL', sourceUrl, '.pooler.supabase.com');
validateUrl('NEON_DATABASE_URL', targetUrl, '.neon.tech');

const connectionOptions = {
  connectionTimeoutMillis: 15_000,
  query_timeout: 30_000,
  statement_timeout: 30_000,
};
const source = new Client({
  ...connectionOptions,
  connectionString: sourceUrl,
  application_name: 'syllonaut-neon-stale-lesson-source',
});
const target = new Client({
  ...connectionOptions,
  connectionString: targetUrl,
  application_name: 'syllonaut-neon-stale-lesson-target',
});

const lessonSql = `
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

let committed = false;
try {
  await source.connect();
  await target.connect();
  await source.query('begin read only');
  await target.query('begin');

  const sourceLessons = (await source.query(lessonSql)).rows;
  const targetLessons = (await target.query(lessonSql)).rows;
  const delta = compareRows(sourceLessons, targetLessons);
  if (delta.sourceOnly.length !== 0 || delta.targetOnly.length !== 1 || delta.changed.length !== 0) {
    throw new Error('Staging no longer has the single expected target-only lesson delta.');
  }

  const staleLessonId = delta.targetOnly[0];
  const constraint = await target.query(`
    select count(*)::int as count
    from pg_constraint constraint_row
    join pg_class relation on relation.oid = constraint_row.conrelid
    join pg_namespace namespace on namespace.oid = relation.relnamespace
    where constraint_row.contype = 'f'
      and constraint_row.confrelid = 'public.lessons'::regclass
      and namespace.nspname = 'public'
      and relation.relname = 'generation_requests'
      and constraint_row.confdeltype = 'n'
  `);
  if (constraint.rows[0]?.count !== 1) {
    throw new Error('The expected generation_requests SET NULL constraint is unavailable.');
  }

  const targetDependency = await target.query(
    'select to_jsonb(request_row) as row from public.generation_requests request_row where lesson_id = $1',
    [staleLessonId],
  );
  const dependencyId = targetDependency.rows[0]?.row?.id;
  if (targetDependency.rows.length !== 1 || typeof dependencyId !== 'string') {
    throw new Error('The stale lesson does not have the single expected dependent row.');
  }

  const sourceDependency = await source.query(
    'select to_jsonb(request_row) as row from public.generation_requests request_row where id = $1',
    [dependencyId],
  );
  const normalizedTargetDependency = { ...targetDependency.rows[0].row, lesson_id: null };
  if (
    sourceDependency.rows.length !== 1
    || sourceDependency.rows[0].row?.lesson_id !== null
    || fingerprint(sourceDependency.rows[0].row) !== fingerprint(normalizedTargetDependency)
  ) {
    throw new Error('The dependent row would not match Supabase after SET NULL.');
  }

  const deletion = await target.query('delete from public.lessons where id = $1 returning id', [staleLessonId]);
  if (deletion.rowCount !== 1) throw new Error('The exact stale lesson was not deleted.');

  const targetLessonsAfter = (await target.query(lessonSql)).rows;
  if (fingerprint(rowsById(sourceLessons)) !== fingerprint(rowsById(targetLessonsAfter))) {
    throw new Error('Lesson parity did not pass after reconciliation.');
  }

  const targetDependencyAfter = await target.query(
    'select to_jsonb(request_row) as row from public.generation_requests request_row where id = $1',
    [dependencyId],
  );
  if (
    targetDependencyAfter.rows.length !== 1
    || fingerprint(sourceDependency.rows[0].row) !== fingerprint(targetDependencyAfter.rows[0].row)
  ) {
    throw new Error('Dependent-row parity did not pass after reconciliation.');
  }

  await source.query('commit');
  await target.query('commit');
  committed = true;
  console.log('PASS: removed exactly one stale lesson from Neon Preview staging.');
  console.log('PASS: the dependent generation request now matches Supabase through SET NULL.');
  console.log(`PASS: ${targetLessonsAfter.length} lesson rows match without logging identifiers or contents.`);
} catch (error) {
  try { await source.query('rollback'); } catch {}
  try { await target.query('rollback'); } catch {}
  throw error;
} finally {
  await source.end().catch(() => {});
  await target.end().catch(() => {});
  if (!committed) console.error('ROLLBACK: Neon Preview staging was left unchanged.');
}
