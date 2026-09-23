#!/usr/bin/env node
// Mirror Supabase's explicit grants for role `authenticated` into Neon.
// The initial import used pg_dump --no-acl, so user-scoped Data API calls lack
// the privileges they had on Supabase. Only SELECT/INSERT/UPDATE/DELETE on
// RLS-protected public tables (table or column level) and EXECUTE on public
// functions are copied. NEON_GRANT_MIRROR_MODE=rehearsal rolls back; =execute commits.
import pg from 'pg';

const mode = process.env.NEON_GRANT_MIRROR_MODE;
if (!['rehearsal', 'execute'].includes(mode)) process.exit(0);
const sourceUrl = process.env.SUPABASE_DB_URL;
const targetUrl = process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL;
if (!sourceUrl || !targetUrl || !new URL(targetUrl).hostname.endsWith('.neon.tech')) {
  console.error('grants: missing source or Neon target'); process.exit(2);
}
const sourceConnection = sourceUrl.replace(/([?&])sslmode=[^&#]*&?/, '$1').replace(/[?&]$/, '');
const src = new pg.Client({ connectionString: `${sourceConnection}${sourceConnection.includes('?') ? '&' : '?'}sslmode=no-verify`, connectionTimeoutMillis: 20_000 });
const dst = new pg.Client({ connectionString: targetUrl, connectionTimeoutMillis: 20_000 });
const ident = (v) => `"${String(v).replaceAll('"', '""')}"`;
const PRIVS = ['SELECT', 'INSERT', 'UPDATE', 'DELETE'];

try {
  await src.connect(); await dst.connect();
  await src.query('begin read only');
  const tables = (await src.query(`
    select c.relname as t, a.privilege_type as p
    from pg_class c join pg_namespace n on n.oid = c.relnamespace, aclexplode(c.relacl) a
    where n.nspname = 'public' and c.relkind in ('r', 'p', 'v')
      and a.grantee = 'authenticated'::regrole and a.privilege_type = any($1)`, [PRIVS])).rows;
  const columns = (await src.query(`
    select c.relname as t, att.attname as col, a.privilege_type as p
    from pg_attribute att join pg_class c on c.oid = att.attrelid join pg_namespace n on n.oid = c.relnamespace,
         aclexplode(att.attacl) a
    where n.nspname = 'public' and att.attnum > 0 and not att.attisdropped
      and a.grantee = 'authenticated'::regrole and a.privilege_type = any($1)`, [PRIVS])).rows;
  const functions = (await src.query(`
    select p.proname as name, oidvectortypes(p.proargtypes) as args
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace, aclexplode(p.proacl) a
    where n.nspname = 'public' and a.grantee = 'authenticated'::regrole and a.privilege_type = 'EXECUTE'`)).rows;
  await src.query('rollback');

  await dst.query('begin');
  const rls = new Map((await dst.query(`
    select c.relname, c.relrowsecurity, c.relkind from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind in ('r', 'p', 'v')`)).rows.map((r) => [r.relname, r]));
  let applied = 0; const skipped = [];
  const allowed = (t) => {
    const r = rls.get(t);
    if (!r) { skipped.push(`${t}(missing)`); return false; }
    if (r.relkind !== 'v' && !r.relrowsecurity) { skipped.push(`${t}(no RLS)`); return false; }
    if (r.relkind === 'v') { skipped.push(`${t}(view)`); return false; }
    return true;
  };
  for (const { t, p } of tables) {
    if (!allowed(t)) continue;
    await dst.query(`grant ${p} on public.${ident(t)} to authenticated`); applied += 1;
  }
  for (const { t, col, p } of columns) {
    if (!allowed(t)) continue;
    await dst.query(`grant ${p} (${ident(col)}) on public.${ident(t)} to authenticated`); applied += 1;
  }
  let fnApplied = 0;
  for (const { name, args } of functions) {
    const exists = (await dst.query(`select to_regprocedure($1) is not null as ok`, [`public.${ident(name)}(${args})`])).rows[0].ok;
    if (!exists) { skipped.push(`fn ${name}(missing)`); continue; }
    await dst.query(`grant execute on function public.${ident(name)}(${args}) to authenticated`); fnApplied += 1;
  }
  const check = (await dst.query(`
    select has_column_privilege('authenticated', 'public.profiles', 'ai_grading_enabled', 'SELECT') as profiles_ok,
           has_table_privilege('authenticated', 'public.lessons', 'TRUNCATE') as truncate_leak`)).rows[0];
  console.log(`grants source tables=${tables.length} columns=${columns.length} functions=${functions.length}`
    + ` applied_rel=${applied} applied_fn=${fnApplied} skipped=${skipped.length}`);
  if (skipped.length) console.log(`grants skipped ${[...new Set(skipped)].join(', ').slice(0, 900)}`);
  console.log(`grants check profiles.ai_grading_enabled=${check.profiles_ok} truncate=${check.truncate_leak}`);
  const ok = check.profiles_ok && !check.truncate_leak;
  if (mode === 'execute' && ok) { await dst.query('commit'); console.log('GRANTS RESULT PASS committed'); }
  else { await dst.query('rollback'); console.log(`GRANTS RESULT ${ok ? 'PASS' : 'FAIL'} rolled back (${mode})`); }
  process.exitCode = ok ? 0 : 1;
} catch (error) {
  console.error(`GRANTS RESULT FAIL ${error?.code ?? ''} ${error?.routine ?? ''}`.trim());
  try { await dst.query('rollback'); } catch {}
  process.exitCode = 1;
} finally {
  await Promise.allSettled([src.end(), dst.end()]);
}
