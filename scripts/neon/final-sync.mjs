#!/usr/bin/env node
// Final Supabase -> Neon data synchronization for the production cutover.
//
// Replaces the *contents* of every public/private application table in the
// existing Neon branch with one consistent Supabase snapshot. Schema, grants,
// Neon-only migrations, Neon Auth passwords and sessions are left untouched;
// identities missing in Neon are added without credentials.
//
// NEON_FINAL_SYNC_MODE=rehearsal  full run inside one transaction, always ROLLBACK
// NEON_FINAL_SYNC_MODE=execute    COMMIT only when every check passes; requires
//   NEON_FINAL_SYNC_APPROVED=I_UNDERSTAND_THIS_REPLACES_NEON_APP_DATA and a
//   write-frozen source (default_transaction_read_only=on).
//
// Output contains table names, counts and PASS/FAIL only: no rows, e-mails or URLs.

import pg from 'pg';

const mode = process.env.NEON_FINAL_SYNC_MODE;
if (!['rehearsal', 'execute'].includes(mode)) {
  console.log('NEON_FINAL_SYNC_MODE is not set; nothing to do.');
  process.exit(0);
}
if (mode === 'execute'
  && process.env.NEON_FINAL_SYNC_APPROVED !== 'I_UNDERSTAND_THIS_REPLACES_NEON_APP_DATA') {
  console.error('Refusing to execute: NEON_FINAL_SYNC_APPROVED is not set to the required value.');
  process.exit(2);
}

const sourceUrl = process.env.SUPABASE_DB_URL;
const targetUrl = process.env.DATABASE_URL_UNPOOLED
  || process.env.NEON_DATABASE_URL_UNPOOLED
  || process.env.DATABASE_URL;
if (!sourceUrl || !targetUrl) {
  console.error('SUPABASE_DB_URL and an unpooled Neon URL are required.');
  process.exit(2);
}
const source = new URL(sourceUrl);
const target = new URL(targetUrl);
if (!(source.hostname.endsWith('.pooler.supabase.com') && source.port === '5432')) {
  console.error('Source must use the Supabase Session pooler on port 5432.');
  process.exit(2);
}
if (!target.hostname.endsWith('.neon.tech')) {
  console.error('Target is not a Neon database.');
  process.exit(2);
}

const endpointLabel = (value) => {
  try { return new URL(value).hostname.split('.')[0].replace(/-pooler$/, ''); } catch { return 'unset'; }
};
console.log(`mode=${mode} target_endpoint=${endpointLabel(targetUrl)}`
  + ` auth_endpoint=${endpointLabel(process.env.NEON_AUTH_BASE_URL)}`
  + ` data_api_endpoint=${endpointLabel(process.env.NEON_DATA_API_URL)}`
  + ` public_auth_endpoint=${endpointLabel(process.env.NEXT_PUBLIC_NEON_AUTH_URL)}`);

const ident = (value) => `"${String(value).replaceAll('"', '""')}"`;
const qualified = (schema, table) => `${ident(schema)}.${ident(table)}`;
const APP_SCHEMAS = ['public', 'private'];

const src = new pg.Client({ connectionString: sourceUrl, application_name: 'syllonaut-final-sync' });
const dst = new pg.Client({ connectionString: targetUrl, application_name: 'syllonaut-final-sync' });
const failures = [];
const fail = (message) => { failures.push(message); console.log(`FAIL ${message}`); };

async function listTables(client) {
  const { rows } = await client.query(`
    select n.nspname as schema, c.relname as name
    from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = any($1) and c.relkind in ('r', 'p')
    order by 1, 2`, [APP_SCHEMAS]);
  return rows.map((row) => `${row.schema}.${row.name}`);
}

async function listColumns(client, key) {
  const [schema, name] = key.split('.');
  const { rows } = await client.query(`
    select a.attname as name, a.attgenerated <> '' as generated, a.attidentity = 'a' as identity_always
    from pg_attribute a
    where a.attrelid = to_regclass($1) and a.attnum > 0 and not a.attisdropped
    order by a.attnum`, [qualified(schema, name)]);
  return rows;
}

async function fingerprint(client, key, columns) {
  const [schema, name] = key.split('.');
  const cols = columns.map(ident).join(', ');
  const { rows } = await client.query(`
    select count(*)::bigint as count, md5(coalesce(string_agg(h, '' order by h), '')) as hash
    from (select md5(to_jsonb(x)::text) h from (select ${cols} from ${qualified(schema, name)}) x) y`);
  return `${rows[0].count}:${rows[0].hash}`;
}

async function identityFingerprint(client, sql) {
  const { rows } = await client.query(`
    select count(*)::bigint as count,
           md5(coalesce(string_agg(id::text || ':' || lower(email), ',' order by id), '')) as hash
    from (${sql}) i`);
  return `${rows[0].count}:${rows[0].hash}`;
}

try {
  await src.connect();
  await dst.connect();
  for (const client of [src, dst]) await client.query(`set time zone 'UTC'`);

  const frozen = (await src.query(`select current_setting('default_transaction_read_only') as v`)).rows[0].v;
  console.log(`source_write_freeze=${frozen}`);
  if (mode === 'execute' && frozen !== 'on') {
    throw new Error('Source is not write-frozen; refusing to execute.');
  }

  await src.query('begin isolation level repeatable read read only');
  await dst.query('begin');
  await dst.query(`set local lock_timeout = '15s'`);

  const sourceTables = await listTables(src);
  const targetTables = await listTables(dst);
  const synced = sourceTables.filter((key) => targetTables.includes(key));
  const missing = sourceTables.filter((key) => !targetTables.includes(key));
  const targetOnly = targetTables.filter((key) => !sourceTables.includes(key));
  console.log(`tables source=${sourceTables.length} target=${targetTables.length} synced=${synced.length}`
    + ` target_only=${targetOnly.join(',') || 'none'}`);
  for (const key of missing) fail(`${key} missing in target`);

  // Disable triggers for the load: prefer replica mode, otherwise disable only
  // user triggers that are currently enabled and restore exactly those.
  let replicaMode = false;
  await dst.query('savepoint replica_probe');
  try {
    await dst.query(`set local session_replication_role = replica`);
    replicaMode = true;
    await dst.query('release savepoint replica_probe');
  } catch {
    await dst.query('rollback to savepoint replica_probe');
  }
  const disabledTriggers = [];
  if (!replicaMode) {
    const { rows } = await dst.query(`
      select n.nspname as schema, c.relname as table_name, t.tgname as trigger_name
      from pg_trigger t
      join pg_class c on c.oid = t.tgrelid
      join pg_namespace n on n.oid = c.relnamespace
      where not t.tgisinternal and t.tgenabled <> 'D'
        and (n.nspname || '.' || c.relname) = any($1)`, [[...synced, ...targetOnly]]);
    for (const row of rows) {
      await dst.query(`alter table ${qualified(row.schema, row.table_name)} disable trigger ${ident(row.trigger_name)}`);
      disabledTriggers.push(row);
    }
  }
  console.log(`trigger_strategy=${replicaMode ? 'session_replication_role' : `disable_user_triggers(${disabledTriggers.length})`}`);

  // Rollback material inside the branch (in addition to Neon point-in-time restore).
  const backupSchema = `migration_backup_${new Date().toISOString().replace(/\D/g, '').slice(0, 14)}`;
  await dst.query(`create schema ${ident(backupSchema)}`);
  for (const key of [...synced, ...targetOnly, 'app_identity.users']) {
    const [schema, name] = key.split('.');
    await dst.query(`create table ${qualified(backupSchema, `${schema}__${name}`)} as table ${qualified(schema, name)}`);
  }
  await dst.query(`revoke all on schema ${ident(backupSchema)} from public`);
  console.log(`backup_schema=${backupSchema}`);

  // Identities: add missing ones without credentials, align the app bridge to the source.
  const sourceUsers = (await src.query(`
    select id, email, (email_confirmed_at is not null) as email_verified,
           coalesce(raw_user_meta_data, '{}'::jsonb) as raw_user_meta_data,
           created_at, updated_at, deleted_at
    from auth.users order by id`)).rows;
  const neonOnlyAuth = (await dst.query(`
    select count(*)::int as n from neon_auth."user" where not (id = any($1::uuid[]))`,
  [sourceUsers.map((user) => user.id)])).rows[0].n;
  if (neonOnlyAuth > 0) fail(`neon_auth.user has ${neonOnlyAuth} identities that do not exist in Supabase`);
  const payload = JSON.stringify(sourceUsers);
  const insertedAuth = await dst.query(`
    insert into neon_auth."user" (id, name, email, "emailVerified", image, "createdAt", "updatedAt", role, banned)
    select u.id,
           coalesce(nullif(u.raw_user_meta_data ->> 'full_name', ''), nullif(u.raw_user_meta_data ->> 'name', ''), u.email),
           u.email, u.email_verified, nullif(u.raw_user_meta_data ->> 'avatar_url', ''),
           u.created_at, coalesce(u.updated_at, u.created_at, now()), 'user', false
    from json_to_recordset($1::json) as u(id uuid, email text, email_verified boolean,
      raw_user_meta_data jsonb, created_at timestamptz, updated_at timestamptz, deleted_at timestamptz)
    where u.deleted_at is null
    on conflict (id) do nothing`, [payload]);
  await dst.query(`
    insert into app_identity.users (id, email, email_verified, raw_user_meta_data, created_at, updated_at, deleted_at)
    select u.id, u.email, u.email_verified, u.raw_user_meta_data, u.created_at, u.updated_at, u.deleted_at
    from json_to_recordset($1::json) as u(id uuid, email text, email_verified boolean,
      raw_user_meta_data jsonb, created_at timestamptz, updated_at timestamptz, deleted_at timestamptz)
    on conflict (id) do update
    set email = excluded.email, email_verified = excluded.email_verified,
        raw_user_meta_data = excluded.raw_user_meta_data, created_at = excluded.created_at,
        updated_at = excluded.updated_at, deleted_at = excluded.deleted_at`, [payload]);
  console.log(`identities source=${sourceUsers.length} neon_auth_added=${insertedAuth.rowCount}`);

  // Insert order: parents before children (self references are checked per statement).
  const { rows: edges } = await dst.query(`
    select cn.nspname || '.' || c.relname as child, pn.nspname || '.' || p.relname as parent
    from pg_constraint k
    join pg_class c on c.oid = k.conrelid join pg_namespace cn on cn.oid = c.relnamespace
    join pg_class p on p.oid = k.confrelid join pg_namespace pn on pn.oid = p.relnamespace
    where k.contype = 'f'`);
  const order = [];
  const pending = new Set(synced);
  while (pending.size) {
    const ready = [...pending].filter((key) => !edges.some((edge) =>
      edge.child === key && edge.parent !== key && pending.has(edge.parent)));
    if (!ready.length) {
      if (!replicaMode) throw new Error(`Foreign-key cycle between: ${[...pending].join(', ')}`);
      order.push(...pending);
      break;
    }
    for (const key of ready) { order.push(key); pending.delete(key); }
  }

  await dst.query(`truncate ${[...synced, ...targetOnly].map((key) => qualified(...key.split('.'))).join(', ')}`);

  const columnsByTable = new Map();
  for (const key of order) {
    const [schema, name] = key.split('.');
    const sourceColumns = await listColumns(src, key);
    const targetColumns = await listColumns(dst, key);
    const targetByName = new Map(targetColumns.map((column) => [column.name, column]));
    const common = sourceColumns
      .filter((column) => targetByName.has(column.name) && !column.generated && !targetByName.get(column.name).generated)
      .map((column) => column.name);
    const skipped = sourceColumns.filter((column) => !targetByName.has(column.name)).map((column) => column.name);
    if (skipped.length) fail(`${key} target lacks source columns ${skipped.join(',')}`);
    columnsByTable.set(key, common);
    const cols = common.map(ident).join(', ');
    const { rows } = await src.query(
      `select coalesce(json_agg(x), '[]'::json)::text as data from (select ${cols} from ${qualified(schema, name)}) x`);
    const overriding = common.some((column) => targetByName.get(column)?.identity_always) ? 'overriding system value' : '';
    const inserted = await dst.query(`
      insert into ${qualified(schema, name)} (${cols}) ${overriding}
      select ${cols} from json_populate_recordset(null::${qualified(schema, name)}, $1::json)`, [rows[0].data]);
    console.log(`load ${key} rows=${inserted.rowCount}`);
  }

  // Sequences follow the source.
  const { rows: sequences } = await src.query(`
    select schemaname as schema, sequencename as name from pg_sequences where schemaname = any($1)`, [APP_SCHEMAS]);
  let sequencesSet = 0;
  for (const seq of sequences) {
    const exists = (await dst.query(`select to_regclass($1) is not null as ok`, [qualified(seq.schema, seq.name)])).rows[0].ok;
    if (!exists) { fail(`sequence ${seq.schema}.${seq.name} missing in target`); continue; }
    const state = (await src.query(`select last_value, is_called from ${qualified(seq.schema, seq.name)}`)).rows[0];
    await dst.query(`select setval($1::regclass, $2, $3)`, [qualified(seq.schema, seq.name), state.last_value, state.is_called]);
    sequencesSet += 1;
  }
  console.log(`sequences set=${sequencesSet}`);

  if (replicaMode) await dst.query(`set local session_replication_role = origin`);
  for (const row of disabledTriggers) {
    await dst.query(`alter table ${qualified(row.schema, row.table_name)} enable trigger ${ident(row.trigger_name)}`);
  }

  // Verification inside the same target transaction.
  let passed = 0;
  for (const key of synced) {
    const columns = columnsByTable.get(key);
    const [a, b] = [await fingerprint(src, key, columns), await fingerprint(dst, key, columns)];
    if (a === b) passed += 1;
    else fail(`${key} checksum source=${a.split(':')[0]} target=${b.split(':')[0]} rows`);
  }
  console.log(`checksums passed=${passed}/${synced.length}`);

  const sourceIdentity = await identityFingerprint(src, 'select id, email from auth.users where deleted_at is null');
  const bridgeIdentity = await identityFingerprint(dst, 'select id, email from app_identity.users where deleted_at is null');
  const authIdentity = await identityFingerprint(dst, 'select id, email from neon_auth."user"');
  if (sourceIdentity !== bridgeIdentity) fail('app_identity.users fingerprint differs from Supabase auth.users');
  if (sourceIdentity !== authIdentity) fail('neon_auth.user fingerprint differs from Supabase auth.users');
  if (sourceIdentity === bridgeIdentity && sourceIdentity === authIdentity) {
    console.log(`PASS identities ${sourceIdentity.split(':')[0]} (Supabase = app_identity = neon_auth)`);
  }

  const { rows: foreignKeys } = await dst.query(`
    select k.conname, cn.nspname as cs, c.relname as ct, pn.nspname as ps, p.relname as pt,
      array(select a.attname from unnest(k.conkey) with ordinality u(n, i)
            join pg_attribute a on a.attrelid = k.conrelid and a.attnum = u.n order by u.i) as ccols,
      array(select a.attname from unnest(k.confkey) with ordinality u(n, i)
            join pg_attribute a on a.attrelid = k.confrelid and a.attnum = u.n order by u.i) as pcols
    from pg_constraint k
    join pg_class c on c.oid = k.conrelid join pg_namespace cn on cn.oid = c.relnamespace
    join pg_class p on p.oid = k.confrelid join pg_namespace pn on pn.oid = p.relnamespace
    where k.contype = 'f' and cn.nspname = any($1)`, [APP_SCHEMAS]);
  let orphanTotal = 0;
  for (const fk of foreignKeys) {
    const notNull = fk.ccols.map((column) => `c.${ident(column)} is not null`).join(' and ');
    const match = fk.ccols.map((column, index) => `p.${ident(fk.pcols[index])} = c.${ident(column)}`).join(' and ');
    const { rows } = await dst.query(`
      select count(*)::int as n from ${qualified(fk.cs, fk.ct)} c
      where ${notNull} and not exists (select 1 from ${qualified(fk.ps, fk.pt)} p where ${match})`);
    if (rows[0].n > 0) { orphanTotal += rows[0].n; fail(`${fk.cs}.${fk.ct} ${fk.conname} has ${rows[0].n} orphan rows`); }
  }
  console.log(`foreign_keys checked=${foreignKeys.length} orphans=${orphanTotal}`);

  if (mode === 'execute' && failures.length === 0) {
    await dst.query('commit');
    console.log(`RESULT PASS committed; backup_schema=${backupSchema}`);
  } else {
    await dst.query('rollback');
    console.log(`RESULT ${failures.length ? 'FAIL' : 'PASS'} rolled back (${mode}); failures=${failures.length}`);
  }
  await src.query('rollback');
  process.exitCode = failures.length ? 1 : 0;
} catch (error) {
  try { await dst.query('rollback'); } catch {}
  try { await src.query('rollback'); } catch {}
  // PostgreSQL messages can quote key values; log only structural details.
  const detail = error?.code
    ? `pg ${error.code} ${error.table ?? ''} ${error.constraint ?? ''} ${error.routine ?? ''}`.trim()
    : (error instanceof Error && !/postgres(ql)?:\/\//.test(error.message) ? error.message.slice(0, 200) : 'error');
  console.error(`RESULT FAIL rolled back: ${detail}`);
  process.exitCode = 1;
} finally {
  await Promise.allSettled([src.end(), dst.end()]);
}
