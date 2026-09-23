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
  application_name: 'syllonaut-neon-lesson-move-source-check',
});
const target = new Client({
  connectionString: targetUrl,
  connectionTimeoutMillis: 15_000,
  query_timeout: 30_000,
  statement_timeout: 30_000,
  application_name: 'syllonaut-neon-lesson-move-rollback-check',
});

const selectLessonAssignments = `
  select id::text as id, owner_id::text as owner_id, folder_id::text as folder_id
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
    source.query(selectLessonAssignments),
    target.query(selectLessonAssignments),
  ]);
  const sourceFingerprint = fingerprint(sourceBaseline.rows);
  const targetFingerprint = fingerprint(targetBaseline.rows);
  const baselineDrifted = sourceFingerprint !== targetFingerprint;

  const candidate = await target.query(`
    select l.id::text as lesson_id, l.owner_id::text as owner_id, l.folder_id::text as folder_id
    from public.lessons l
    join public.profiles p on p.id = l.owner_id
    where p.role = 'admin' or p.lesson_folders_enabled = true
    order by l.id asc
    limit 1
  `);
  const lessonId = candidate.rows[0]?.lesson_id;
  const ownerId = candidate.rows[0]?.owner_id;
  const originalFolderId = candidate.rows[0]?.folder_id ?? null;
  if (typeof lessonId !== 'string' || typeof ownerId !== 'string') {
    throw new Error('No entitled owned lesson exists for the lesson-move check.');
  }

  const temporaryFolder = await target.query(`
    insert into public.lesson_folders (owner_id, parent_id, name)
    values ($1, null, $2)
    returning id::text as id
  `, [ownerId, `__neon_lesson_move_${randomUUID()}`]);
  const temporaryFolderId = temporaryFolder.rows[0]?.id;
  if (typeof temporaryFolderId !== 'string') {
    throw new Error('The rollback check did not create its temporary folder.');
  }

  const denied = await target.query(`
    update public.lessons
    set folder_id = $1
    where id = $2 and owner_id = $3
    returning id
  `, [temporaryFolderId, lessonId, randomUUID()]);
  if (denied.rowCount !== 0) throw new Error('An owner-scoped lesson move affected another owner.');

  const moved = await target.query(`
    update public.lessons
    set folder_id = $1
    where id = $2 and owner_id = $3
    returning id
  `, [temporaryFolderId, lessonId, ownerId]);
  if (moved.rowCount !== 1) throw new Error('The owner-scoped folder assignment did not affect exactly one lesson.');

  const unfiled = await target.query(`
    update public.lessons
    set folder_id = null
    where id = $1 and owner_id = $2 and folder_id = $3
    returning id
  `, [lessonId, ownerId, temporaryFolderId]);
  if (unfiled.rowCount !== 1) throw new Error('Moving the lesson back to the unfiled state failed.');

  const restored = await target.query(`
    update public.lessons
    set folder_id = $1
    where id = $2 and owner_id = $3
    returning id
  `, [originalFolderId, lessonId, ownerId]);
  if (restored.rowCount !== 1) throw new Error('The rollback check did not restore the original assignment.');

  const deletedFolder = await target.query(
    'delete from public.lesson_folders where id = $1 and owner_id = $2 returning id',
    [temporaryFolderId, ownerId],
  );
  if (deletedFolder.rowCount !== 1) throw new Error('The rollback check did not remove its temporary folder.');

  const transactionEnd = await target.query(selectLessonAssignments);
  if (fingerprint(transactionEnd.rows) !== targetFingerprint) {
    throw new Error('Lesson folder assignments did not return to their Neon baseline inside the transaction.');
  }

  await target.query('rollback');
  targetTransactionOpen = false;
  const targetAfterRollback = await target.query(selectLessonAssignments);
  if (fingerprint(targetAfterRollback.rows) !== targetFingerprint) {
    throw new Error('Neon lesson folder assignments changed after rollback.');
  }

  await source.query('commit');
  console.log(`Compared source/target lesson assignment row counts before the write cycle: ${sourceBaseline.rows.length}/${targetBaseline.rows.length}.`);
  if (baselineDrifted) {
    console.log('NOTICE: source and staging lesson-assignment fingerprints differ; preserve this drift for the final delta-sync plan.');
  } else {
    console.log('Source and staging lesson-assignment fingerprints match.');
  }
  console.log('Verified owner-scoped move into a folder, denied cross-owner update, move to unfiled, and restoration.');
  console.log('PASS: the complete Neon lesson-move cycle was rolled back and the staging baseline is unchanged.');
  console.log('No owner ID, lesson ID, folder ID, lesson content, or secret was logged.');
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
