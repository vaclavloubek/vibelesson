import pg from 'pg';

const { Client } = pg;

const API_ROLES = ['anonymous', 'authenticated'];
const COMPATIBILITY_ROLES = ['anon', 'service_role', 'app_service'];
const AUDITED_ROLES = [...API_ROLES, ...COMPATIBILITY_ROLES];
const FUNCTION_SCHEMAS = ['public', 'private', 'app_identity'];

function requiredTargetUrl() {
  const candidates = [
    'DATABASE_URL_UNPOOLED',
    'NEON_DATABASE_URL_UNPOOLED',
    'NEON_DATABASE_DATABASE_URL_UNPOOLED',
    'NEON_DATABASE_URL',
    'DATABASE_URL',
  ];

  for (const name of candidates) {
    const value = process.env[name];
    if (value && value !== '[SENSITIVE]') return { name, value };
  }

  throw new Error(`Target Neon URL is unavailable; checked ${candidates.join(', ')}`);
}

function validateTargetUrl(name, value) {
  let parsed;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error(`${name} is not a valid URL`);
  }

  if (!['postgres:', 'postgresql:'].includes(parsed.protocol)) {
    throw new Error(`${name} must use a PostgreSQL URL`);
  }
  if (!parsed.hostname.toLowerCase().endsWith('.neon.tech')) {
    throw new Error(`${name} does not point to a Neon host`);
  }
}

function formatObjectName(row) {
  const args = row.arguments ? `(${row.arguments})` : '';
  return `${row.schema_name}.${row.object_name ?? row.function_name}${args}`;
}

function printItems(label, items, limit = 30) {
  if (!items.length) return;
  console.log(`\n${label} (${items.length})`);
  for (const item of items.slice(0, limit)) console.log(`- ${item}`);
  if (items.length > limit) console.log(`- … and ${items.length - limit} more`);
}

const { name: targetName, value: connectionString } = requiredTargetUrl();
validateTargetUrl(targetName, connectionString);

const client = new Client({
  connectionString,
  connectionTimeoutMillis: 15_000,
  query_timeout: 30_000,
  statement_timeout: 30_000,
  application_name: 'syllonaut-neon-security-audit',
});

let transactionStarted = false;

try {
  await client.connect();
  await client.query('begin');
  transactionStarted = true;
  await client.query('set transaction read only');
  await client.query("set local statement_timeout = '30s'");

  const versionResult = await client.query(
    "select current_setting('server_version') as version, current_database() as database",
  );

  const rolesResult = await client.query(
    `select rolname, rolcanlogin, rolsuper, rolbypassrls, rolinherit
       from pg_roles
      where rolname = any($1::text[])
      order by rolname`,
    [AUDITED_ROLES],
  );

  const tablesResult = await client.query(
    `select c.oid,
            n.nspname as schema_name,
            c.relname as object_name,
            c.relrowsecurity,
            c.relforcerowsecurity,
            (select count(*)::int from pg_policy p where p.polrelid = c.oid) as policy_count
       from pg_class c
       join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public'
        and c.relkind in ('r', 'p')
      order by c.relname`,
  );

  const tablePrivilegesResult = await client.query(
    `select c.oid,
            c.relname as object_name,
            r.rolname,
            has_table_privilege(r.oid, c.oid, 'SELECT') as can_select,
            has_table_privilege(r.oid, c.oid, 'INSERT') as can_insert,
            has_table_privilege(r.oid, c.oid, 'UPDATE') as can_update,
            has_table_privilege(r.oid, c.oid, 'DELETE') as can_delete
       from pg_class c
       join pg_namespace n on n.oid = c.relnamespace
       cross join pg_roles r
      where n.nspname = 'public'
        and c.relkind in ('r', 'p')
        and r.rolname = any($1::text[])
      order by c.relname, r.rolname`,
    [AUDITED_ROLES],
  );

  const viewsResult = await client.query(
    `select c.oid,
            n.nspname as schema_name,
            c.relname as object_name,
            c.relkind,
            coalesce(c.reloptions, array[]::text[]) as reloptions
       from pg_class c
       join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public'
        and c.relkind in ('v', 'm')
      order by c.relname`,
  );

  const viewPrivilegesResult = await client.query(
    `select c.oid,
            c.relname as object_name,
            r.rolname,
            has_table_privilege(r.oid, c.oid, 'SELECT') as can_select,
            has_table_privilege(r.oid, c.oid, 'INSERT') as can_insert,
            has_table_privilege(r.oid, c.oid, 'UPDATE') as can_update,
            has_table_privilege(r.oid, c.oid, 'DELETE') as can_delete
       from pg_class c
       join pg_namespace n on n.oid = c.relnamespace
       cross join pg_roles r
      where n.nspname = 'public'
        and c.relkind in ('v', 'm')
        and r.rolname = any($1::text[])
      order by c.relname, r.rolname`,
    [API_ROLES],
  );

  const functionsResult = await client.query(
    `select p.oid,
            n.nspname as schema_name,
            p.proname as function_name,
            pg_get_function_identity_arguments(p.oid) as arguments,
            owner.rolname as owner,
            coalesce(p.proconfig, array[]::text[]) as settings,
            pg_get_functiondef(p.oid) as definition,
            exists (
              select 1
                from aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) acl
               where acl.grantee = 0
                 and acl.privilege_type = 'EXECUTE'
            ) as public_execute
       from pg_proc p
       join pg_namespace n on n.oid = p.pronamespace
       join pg_roles owner on owner.oid = p.proowner
      where n.nspname = any($1::text[])
        and p.prosecdef
      order by n.nspname, p.proname, pg_get_function_identity_arguments(p.oid)`,
    [FUNCTION_SCHEMAS],
  );

  const functionPrivilegesResult = await client.query(
    `select p.oid,
            n.nspname as schema_name,
            p.proname as function_name,
            pg_get_function_identity_arguments(p.oid) as arguments,
            r.rolname,
            has_function_privilege(r.oid, p.oid, 'EXECUTE') as can_execute
       from pg_proc p
       join pg_namespace n on n.oid = p.pronamespace
       cross join pg_roles r
      where n.nspname = any($1::text[])
        and p.prosecdef
        and r.rolname = any($2::text[])
      order by n.nspname, p.proname, r.rolname`,
    [FUNCTION_SCHEMAS, AUDITED_ROLES],
  );

  const directFunctionGrantsResult = await client.query(
    `select p.oid,
            n.nspname as schema_name,
            p.proname as function_name,
            pg_get_function_identity_arguments(p.oid) as arguments,
            grantee.rolname,
            acl.privilege_type
       from pg_proc p
       join pg_namespace n on n.oid = p.pronamespace
       cross join lateral aclexplode(p.proacl) acl
       join pg_roles grantee on grantee.oid = acl.grantee
      where n.nspname = any($1::text[])
        and p.prosecdef
        and acl.privilege_type = 'EXECUTE'
        and grantee.rolname = any($2::text[])
      order by n.nspname, p.proname, grantee.rolname`,
    [FUNCTION_SCHEMAS, AUDITED_ROLES],
  );

  const policiesResult = await client.query(
    `select schemaname as schema_name,
            tablename as object_name,
            policyname,
            coalesce(qual, '') || ' ' || coalesce(with_check, '') as expression
       from pg_policies
      where schemaname = 'public'
      order by tablename, policyname`,
  );

  const privilegesByTable = new Map();
  for (const row of tablePrivilegesResult.rows) {
    if (!privilegesByTable.has(row.oid)) privilegesByTable.set(row.oid, []);
    privilegesByTable.get(row.oid).push(row);
  }

  const privilegesByView = new Map();
  for (const row of viewPrivilegesResult.rows) {
    if (!privilegesByView.has(row.oid)) privilegesByView.set(row.oid, []);
    privilegesByView.get(row.oid).push(row);
  }

  const privilegesByFunction = new Map();
  for (const row of functionPrivilegesResult.rows) {
    if (!privilegesByFunction.has(row.oid)) privilegesByFunction.set(row.oid, []);
    privilegesByFunction.get(row.oid).push(row);
  }

  const directGrantsByFunction = new Map();
  for (const row of directFunctionGrantsResult.rows) {
    if (!directGrantsByFunction.has(row.oid)) directGrantsByFunction.set(row.oid, []);
    directGrantsByFunction.get(row.oid).push(row);
  }

  const hardFailures = [];
  const reviews = [];
  const inventory = [];
  const blockerCounts = {
    missingRoles: 0,
    unsafeRoleAttributes: 0,
    rlsDisabled: 0,
    unsafeViews: 0,
    missingSearchPath: 0,
    publicFunctionExecute: 0,
  };

  const foundRoleNames = new Set(rolesResult.rows.map((row) => row.rolname));
  for (const roleName of AUDITED_ROLES) {
    if (!foundRoleNames.has(roleName)) {
      blockerCounts.missingRoles += 1;
      hardFailures.push(`required role is missing: ${roleName}`);
    }
  }
  for (const role of rolesResult.rows) {
    const unsafeAttributes = [];
    if (role.rolcanlogin) unsafeAttributes.push('LOGIN');
    if (role.rolsuper) unsafeAttributes.push('SUPERUSER');
    if (role.rolbypassrls) unsafeAttributes.push('BYPASSRLS');
    if (unsafeAttributes.length) {
      blockerCounts.unsafeRoleAttributes += 1;
      hardFailures.push(`role ${role.rolname} has unsafe attributes: ${unsafeAttributes.join(', ')}`);
    }
  }

  for (const table of tablesResult.rows) {
    const privileges = privilegesByTable.get(table.oid) ?? [];
    const apiPrivileges = privileges.filter((row) =>
      API_ROLES.includes(row.rolname)
      && (row.can_select || row.can_insert || row.can_update || row.can_delete));

    if (!table.relrowsecurity) {
      blockerCounts.rlsDisabled += 1;
      const suffix = apiPrivileges.length
        ? `; effective Data API access: ${apiPrivileges.map((row) => row.rolname).join(', ')}`
        : '; no effective Data API table access detected';
      hardFailures.push(`public.${table.object_name} has RLS disabled${suffix}`);
    } else if (table.policy_count === 0) {
      reviews.push(`public.${table.object_name} has RLS enabled but no policies`);
    }

    if (apiPrivileges.length) {
      inventory.push(
        `public.${table.object_name}: RLS=${table.relrowsecurity ? 'on' : 'off'}, policies=${table.policy_count}, API roles=${apiPrivileges.map((row) => row.rolname).join(', ')}`,
      );
    }
  }

  for (const view of viewsResult.rows) {
    const apiPrivileges = (privilegesByView.get(view.oid) ?? []).filter((row) =>
      row.can_select || row.can_insert || row.can_update || row.can_delete);
    if (!apiPrivileges.length) continue;

    const securityInvoker = view.relkind === 'v'
      && view.reloptions.some((option) => option === 'security_invoker=true');
    if (!securityInvoker) {
      blockerCounts.unsafeViews += 1;
      hardFailures.push(
        `public.${view.object_name} is exposed to ${apiPrivileges.map((row) => row.rolname).join(', ')} without security_invoker=true`,
      );
    }
  }

  for (const fn of functionsResult.rows) {
    const functionName = formatObjectName(fn);
    const settings = Array.isArray(fn.settings) ? fn.settings : [];
    const hasSearchPath = settings.some((setting) => setting.startsWith('search_path='));
    if (!hasSearchPath) {
      blockerCounts.missingSearchPath += 1;
      hardFailures.push(`${functionName} is SECURITY DEFINER without an explicit search_path`);
    }
    if (fn.public_execute) {
      blockerCounts.publicFunctionExecute += 1;
      hardFailures.push(`${functionName} is executable by PUBLIC`);
    }

    const directApiExecutors = (directGrantsByFunction.get(fn.oid) ?? [])
      .filter((row) => API_ROLES.includes(row.rolname))
      .map((row) => row.rolname);

    if (directApiExecutors.length) {
      const actorGuardPattern = /auth\.uid\s*\(|pg_session_jwt|request\.jwt\.claims|current_user|session_user/i;
      reviews.push(`${functionName} has direct Data API EXECUTE grants: ${directApiExecutors.join(', ')}`);
      if (!actorGuardPattern.test(fn.definition)) {
        reviews.push(`${functionName} has direct API execution and no recognizable actor guard; inspect manually`);
      }
    }
  }

  for (const policy of policiesResult.rows) {
    if (/auth\.role\s*\(/i.test(policy.expression)) {
      reviews.push(`public.${policy.object_name} policy ${policy.policyname} uses auth.role(); migrate to JWT-aware role checks`);
    }
  }

  console.log('Neon staging security audit (read-only)');
  console.log(`Database: ${versionResult.rows[0].database}; PostgreSQL ${versionResult.rows[0].version}`);
  console.log(`Public tables: ${tablesResult.rowCount}; public views/materialized views: ${viewsResult.rowCount}`);
  console.log(`Public RLS policies: ${policiesResult.rowCount}; SECURITY DEFINER functions: ${functionsResult.rowCount}`);
  console.log(
    `Blocker categories: missing roles=${blockerCounts.missingRoles}; unsafe role attributes=${blockerCounts.unsafeRoleAttributes}; RLS disabled=${blockerCounts.rlsDisabled}; unsafe views=${blockerCounts.unsafeViews}; missing search_path=${blockerCounts.missingSearchPath}; PUBLIC function EXECUTE=${blockerCounts.publicFunctionExecute}`,
  );
  const directAnonymous = directFunctionGrantsResult.rows.filter((row) => row.rolname === 'anonymous').length;
  const directAuthenticated = directFunctionGrantsResult.rows.filter((row) => row.rolname === 'authenticated').length;
  console.log(`Direct SECURITY DEFINER grants: anonymous=${directAnonymous}; authenticated=${directAuthenticated}`);
  console.log(`Hard blockers: ${hardFailures.length}; manual reviews: ${reviews.length}`);

  printItems('HARD BLOCKERS', hardFailures);
  printItems('MANUAL REVIEW', reviews);
  printItems('DATA API TABLE INVENTORY', inventory);

  if (hardFailures.length) {
    console.error('\nFAIL: security blockers remain; no database writes were performed.');
    process.exitCode = 1;
  } else {
    console.log('\nPASS: no hard security blockers found; no database writes were performed.');
  }
} catch (error) {
  const code = error && typeof error === 'object' && 'code' in error ? ` (${error.code})` : '';
  console.error(`Security audit failed${code}; credentials were not printed.`);
  process.exitCode = 1;
} finally {
  if (transactionStarted) await client.query('rollback').catch(() => {});
  await client.end().catch(() => {});
}
