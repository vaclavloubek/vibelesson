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
  application_name: 'syllonaut-neon-folder-write-source-check',
});
const target = new Client({
  connectionString: targetUrl,
  connectionTimeoutMillis: 15_000,
  query_timeout: 30_000,
  statement_timeout: 30_000,
  application_name: 'syllonaut-neon-folder-write-rollback-check',
});

const selectAllFolders = `
  select owner_id::text as owner_id, id::text as id, name, parent_id::text as parent_id
  from public.lesson_folders
  order by owner_id asc, name asc, id asc
`;

let targetTransactionOpen = false;

try {
  await Promise.all([source.connect(), target.connect()]);
  await source.query('begin read only');
  await target.query('begin');
  targetTransactionOpen = true;

  const [sourceBaseline, targetBaseline] = await Promise.all([
    source.query(selectAllFolders),
    target.query(selectAllFolders),
  ]);
  const baselineFingerprint = fingerprint(sourceBaseline.rows);
  if (baselineFingerprint !== fingerprint(targetBaseline.rows)) {
    throw new Error(`Folder baselines differ before the write check (counts ${sourceBaseline.rows.length}/${targetBaseline.rows.length}).`);
  }

  const ownerResult = await target.query(`
    select id::text as id
    from public.profiles
    where role = 'admin' or lesson_folders_enabled = true
    order by id asc
    limit 1
  `);
  const ownerId = ownerResult.rows[0]?.id;
  if (typeof ownerId !== 'string') throw new Error('No entitled profile exists for the folder-write check.');

  const suffix = randomUUID();
  const rootName = `__neon_folder_write_root_${suffix}`;
  const childName = `__neon_folder_write_child_${suffix}`;
  const renamedName = `__neon_folder_write_renamed_${suffix}`;

  const root = await target.query(`
    insert into public.lesson_folders (owner_id, parent_id, name)
    values ($1, null, $2)
    returning id::text as id
  `, [ownerId, rootName]);
  const rootId = root.rows[0]?.id;
  if (typeof rootId !== 'string') throw new Error('The rollback check did not create its root folder.');

  const child = await target.query(`
    insert into public.lesson_folders (owner_id, parent_id, name)
    values ($1, $2, $3)
    returning id::text as id
  `, [ownerId, rootId, childName]);
  const childId = child.rows[0]?.id;
  if (typeof childId !== 'string') throw new Error('The rollback check did not create its child folder.');

  const denied = await target.query(`
    update public.lesson_folders
    set name = $1, updated_at = now()
    where id = $2 and owner_id = $3
    returning id
  `, [renamedName, rootId, randomUUID()]);
  if (denied.rowCount !== 0) throw new Error('An owner-scoped folder update affected another owner.');

  const renamed = await target.query(`
    update public.lesson_folders
    set name = $1, updated_at = now()
    where id = $2 and owner_id = $3
    returning id
  `, [renamedName, rootId, ownerId]);
  if (renamed.rowCount !== 1) throw new Error('The owner-scoped folder rename did not affect exactly one row.');

  await target.query('savepoint expected_child_guard');
  try {
    await target.query('delete from public.lesson_folders where id = $1 and owner_id = $2', [rootId, ownerId]);
    throw new Error('A parent folder with a child was unexpectedly deleted.');
  } catch (error) {
    await target.query('rollback to savepoint expected_child_guard');
    if (error?.code !== '23503') throw error;
  }

  const deletedChild = await target.query(
    'delete from public.lesson_folders where id = $1 and owner_id = $2 returning id',
    [childId, ownerId],
  );
  const deletedRoot = await target.query(
    'delete from public.lesson_folders where id = $1 and owner_id = $2 returning id',
    [rootId, ownerId],
  );
  if (deletedChild.rowCount !== 1 || deletedRoot.rowCount !== 1) {
    throw new Error('The rollback check did not delete exactly its own two folders.');
  }

  const transactionEnd = await target.query(selectAllFolders);
  if (fingerprint(transactionEnd.rows) !== baselineFingerprint) {
    throw new Error('The folder table did not return to its baseline inside the rollback transaction.');
  }

  await target.query('rollback');
  targetTransactionOpen = false;
  const targetAfterRollback = await target.query(selectAllFolders);
  if (fingerprint(targetAfterRollback.rows) !== baselineFingerprint) {
    throw new Error('The Neon folder table changed after rollback.');
  }

  await source.query('commit');
  console.log(`Compared ${sourceBaseline.rows.length} baseline folder rows before the write cycle.`);
  console.log('Verified owner-scoped create, rename, denied cross-owner update, child-delete guard, and delete.');
  console.log('PASS: the complete Neon write cycle was rolled back and both database baselines remain identical.');
  console.log('No owner ID, folder ID, folder name, or secret was logged.');
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
