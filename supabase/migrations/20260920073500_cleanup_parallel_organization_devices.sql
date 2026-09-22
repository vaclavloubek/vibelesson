-- Remove an empty parallel organization-device implementation that was
-- applied during the 0.9.59 rollout but never merged into main. The guard
-- makes this migration fail closed if any real device row ever appeared.
-- This is a DB-only reconciliation; canonical 0.9.59 remains the 5/10 policy.

do $guard$
declare
  v_rows integer;
begin
  select count(*)::integer
  into v_rows
  from private.organization_user_trusted_devices;

  if v_rows <> 0 then
    raise exception 'parallel_organization_device_ledger_not_empty: %', v_rows
      using errcode = 'P0001';
  end if;
end
$guard$;

drop function if exists public.register_trusted_device_access(uuid, text);
drop function if exists public.list_trusted_device_access(uuid, text);
drop function if exists public.revoke_trusted_device_access(uuid, uuid, text);
drop function if exists public.list_organization_member_device_usage(uuid, uuid);
drop function if exists public.reset_organization_member_trusted_devices(uuid, uuid, uuid);
drop function if exists private.active_trusted_device_organization(uuid);

drop table if exists private.organization_user_trusted_devices;

create index if not exists organization_member_trusted_devices_user_idx
  on private.organization_member_trusted_devices (user_id);
