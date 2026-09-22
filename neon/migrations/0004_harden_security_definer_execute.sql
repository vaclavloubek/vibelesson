-- Start from a deny-by-default execution baseline for privileged routines.
-- Client/server RPC grants are restored individually only after authorization review.

do $migration$
declare
  routine record;
  routine_owner record;
  audited_schema text;
begin
  for routine in
    select n.nspname as schema_name,
           p.proname as routine_name,
           pg_get_function_identity_arguments(p.oid) as identity_arguments
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
     where n.nspname in ('public', 'private', 'app_identity')
       and p.prosecdef
  loop
    execute format(
      'revoke execute on function %I.%I(%s) from public',
      routine.schema_name,
      routine.routine_name,
      routine.identity_arguments
    );
  end loop;

  -- PostgreSQL grants EXECUTE on new functions to PUBLIC by default. Override
  -- that default for every role that currently owns a privileged routine.
  for routine_owner in
    select distinct owner.rolname as role_name
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
      join pg_roles owner on owner.oid = p.proowner
     where n.nspname in ('public', 'private', 'app_identity')
       and p.prosecdef
  loop
    foreach audited_schema in array array['public', 'private', 'app_identity']
    loop
      execute format(
        'alter default privileges for role %I in schema %I revoke execute on functions from public',
        routine_owner.role_name,
        audited_schema
      );
    end loop;
  end loop;
end
$migration$;
