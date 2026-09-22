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
  application_name: 'syllonaut-neon-lesson-duplicate-source-check',
});
const target = new Client({
  ...connectionOptions,
  connectionString: targetUrl,
  application_name: 'syllonaut-neon-lesson-duplicate-rollback-check',
});

const lessonFingerprintSql = `
  select id::text as id, owner_id::text as owner_id, title, lesson,
         folder_id::text as folder_id, source_lesson_id::text as source_lesson_id,
         reuse_family_id::text as reuse_family_id,
         organization_origin_id::text as organization_origin_id
  from public.lessons
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

  const [sourceBaseline, targetBaseline, requestBaseline, deviceBaseline] = await Promise.all([
    source.query(lessonFingerprintSql),
    target.query(lessonFingerprintSql),
    target.query(requestFingerprintSql),
    target.query(deviceFingerprintSql),
  ]);
  const targetLessonFingerprint = fingerprint(targetBaseline.rows);
  const targetRequestFingerprint = fingerprint(requestBaseline.rows);
  const targetDeviceFingerprint = fingerprint(deviceBaseline.rows);

  const candidate = await target.query(`
    select l.id::text as lesson_id,
           l.owner_id::text as owner_id,
           l.title,
           l.folder_id::text as folder_id,
           l.reuse_family_id::text as reuse_family_id
    from public.lessons l
    join public.profiles p on p.id = l.owner_id
    where l.organization_origin_id is null
      and p.role <> 'admin'
      and coalesce(p.active_plan_code, 'free') = 'free'
      and not exists (
        select 1
        from public.organization_memberships m
        join public.organizations o on o.id = m.organization_id
        where m.user_id = l.owner_id
          and m.status = 'active'
          and m.revoked_at is null
          and o.status = 'active'
      )
    order by l.id asc
    limit 1
  `);
  const lessonId = candidate.rows[0]?.lesson_id;
  const ownerId = candidate.rows[0]?.owner_id;
  if (typeof lessonId !== 'string' || typeof ownerId !== 'string') {
    throw new Error('No personal Free lesson exists for the atomic duplication check.');
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
  `, [ownerId]);

  const denied = await target.query(
    'select * from public.duplicate_lesson_server($1, $2, $3)',
    [randomUUID(), lessonId, 'a'.repeat(64)],
  );
  if (denied.rows[0]?.allowed !== false || denied.rows[0]?.denial_code !== 'lesson_not_found') {
    throw new Error('Cross-owner lesson duplication was not denied.');
  }

  const missingDevice = await target.query(
    'select * from public.duplicate_lesson_server($1, $2, $3)',
    [ownerId, lessonId, null],
  );
  if (missingDevice.rows[0]?.allowed !== false
      || missingDevice.rows[0]?.denial_code !== 'free_device_cookie_required') {
    throw new Error('Free duplication did not enforce the device-budget cookie.');
  }

  const copied = await target.query(
    'select * from public.duplicate_lesson_server($1, $2, $3)',
    [ownerId, lessonId, 'b'.repeat(64)],
  );
  const copyId = copied.rows[0]?.lesson_id;
  if (copied.rows[0]?.allowed !== true || typeof copyId !== 'string') {
    throw new Error('Atomic lesson duplication did not return a copied lesson.');
  }

  const copy = await target.query(`
    select l.owner_id::text as owner_id,
           l.title,
           l.lesson->>'title' as document_title,
           l.folder_id::text as folder_id,
           l.source_lesson_id::text as source_lesson_id,
           l.reuse_family_id::text as reuse_family_id
    from public.lessons l
    where l.id = $1
  `, [copyId]);
  const copyRow = copy.rows[0];
  if (!copyRow
      || copyRow.owner_id !== ownerId
      || copyRow.source_lesson_id !== lessonId
      || copyRow.folder_id !== candidate.rows[0].folder_id
      || copyRow.reuse_family_id !== candidate.rows[0].reuse_family_id
      || copyRow.title !== copyRow.document_title
      || !copyRow.title.endsWith(' – kopie')) {
    throw new Error('The copied lesson lost ownership, folder, title, or immutable lineage.');
  }

  const completed = await target.query(`
    select g.status, g.lesson_id::text as lesson_id, b.status as device_status
    from public.generation_requests g
    join private.free_device_budget_requests b on b.request_id = g.id
    where g.user_id = $1
      and g.action = 'import_lesson'
      and g.lesson_id = $2
  `, [ownerId, copyId]);
  if (completed.rows[0]?.status !== 'succeeded'
      || completed.rows[0]?.device_status !== 'succeeded'
      || completed.rows[0]?.lesson_id !== copyId) {
    throw new Error('Account and device quota reservations were not completed atomically.');
  }

  await target.query('rollback');
  targetTransactionOpen = false;

  const [targetAfter, requestsAfter, devicesAfter] = await Promise.all([
    target.query(lessonFingerprintSql),
    target.query(requestFingerprintSql),
    target.query(deviceFingerprintSql),
  ]);
  if (fingerprint(targetAfter.rows) !== targetLessonFingerprint
      || fingerprint(requestsAfter.rows) !== targetRequestFingerprint
      || fingerprint(devicesAfter.rows) !== targetDeviceFingerprint) {
    throw new Error('Neon staging changed after the atomic duplication rollback.');
  }

  await source.query('commit');
  console.log(`Compared source/target lesson row counts before duplication: ${sourceBaseline.rows.length}/${targetBaseline.rows.length}.`);
  if (fingerprint(sourceBaseline.rows) !== targetLessonFingerprint) {
    console.log('NOTICE: source and staging lesson fingerprints differ; preserve this drift for the final delta-sync plan.');
  } else {
    console.log('Source and staging lesson fingerprints match.');
  }
  console.log('Verified owner denial, Free device gate, copy lineage, and account/device quota completion in one transaction.');
  console.log('PASS: the complete Neon lesson-duplication cycle was rolled back and all staging ledgers are unchanged.');
  console.log('No owner ID, lesson ID, lesson title, lesson content, device hash, or secret was logged.');
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
