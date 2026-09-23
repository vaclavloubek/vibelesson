#!/usr/bin/env node
// Read-only probe of the Neon target for Data API compatibility (no source access).
import pg from 'pg';

const url = process.env.DATABASE_URL_UNPOOLED || process.env.NEON_DATABASE_URL_UNPOOLED || process.env.DATABASE_URL;
if (!url || !new URL(url).hostname.endsWith('.neon.tech')) { console.log('probe: no Neon target'); process.exit(0); }
const client = new pg.Client({ connectionString: url, connectionTimeoutMillis: 20_000 });
await client.connect();
await client.query('begin read only');
const q = async (label, sql) => {
  try {
    const { rows } = await client.query(sql);
    for (const row of rows) console.log(`probe ${label} ${Object.values(row).map((v) => String(v).replace(/\s+/g, ' ').slice(0, 160)).join(' | ')}`);
  } catch (error) { console.log(`probe ${label} ERROR ${error.code}`); }
};
await q('auth_fn', `select p.proname, p.prolang::regproc, left(pg_get_functiondef(p.oid), 160) from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'auth' order by 1`);
await q('profiles_policy', `select policyname, cmd, roles::text, left(qual, 120) from pg_policies where schemaname = 'public' and tablename = 'profiles'`);
await q('profiles_rls', `select relrowsecurity from pg_class where oid = 'public.profiles'::regclass`);
await q('authenticated_tables', `select count(*) filter (where has_table_privilege('authenticated', c.oid, 'SELECT')) as sel, count(*) as total from pg_class c join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'public' and c.relkind = 'r'`);
await q('authenticated_schema', `select has_schema_privilege('authenticated', 'public', 'USAGE')`);
await q('rpc_exec', `select p.oid::regprocedure, has_function_privilege('authenticated', p.oid, 'EXECUTE'), p.prosecdef from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname in ('get_ai_quota', 'set_ui_locale', 'set_marketing_email_consent')`);
await q('roles', `select rolname, rolcanlogin, rolbypassrls from pg_roles where rolname in ('authenticated', 'anonymous', 'anon', 'authenticator') order by 1`);
await q('members', `select r.rolname || ' <- ' || m.rolname from pg_auth_members a join pg_roles r on r.oid = a.roleid join pg_roles m on m.oid = a.member where m.rolname in ('authenticated', 'anonymous', 'authenticator')`);
await client.query('rollback');
await client.end();
