
create table if not exists private.organization_member_trusted_devices (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  token_hash text not null,
  first_trusted_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  revoked_at timestamptz,
  constraint organization_member_trusted_devices_token_format
    check (token_hash ~ '^[0-9a-f]{64}$'),
  constraint organization_member_trusted_devices_unique_token
    unique (organization_id, user_id, token_hash)
);

alter table private.organization_member_trusted_devices enable row level security;
revoke all on table private.organization_member_trusted_devices
  from public, anon, authenticated, service_role;

create index if not exists organization_member_trusted_devices_active_idx
  on private.organization_member_trusted_devices (organization_id, user_id, last_seen_at desc)
  where revoked_at is null;

create index if not exists organization_member_trusted_devices_new_30d_idx
  on private.organization_member_trusted_devices (organization_id, user_id, first_trusted_at desc);

create or replace function private.active_organization_device_policy_org(p_user_id uuid)
returns uuid
language sql
stable
security definer
set search_path = ''
as $function$
  select case
    when exists (
      select 1 from public.profiles p
      where p.id = p_user_id and p.role = 'admin'
    ) then null
    else (
      select m.organization_id
      from public.organization_memberships m
      join public.organizations o on o.id = m.organization_id
      where m.user_id = p_user_id
        and m.status = 'active'
        and m.revoked_at is null
        and o.status = 'active'
      limit 1
    )
  end;
$function$;

revoke all on function private.active_organization_device_policy_org(uuid)
  from public, anon, authenticated, service_role;

create or replace function private.trusted_device_hash_valid(
  p_user_id uuid,
  p_token_hash text
)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare
  v_org_id uuid;
begin
  if not exists (select 1 from public.profiles p where p.id = p_user_id) then
    return false;
  end if;

  if exists (
    select 1 from public.profiles p
    where p.id = p_user_id and p.role = 'admin'
  ) then
    return true;
  end if;

  v_org_id := private.active_organization_device_policy_org(p_user_id);

  if v_org_id is not null then
    return coalesce(p_token_hash ~ '^[0-9a-f]{64}$', false)
      and exists (
        select 1
        from private.organization_member_trusted_devices d
        where d.organization_id = v_org_id
          and d.user_id = p_user_id
          and d.token_hash = p_token_hash
          and d.revoked_at is null
      );
  end if;

  if private.personal_trusted_device_policy_required(p_user_id) then
    return coalesce(p_token_hash ~ '^[0-9a-f]{64}$', false)
      and exists (
        select 1
        from private.user_trusted_devices d
        where d.user_id = p_user_id
          and d.token_hash = p_token_hash
          and d.revoked_at is null
      );
  end if;

  return true;
end;
$function$;

revoke all on function private.trusted_device_hash_valid(uuid, text)
  from public, anon, authenticated, service_role;

create or replace function public.register_trusted_device_server(
  p_user_id uuid,
  p_token_hash text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_org_id uuid;
  v_existing private.organization_member_trusted_devices%rowtype;
  v_existing_found boolean := false;
  v_active_count integer := 0;
  v_new_30d integer := 0;
  v_personal jsonb;
begin
  perform 1 from public.profiles p where p.id = p_user_id for update;
  if not found then
    return jsonb_build_object(
      'required', false, 'trusted', false, 'scope', 'none',
      'code', 'profile_not_found', 'activeCount', 0, 'maxActive', 0,
      'newIn30Days', 0, 'maxNewIn30Days', 0
    );
  end if;

  if exists (
    select 1 from public.profiles p
    where p.id = p_user_id and p.role = 'admin'
  ) then
    return jsonb_build_object(
      'required', false, 'trusted', true, 'scope', 'none',
      'code', null, 'activeCount', 0, 'maxActive', 0,
      'newIn30Days', 0, 'maxNewIn30Days', 0
    );
  end if;

  v_org_id := private.active_organization_device_policy_org(p_user_id);

  if v_org_id is null then
    if private.personal_trusted_device_policy_required(p_user_id) then
      v_personal := public.register_personal_trusted_device(p_user_id, p_token_hash);
      return v_personal || jsonb_build_object('scope', 'personal', 'organizationId', null);
    end if;

    return jsonb_build_object(
      'required', false, 'trusted', true, 'scope', 'none',
      'organizationId', null, 'code', null, 'activeCount', 0,
      'maxActive', 0, 'newIn30Days', 0, 'maxNewIn30Days', 0
    );
  end if;

  if p_token_hash is null or p_token_hash !~ '^[0-9a-f]{64}$' then
    select count(*)::integer into v_active_count
    from private.organization_member_trusted_devices d
    where d.organization_id = v_org_id
      and d.user_id = p_user_id
      and d.revoked_at is null;

    select count(*)::integer into v_new_30d
    from private.organization_member_trusted_devices d
    where d.organization_id = v_org_id
      and d.user_id = p_user_id
      and d.first_trusted_at >= now() - interval '30 days';

    return jsonb_build_object(
      'required', true, 'trusted', false, 'scope', 'organization',
      'organizationId', v_org_id, 'code', 'trusted_device_cookie_missing',
      'activeCount', v_active_count, 'maxActive', 5,
      'newIn30Days', v_new_30d, 'maxNewIn30Days', 10
    );
  end if;

  select d.* into v_existing
  from private.organization_member_trusted_devices d
  where d.organization_id = v_org_id
    and d.user_id = p_user_id
    and d.token_hash = p_token_hash
  for update;
  v_existing_found := found;

  select count(*)::integer into v_active_count
  from private.organization_member_trusted_devices d
  where d.organization_id = v_org_id
    and d.user_id = p_user_id
    and d.revoked_at is null;

  select count(*)::integer into v_new_30d
  from private.organization_member_trusted_devices d
  where d.organization_id = v_org_id
    and d.user_id = p_user_id
    and d.first_trusted_at >= now() - interval '30 days';

  if v_existing_found and v_existing.revoked_at is null then
    update private.organization_member_trusted_devices
    set last_seen_at = now()
    where id = v_existing.id;

    return jsonb_build_object(
      'required', true, 'trusted', true, 'scope', 'organization',
      'organizationId', v_org_id, 'code', null, 'deviceId', v_existing.id,
      'activeCount', v_active_count, 'maxActive', 5,
      'newIn30Days', v_new_30d, 'maxNewIn30Days', 10
    );
  end if;

  if v_active_count >= 5 then
    return jsonb_build_object(
      'required', true, 'trusted', false, 'scope', 'organization',
      'organizationId', v_org_id, 'code', 'trusted_device_limit_reached',
      'activeCount', v_active_count, 'maxActive', 5,
      'newIn30Days', v_new_30d, 'maxNewIn30Days', 10
    );
  end if;

  if v_existing_found then
    update private.organization_member_trusted_devices
    set revoked_at = null, last_seen_at = now()
    where id = v_existing.id;

    return jsonb_build_object(
      'required', true, 'trusted', true, 'scope', 'organization',
      'organizationId', v_org_id, 'code', null, 'deviceId', v_existing.id,
      'activeCount', v_active_count + 1, 'maxActive', 5,
      'newIn30Days', v_new_30d, 'maxNewIn30Days', 10
    );
  end if;

  if v_new_30d >= 10 then
    return jsonb_build_object(
      'required', true, 'trusted', false, 'scope', 'organization',
      'organizationId', v_org_id, 'code', 'trusted_device_rotation_limit_reached',
      'activeCount', v_active_count, 'maxActive', 5,
      'newIn30Days', v_new_30d, 'maxNewIn30Days', 10
    );
  end if;

  insert into private.organization_member_trusted_devices (
    organization_id, user_id, token_hash
  )
  values (v_org_id, p_user_id, p_token_hash)
  returning * into v_existing;

  return jsonb_build_object(
    'required', true, 'trusted', true, 'scope', 'organization',
    'organizationId', v_org_id, 'code', null, 'deviceId', v_existing.id,
    'activeCount', v_active_count + 1, 'maxActive', 5,
    'newIn30Days', v_new_30d + 1, 'maxNewIn30Days', 10
  );
end;
$function$;

revoke all on function public.register_trusted_device_server(uuid, text)
  from public, anon, authenticated;
grant execute on function public.register_trusted_device_server(uuid, text)
  to service_role;

create or replace function public.list_trusted_devices_server(
  p_user_id uuid,
  p_current_token_hash text
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare
  v_org_id uuid;
  v_personal jsonb;
  v_active_count integer := 0;
  v_new_30d integer := 0;
  v_devices jsonb := '[]'::jsonb;
begin
  if exists (
    select 1 from public.profiles p
    where p.id = p_user_id and p.role = 'admin'
  ) then
    return jsonb_build_object(
      'required', false, 'scope', 'none', 'organizationId', null,
      'activeCount', 0, 'maxActive', 0, 'newIn30Days', 0,
      'maxNewIn30Days', 0, 'currentTrusted', true, 'devices', '[]'::jsonb
    );
  end if;

  v_org_id := private.active_organization_device_policy_org(p_user_id);

  if v_org_id is null then
    if private.personal_trusted_device_policy_required(p_user_id) then
      v_personal := public.list_personal_trusted_devices(p_user_id, p_current_token_hash);
      return v_personal || jsonb_build_object('scope', 'personal', 'organizationId', null);
    end if;

    return jsonb_build_object(
      'required', false, 'scope', 'none', 'organizationId', null,
      'activeCount', 0, 'maxActive', 0, 'newIn30Days', 0,
      'maxNewIn30Days', 0, 'currentTrusted', true, 'devices', '[]'::jsonb
    );
  end if;

  select count(*)::integer into v_active_count
  from private.organization_member_trusted_devices d
  where d.organization_id = v_org_id
    and d.user_id = p_user_id
    and d.revoked_at is null;

  select count(*)::integer into v_new_30d
  from private.organization_member_trusted_devices d
  where d.organization_id = v_org_id
    and d.user_id = p_user_id
    and d.first_trusted_at >= now() - interval '30 days';

  select coalesce(jsonb_agg(
    jsonb_build_object(
      'id', x.id,
      'firstTrustedAt', x.first_trusted_at,
      'lastSeenAt', x.last_seen_at,
      'current', x.token_hash = p_current_token_hash
    )
    order by (x.token_hash = p_current_token_hash) desc, x.last_seen_at desc, x.id
  ), '[]'::jsonb)
  into v_devices
  from private.organization_member_trusted_devices x
  where x.organization_id = v_org_id
    and x.user_id = p_user_id
    and x.revoked_at is null;

  return jsonb_build_object(
    'required', true, 'scope', 'organization', 'organizationId', v_org_id,
    'activeCount', v_active_count, 'maxActive', 5,
    'newIn30Days', v_new_30d, 'maxNewIn30Days', 10,
    'currentTrusted', exists (
      select 1
      from private.organization_member_trusted_devices d
      where d.organization_id = v_org_id
        and d.user_id = p_user_id
        and d.token_hash = p_current_token_hash
        and d.revoked_at is null
    ),
    'devices', v_devices
  );
end;
$function$;

revoke all on function public.list_trusted_devices_server(uuid, text)
  from public, anon, authenticated;
grant execute on function public.list_trusted_devices_server(uuid, text)
  to service_role;

create or replace function public.revoke_trusted_device_server(
  p_user_id uuid,
  p_device_id uuid,
  p_current_token_hash text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_org_id uuid;
  v_device private.organization_member_trusted_devices%rowtype;
begin
  perform 1 from public.profiles p where p.id = p_user_id for update;

  v_org_id := private.active_organization_device_policy_org(p_user_id);

  if v_org_id is null then
    if private.personal_trusted_device_policy_required(p_user_id) then
      return public.revoke_personal_trusted_device(
        p_user_id, p_device_id, p_current_token_hash
      );
    end if;
    return jsonb_build_object('revoked', false, 'code', 'trusted_device_not_found');
  end if;

  select d.* into v_device
  from private.organization_member_trusted_devices d
  where d.id = p_device_id
    and d.organization_id = v_org_id
    and d.user_id = p_user_id
    and d.revoked_at is null
  for update;

  if not found then
    return jsonb_build_object('revoked', false, 'code', 'trusted_device_not_found');
  end if;

  if p_current_token_hash is not null
     and v_device.token_hash = p_current_token_hash then
    return jsonb_build_object('revoked', false, 'code', 'cannot_revoke_current_device');
  end if;

  update private.organization_member_trusted_devices
  set revoked_at = now()
  where id = v_device.id;

  return jsonb_build_object('revoked', true, 'code', null);
end;
$function$;

revoke all on function public.revoke_trusted_device_server(uuid, uuid, text)
  from public, anon, authenticated;
grant execute on function public.revoke_trusted_device_server(uuid, uuid, text)
  to service_role;

create or replace function public.get_organization_member_device_usage_server(
  p_actor_id uuid,
  p_organization_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare
  v_rows jsonb;
begin
  if not exists (
    select 1
    from public.organization_memberships m
    join public.organizations o on o.id = m.organization_id
    where m.organization_id = p_organization_id
      and m.user_id = p_actor_id
      and m.status = 'active'
      and m.revoked_at is null
      and m.role in ('owner', 'admin')
      and o.status = 'active'
  ) then
    raise exception 'organization_admin_required' using errcode = '42501';
  end if;

  select coalesce(jsonb_agg(
    jsonb_build_object(
      'userId', m.user_id,
      'activeCount', (
        select count(*)::integer
        from private.organization_member_trusted_devices d
        where d.organization_id = p_organization_id
          and d.user_id = m.user_id
          and d.revoked_at is null
      ),
      'maxActive', 5,
      'newIn30Days', (
        select count(*)::integer
        from private.organization_member_trusted_devices d
        where d.organization_id = p_organization_id
          and d.user_id = m.user_id
          and d.first_trusted_at >= now() - interval '30 days'
      ),
      'maxNewIn30Days', 10
    )
    order by m.joined_at, m.user_id
  ), '[]'::jsonb)
  into v_rows
  from public.organization_memberships m
  where m.organization_id = p_organization_id
    and m.status = 'active'
    and m.revoked_at is null;

  return v_rows;
end;
$function$;

revoke all on function public.get_organization_member_device_usage_server(uuid, uuid)
  from public, anon, authenticated;
grant execute on function public.get_organization_member_device_usage_server(uuid, uuid)
  to service_role;

create or replace function public.reset_organization_member_devices_server(
  p_actor_id uuid,
  p_organization_id uuid,
  p_member_user_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_target_role text;
  v_revoked integer := 0;
  v_new_30d integer := 0;
begin
  if not exists (
    select 1
    from public.organization_memberships m
    join public.organizations o on o.id = m.organization_id
    where m.organization_id = p_organization_id
      and m.user_id = p_actor_id
      and m.status = 'active'
      and m.revoked_at is null
      and m.role in ('owner', 'admin')
      and o.status = 'active'
  ) then
    raise exception 'organization_admin_required' using errcode = '42501';
  end if;

  select m.role into v_target_role
  from public.organization_memberships m
  where m.organization_id = p_organization_id
    and m.user_id = p_member_user_id
    and m.status = 'active'
    and m.revoked_at is null
  for update;

  if not found then
    raise exception 'organization_member_not_found' using errcode = 'P0002';
  end if;

  if v_target_role = 'owner' then
    raise exception 'owner_device_reset_locked' using errcode = '42501';
  end if;

  update private.organization_member_trusted_devices d
  set revoked_at = now()
  where d.organization_id = p_organization_id
    and d.user_id = p_member_user_id
    and d.revoked_at is null;

  get diagnostics v_revoked = row_count;

  select count(*)::integer into v_new_30d
  from private.organization_member_trusted_devices d
  where d.organization_id = p_organization_id
    and d.user_id = p_member_user_id
    and d.first_trusted_at >= now() - interval '30 days';

  return jsonb_build_object(
    'reset', true, 'revokedCount', v_revoked,
    'newIn30Days', v_new_30d, 'maxNewIn30Days', 10
  );
end;
$function$;

revoke all on function public.reset_organization_member_devices_server(uuid, uuid, uuid)
  from public, anon, authenticated;
grant execute on function public.reset_organization_member_devices_server(uuid, uuid, uuid)
  to service_role;
