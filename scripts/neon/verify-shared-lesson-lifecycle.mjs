import { createHash, randomBytes } from 'node:crypto';
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
  application_name: 'syllonaut-neon-shared-lesson-source-check',
});
const target = new Client({
  ...connectionOptions,
  connectionString: targetUrl,
  application_name: 'syllonaut-neon-shared-lesson-rollback-check',
});

const lessonFingerprintSql = `
  select id::text as id, owner_id::text as owner_id, title, lesson,
         source_share_id::text as source_share_id,
         source_lesson_id::text as source_lesson_id,
         reuse_family_id::text as reuse_family_id
  from public.lessons
  order by id asc
`;
const shareFingerprintSql = `
  select id::text as id, lesson_id::text as lesson_id, owner_id::text as owner_id,
         token, snapshot, status, created_at, revoked_at,
         reuse_family_id::text as reuse_family_id,
         organization_origin_id::text as organization_origin_id
  from public.lesson_shares
  order by id asc
`;
const requestFingerprintSql = `
  select id::text as id, user_id::text as user_id, organization_id::text as organization_id,
         action, status, lesson_id::text as lesson_id, cost_usd, created_at, completed_at
  from public.generation_requests
  order by id asc
`;
const deviceFingerprintSql = `
  select request_id::text as request_id, device_token_hash, user_id::text as user_id,
         action, status, created_at, completed_at
  from private.free_device_budget_requests
  order by request_id asc
`;

let targetTransactionOpen = false;

try {
  await Promise.all([source.connect(), target.connect()]);
  await source.query('begin read only');
  await target.query('begin');
  targetTransactionOpen = true;

  const [
    sourceLessons,
    sourceShares,
    targetLessons,
    targetShares,
    targetRequests,
    targetDevices,
  ] = await Promise.all([
    source.query(lessonFingerprintSql),
    source.query(shareFingerprintSql),
    target.query(lessonFingerprintSql),
    target.query(shareFingerprintSql),
    target.query(requestFingerprintSql),
    target.query(deviceFingerprintSql),
  ]);
  const lessonBaseline = fingerprint(targetLessons.rows);
  const shareBaseline = fingerprint(targetShares.rows);
  const requestBaseline = fingerprint(targetRequests.rows);
  const deviceBaseline = fingerprint(targetDevices.rows);

  const actors = await target.query(`
    select source.id::text as lesson_id,
           source.owner_id::text as owner_id,
           source.lesson,
           source.reuse_family_id::text as reuse_family_id,
           importer.id::text as importer_id
    from public.lessons source
    join public.profiles owner_profile on owner_profile.id = source.owner_id
    cross join lateral (
      select p.id
      from public.profiles p
      where p.id <> source.owner_id
        and p.role <> 'admin'
      order by p.id
      limit 1
    ) importer
    where source.organization_origin_id is null
      and owner_profile.role <> 'admin'
    order by source.id
    limit 1
  `);
  const actor = actors.rows[0];
  if (!actor) throw new Error('No isolated owner/importer pair exists for the shared-lesson lifecycle check.');

  await target.query(`
    update public.profiles
    set active_plan_code = 'free'
    where id = $1
  `, [actor.importer_id]);
  await target.query(`
    update public.organization_memberships
    set status = 'revoked',
        revoked_at = coalesce(revoked_at, now()),
        updated_at = now()
    where user_id = $1
      and status = 'active'
  `, [actor.importer_id]);
  const freeScenario = await target.query(
    'select private.lesson_reuse_enabled($1) as reuse_enabled',
    [actor.importer_id],
  );
  if (freeScenario.rows[0]?.reuse_enabled !== false) {
    throw new Error('Could not create an isolated Free-account import scenario.');
  }

  await target.query(`
    update public.generation_requests
    set status = 'failed', completed_at = now()
    where user_id = $1
      and organization_id is null
      and action = 'import_lesson'
      and status in ('pending', 'succeeded')
      and created_at >= date_trunc('month', now() at time zone 'UTC') at time zone 'UTC'
      and created_at < (date_trunc('month', now() at time zone 'UTC') + interval '1 month') at time zone 'UTC'
  `, [actor.importer_id]);

  await target.query(`
    update public.lesson_shares
    set status = 'revoked', revoked_at = now()
    where lesson_id = $1
      and status = 'active'
  `, [actor.lesson_id]);

  const token = randomBytes(24).toString('hex');
  const createdShare = await target.query(`
    insert into public.lesson_shares (lesson_id, owner_id, token, snapshot)
    values ($1, $2, $3, $4::jsonb)
    returning id::text as share_id, reuse_family_id::text as reuse_family_id
  `, [actor.lesson_id, actor.owner_id, token, JSON.stringify(actor.lesson)]);
  const share = createdShare.rows[0];
  if (!share || share.reuse_family_id !== actor.reuse_family_id) {
    throw new Error('Created share did not preserve immutable lesson lineage.');
  }

  const missing = await target.query(
    'select * from public.import_shared_lesson_neon_server($1, $2, $3)',
    [actor.importer_id, randomBytes(24).toString('hex'), 'a'.repeat(64)],
  );
  if (missing.rows[0]?.allowed !== false || missing.rows[0]?.denial_code !== 'share_not_found') {
    throw new Error('Unknown share token was not denied.');
  }

  const missingDevice = await target.query(
    'select * from public.import_shared_lesson_neon_server($1, $2, $3)',
    [actor.importer_id, token, null],
  );
  if (missingDevice.rows[0]?.allowed !== false
      || missingDevice.rows[0]?.denial_code !== 'free_device_cookie_required') {
    throw new Error('Free shared-lesson import did not enforce the device-budget cookie.');
  }

  const imported = await target.query(
    'select * from public.import_shared_lesson_neon_server($1, $2, $3)',
    [actor.importer_id, token, 'b'.repeat(64)],
  );
  const importedId = imported.rows[0]?.lesson_id;
  if (imported.rows[0]?.allowed !== true
      || imported.rows[0]?.already_imported !== false
      || typeof importedId !== 'string') {
    throw new Error('Atomic shared-lesson import did not return a new lesson.');
  }

  const importedLesson = await target.query(`
    select owner_id::text as owner_id,
           source_share_id::text as source_share_id,
           source_lesson_id::text as source_lesson_id,
           reuse_family_id::text as reuse_family_id,
           title,
           lesson
    from public.lessons
    where id = $1
  `, [importedId]);
  const importedRow = importedLesson.rows[0];
  if (!importedRow
      || importedRow.owner_id !== actor.importer_id
      || importedRow.source_share_id !== share.share_id
      || importedRow.source_lesson_id !== actor.lesson_id
      || importedRow.reuse_family_id !== actor.reuse_family_id
      || fingerprint(importedRow.lesson) !== fingerprint(actor.lesson)) {
    throw new Error('Imported lesson lost ownership, source provenance, snapshot, or lineage.');
  }

  const completed = await target.query(`
    select g.status, g.lesson_id::text as lesson_id, b.status as device_status
    from public.generation_requests g
    join private.free_device_budget_requests b on b.request_id = g.id
    where g.user_id = $1
      and g.action = 'import_lesson'
      and g.lesson_id = $2
  `, [actor.importer_id, importedId]);
  if (completed.rows[0]?.status !== 'succeeded'
      || completed.rows[0]?.device_status !== 'succeeded') {
    throw new Error('Account and device import reservations were not completed atomically.');
  }

  const repeated = await target.query(
    'select * from public.import_shared_lesson_neon_server($1, $2, $3)',
    [actor.importer_id, token, 'c'.repeat(64)],
  );
  if (repeated.rows[0]?.lesson_id !== importedId
      || repeated.rows[0]?.allowed !== true
      || repeated.rows[0]?.already_imported !== true) {
    throw new Error('Repeated shared-lesson import was not idempotent.');
  }

  await target.query(`
    update public.lesson_shares
    set status = 'revoked', revoked_at = now()
    where id = $1
  `, [share.share_id]);
  const revoked = await target.query(
    'select * from public.import_shared_lesson_neon_server($1, $2, $3)',
    [actor.importer_id, token, 'd'.repeat(64)],
  );
  if (revoked.rows[0]?.allowed !== false || revoked.rows[0]?.denial_code !== 'share_not_found') {
    throw new Error('Revoked share remained importable.');
  }

  await target.query('rollback');
  targetTransactionOpen = false;

  const [lessonsAfter, sharesAfter, requestsAfter, devicesAfter] = await Promise.all([
    target.query(lessonFingerprintSql),
    target.query(shareFingerprintSql),
    target.query(requestFingerprintSql),
    target.query(deviceFingerprintSql),
  ]);
  if (fingerprint(lessonsAfter.rows) !== lessonBaseline
      || fingerprint(sharesAfter.rows) !== shareBaseline
      || fingerprint(requestsAfter.rows) !== requestBaseline
      || fingerprint(devicesAfter.rows) !== deviceBaseline) {
    throw new Error('Neon staging changed after the shared-lesson lifecycle rollback.');
  }

  await source.query('commit');
  console.log(`Compared source/target rows before lifecycle test: lessons ${sourceLessons.rows.length}/${targetLessons.rows.length}; shares ${sourceShares.rows.length}/${targetShares.rows.length}.`);
  if (fingerprint(sourceLessons.rows) !== lessonBaseline || fingerprint(sourceShares.rows) !== shareBaseline) {
    console.log('NOTICE: source and staging fingerprints differ; preserve this drift for the final delta-sync plan.');
  } else {
    console.log('Source and staging lesson/share fingerprints match.');
  }
  console.log('Verified share creation lineage, unknown/revoked token denial, Free device gate, atomic import, quota completion, and idempotency.');
  console.log('PASS: the complete shared-lesson lifecycle was rolled back and all staging ledgers are unchanged.');
  console.log('No user ID, lesson ID, share ID, token, title, content, device hash, or secret was logged.');
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
