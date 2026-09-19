-- Trusted-device policy for individual paid Teacher / Teacher Pro accounts.
--
-- Product rule:
--   * individual paid account: max 3 simultaneously trusted devices
--   * max 5 genuinely new device tokens in a rolling 30-day window
--   * returning with the same known device token does not count as a new device
--   * Free, active organization members and internal Syllonaut admins are exempt
--   * no IP address, User-Agent, hardware/browser fingerprint or location is stored
--
-- The browser receives a random HttpOnly token. Only its SHA-256 hash is persisted.

create table if not exists private.user_trusted_devices (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  token_hash text not null,
  first_trusted_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  revoked_at timestamptz,
  constraint user_trusted_devices_token_hash_format
    check (token_hash ~ '^[0-9a-f]{64}$'),
  constraint user_trusted_devices_user_token_unique
    unique (user_id, token_hash)
);

alter table private.user_trusted_devices enable row level security;
revoke all on table private.user_trusted_devices
  from public, anon, authenticated, service_role;

create index if not exists user_trusted_devices_active_idx
  on private.user_trusted_devices (user_id, last_seen_at desc)
  where revoked_at is null;

create index if not exists user_trusted_devices_new_window_idx
  on private.user_trusted_devices (user_id, first_trusted_at desc);

comment on table private.user_trusted_devices is
  'Privacy-minimal trusted-device ledger for individual paid accounts. Stores only a random token hash and timestamps; never IP/User-Agent/fingerprint/location.';

create or replace function private.personal_trusted_device_policy_required(
  p_user_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $function$
  select coalesce((
    select
      p.role <> 'admin'
      and p.active_plan_code in ('teacher', 'teacher_pro')
      and not exists (
        select 1
        from public.organization_memberships m
        join public.organizations o on o.id = m.organization_id
        where m.user_id = p.id
          and m.status = 'active'
          and m.revoked_at is null
          and o.status = 'active'
      )
    from public.profiles p
    where p.id = p_user_id
  ), false);
$function$;

revoke all on function private.personal_trusted_device_policy_required(uuid)
  from public, anon, authenticated, service_role;

create or replace function public.register_personal_trusted_device(
  p_user_id uuid,
  p_token_hash text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_required boolean;
  v_existing private.user_trusted_devices%rowtype;
  v_existing_found boolean := false;
  v_active_count integer := 0;
  v_new_30d integer := 0;
begin
  -- Serialize all device mutations for one user.
  perform 1
  from public.profiles p
  where p.id = p_user_id
  for update;

  if not found then
    return jsonb_build_object(
      'required', false,
      'trusted', false,
      'code', 'profile_not_found'
    );
  end if;

  v_required := private.personal_trusted_device_policy_required(p_user_id);

  if not v_required then
    return jsonb_build_object(
      'required', false,
      'trusted', true,
      'code', null,
      'activeCount', 0,
      'maxActive', 3,
      'newIn30Days', 0,
      'maxNewIn30Days', 5
    );
  end if;

  if p_token_hash is null or p_token_hash !~ '^[0-9a-f]{64}$' then
    select count(*)::integer
    into v_active_count
    from private.user_trusted_devices d
    where d.user_id = p_user_id
      and d.revoked_at is null;

    select count(*)::integer
    into v_new_30d
    from private.user_trusted_devices d
    where d.user_id = p_user_id
      and d.first_trusted_at >= now() - interval '30 days';

    return jsonb_build_object(
      'required', true,
      'trusted', false,
      'code', 'trusted_device_cookie_missing',
      'activeCount', v_active_count,
      'maxActive', 3,
      'newIn30Days', v_new_30d,
      'maxNewIn30Days', 5
    );
  end if;

  select d.*
  into v_existing
  from private.user_trusted_devices d
  where d.user_id = p_user_id
    and d.token_hash = p_token_hash
  for update;
  v_existing_found := found;

  select count(*)::integer
  into v_active_count
  from private.user_trusted_devices d
  where d.user_id = p_user_id
    and d.revoked_at is null;

  select count(*)::integer
  into v_new_30d
  from private.user_trusted_devices d
  where d.user_id = p_user_id
    and d.first_trusted_at >= now() - interval '30 days';

  if v_existing_found and v_existing.revoked_at is null then
    update private.user_trusted_devices
    set last_seen_at = now()
    where id = v_existing.id;

    return jsonb_build_object(
      'required', true,
      'trusted', true,
      'code', null,
      'deviceId', v_existing.id,
      'activeCount', v_active_count,
      'maxActive', 3,
      'newIn30Days', v_new_30d,
      'maxNewIn30Days', 5
    );
  end if;

  if v_active_count >= 3 then
    return jsonb_build_object(
      'required', true,
      'trusted', false,
      'code', 'trusted_device_limit_reached',
      'activeCount', v_active_count,
      'maxActive', 3,
      'newIn30Days', v_new_30d,
      'maxNewIn30Days', 5
    );
  end if;

  -- Reactivating the exact same random device token is not a new device.
  if v_existing_found then
    update private.user_trusted_devices
    set revoked_at = null,
        last_seen_at = now()
    where id = v_existing.id;

    return jsonb_build_object(
      'required', true,
      'trusted', true,
      'code', null,
      'deviceId', v_existing.id,
      'activeCount', v_active_count + 1,
      'maxActive', 3,
      'newIn30Days', v_new_30d,
      'maxNewIn30Days', 5
    );
  end if;

  if v_new_30d >= 5 then
    return jsonb_build_object(
      'required', true,
      'trusted', false,
      'code', 'trusted_device_rotation_limit_reached',
      'activeCount', v_active_count,
      'maxActive', 3,
      'newIn30Days', v_new_30d,
      'maxNewIn30Days', 5
    );
  end if;

  insert into private.user_trusted_devices (
    user_id,
    token_hash
  )
  values (
    p_user_id,
    p_token_hash
  )
  returning * into v_existing;

  return jsonb_build_object(
    'required', true,
    'trusted', true,
    'code', null,
    'deviceId', v_existing.id,
    'activeCount', v_active_count + 1,
    'maxActive', 3,
    'newIn30Days', v_new_30d + 1,
    'maxNewIn30Days', 5
  );
end;
$function$;

revoke all on function public.register_personal_trusted_device(uuid, text)
  from public, anon, authenticated;
grant execute on function public.register_personal_trusted_device(uuid, text)
  to service_role;

create or replace function public.list_personal_trusted_devices(
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
  v_required boolean;
  v_active_count integer := 0;
  v_new_30d integer := 0;
  v_devices jsonb := '[]'::jsonb;
begin
  v_required := private.personal_trusted_device_policy_required(p_user_id);

  select count(*)::integer
  into v_active_count
  from private.user_trusted_devices d
  where d.user_id = p_user_id
    and d.revoked_at is null;

  select count(*)::integer
  into v_new_30d
  from private.user_trusted_devices d
  where d.user_id = p_user_id
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
  from private.user_trusted_devices x
  where x.user_id = p_user_id
    and x.revoked_at is null;

  return jsonb_build_object(
    'required', v_required,
    'activeCount', v_active_count,
    'maxActive', 3,
    'newIn30Days', v_new_30d,
    'maxNewIn30Days', 5,
    'currentTrusted', exists (
      select 1
      from private.user_trusted_devices d
      where d.user_id = p_user_id
        and d.token_hash = p_current_token_hash
        and d.revoked_at is null
    ),
    'devices', v_devices
  );
end;
$function$;

revoke all on function public.list_personal_trusted_devices(uuid, text)
  from public, anon, authenticated;
grant execute on function public.list_personal_trusted_devices(uuid, text)
  to service_role;

create or replace function public.revoke_personal_trusted_device(
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
  v_device private.user_trusted_devices%rowtype;
begin
  perform 1
  from public.profiles p
  where p.id = p_user_id
  for update;

  select d.*
  into v_device
  from private.user_trusted_devices d
  where d.id = p_device_id
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

  update private.user_trusted_devices
  set revoked_at = now()
  where id = v_device.id;

  return jsonb_build_object('revoked', true, 'code', null);
end;
$function$;

revoke all on function public.revoke_personal_trusted_device(uuid, uuid, text)
  from public, anon, authenticated;
grant execute on function public.revoke_personal_trusted_device(uuid, uuid, text)
  to service_role;

comment on function public.register_personal_trusted_device(uuid, text) is
  'Service-role boundary that atomically registers/touches a privacy-minimal trusted device for individual Teacher/Teacher Pro accounts.';
comment on function public.list_personal_trusted_devices(uuid, text) is
  'Service-role-only device-management summary; exposes timestamps and opaque row IDs, never token hashes.';
