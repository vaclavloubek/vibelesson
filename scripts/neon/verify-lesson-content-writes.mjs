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
  const parsed = parsePostgresUrl('NEON_DATABASE_URL_UNPOOLED', value);
  if (!parsed.hostname.endsWith('.neon.tech') || parsed.hostname.includes('-pooler.')) {
    throw new Error('NEON_DATABASE_URL_UNPOOLED must use a direct Neon host.');
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
validateSource(sourceUrl);
validateTarget(targetUrl);

const source = new Client({
  connectionString: sourceUrl,
  connectionTimeoutMillis: 15_000,
  query_timeout: 30_000,
  statement_timeout: 30_000,
  application_name: 'syllonaut-neon-lesson-content-source-check',
});
const target = new Client({
  connectionString: targetUrl,
  connectionTimeoutMillis: 15_000,
  query_timeout: 30_000,
  statement_timeout: 30_000,
  application_name: 'syllonaut-neon-lesson-content-rollback-check',
});

const selectLessonContent = `
  select id::text as id, owner_id::text as owner_id, title, lesson
  from public.lessons
  order by owner_id asc, id asc
`;

let targetTransactionOpen = false;

try {
  await Promise.all([source.connect(), target.connect()]);
  await source.query('begin read only');
  await target.query('begin');
  targetTransactionOpen = true;

  const [sourceBaseline, targetBaseline] = await Promise.all([
    source.query(selectLessonContent),
    target.query(selectLessonContent),
  ]);
  const sourceFingerprint = fingerprint(sourceBaseline.rows);
  const targetFingerprint = fingerprint(targetBaseline.rows);
  const baselineDrifted = sourceFingerprint !== targetFingerprint;

  const candidate = await target.query(`
    select id::text as lesson_id, owner_id::text as owner_id, title, lesson
    from public.lessons
    where organization_origin_id is null
    order by id asc
    limit 1
  `);
  const lessonId = candidate.rows[0]?.lesson_id;
  const ownerId = candidate.rows[0]?.owner_id;
  const originalTitle = candidate.rows[0]?.title;
  const originalLesson = candidate.rows[0]?.lesson;
  if (
    typeof lessonId !== 'string'
    || typeof ownerId !== 'string'
    || typeof originalTitle !== 'string'
    || !originalLesson
    || typeof originalLesson !== 'object'
  ) {
    throw new Error('No editable owned lesson exists for the lesson-content check.');
  }

  const temporaryTitle = `__neon_lesson_content_${randomUUID()}`;
  const denied = await target.query(`
    update public.lessons
    set title = $1,
        lesson = jsonb_set(lesson, '{title}', to_jsonb($1::text), true),
        updated_at = now()
    where id = $2 and owner_id = $3
    returning id
  `, [temporaryTitle, lessonId, randomUUID()]);
  if (denied.rowCount !== 0) throw new Error('An owner-scoped lesson edit affected another owner.');

  const renamed = await target.query(`
    update public.lessons
    set title = $1,
        lesson = jsonb_set(lesson, '{title}', to_jsonb($1::text), true),
        updated_at = now()
    where id = $2 and owner_id = $3
    returning title, lesson->>'title' as lesson_title
  `, [temporaryTitle, lessonId, ownerId]);
  if (
    renamed.rowCount !== 1
    || renamed.rows[0]?.title !== temporaryTitle
    || renamed.rows[0]?.lesson_title !== temporaryTitle
  ) {
    throw new Error('The owner-scoped lesson rename did not update both title representations.');
  }

  const replacementLesson = {
    ...originalLesson,
    subtitle: `__neon_lesson_restore_${randomUUID()}`,
  };
  const replaced = await target.query(`
    update public.lessons
    set title = $1,
        lesson = $2::jsonb,
        updated_at = now()
    where id = $3 and owner_id = $4
    returning title, lesson
  `, [originalTitle, JSON.stringify(replacementLesson), lessonId, ownerId]);
  if (
    replaced.rowCount !== 1
    || replaced.rows[0]?.title !== originalTitle
    || fingerprint(replaced.rows[0]?.lesson) !== fingerprint(replacementLesson)
  ) {
    throw new Error('The owner-scoped full lesson replacement did not persist the expected document.');
  }

  const restored = await target.query(`
    update public.lessons
    set title = $1,
        lesson = $2::jsonb,
        updated_at = now()
    where id = $3 and owner_id = $4
    returning id
  `, [originalTitle, JSON.stringify(originalLesson), lessonId, ownerId]);
  if (restored.rowCount !== 1) throw new Error('The rollback check did not restore the original lesson content.');

  const transactionEnd = await target.query(selectLessonContent);
  if (fingerprint(transactionEnd.rows) !== targetFingerprint) {
    throw new Error('Lesson content did not return to its Neon baseline inside the transaction.');
  }

  await target.query('rollback');
  targetTransactionOpen = false;
  const targetAfterRollback = await target.query(selectLessonContent);
  if (fingerprint(targetAfterRollback.rows) !== targetFingerprint) {
    throw new Error('Neon lesson content changed after rollback.');
  }

  await source.query('commit');
  console.log(`Compared source/target lesson-content row counts before the write cycle: ${sourceBaseline.rows.length}/${targetBaseline.rows.length}.`);
  if (baselineDrifted) {
    console.log('NOTICE: source and staging lesson-content fingerprints differ; preserve this drift for the final delta-sync plan.');
  } else {
    console.log('Source and staging lesson-content fingerprints match.');
  }
  console.log('Verified owner-scoped rename, denied cross-owner update, full document replacement, and restoration.');
  console.log('PASS: the complete Neon lesson-content cycle was rolled back and the staging baseline is unchanged.');
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
