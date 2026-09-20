-- Shared rolling Free budget per privacy-minimal browser device.
--
-- Existing per-account Free quotas remain unchanged:
--   5 AI lessons / calendar month
--   20 AI revisions / calendar month
--   3 imports or copies / calendar month
--
-- Additional cross-account device budget:
--   10 AI lessons / rolling 30 days
--   40 AI revisions / rolling 30 days
--   6 imports or copies / rolling 30 days
--
-- The device key is SHA-256(random HttpOnly token). No IP, User-Agent,
-- browser fingerprint, hardware ID or location is stored.
--
-- IMPORTANT: Free quota reservation is moved behind service-role-only RPCs
-- so an authenticated client cannot forge a different device hash per request.

create table if not exists private.free_device_budget_devices (
  token_hash text primary key,
  first_seen_at timestamptz not null default now(),
  constraint free_device_budget_devices_hash_format
    check (token_hash ~ '^[0-9a-f]{64}$')
);

create table if not exists private.free_device_budget_requests (
  request_id uuid primary key
    references public.generation_requests(id) on delete cascade,
  device_token_hash text not null
    references private.free_device_budget_devices(token_hash) on delete cascade,
  user_id uuid not null
    references auth.users(id) on delete cascade,
  action text not null
    check (action in ('generate_lesson', 'revise_lesson', 'revise_block', 'import_lesson')),
  status text not null default 'reserved'
    check (status in ('reserved', 'succeeded', 'failed')),
  created_at timestamptz not null default now(),
  completed_at timestamptz
);

alter table private.free_device_budget_devices enable row level security;
alter table private.free_device_budget_requests enable row level security;

revoke all on table private.free_device_budget_devices
  from public, anon, authenticated, service_role;
revoke all on table private.free_device_budget_requests
  from public, anon, authenticated, service_role;

create index if not exists free_device_budget_requests_window_idx
  on private.free_device_budget_requests (
    device_token_hash,
    action,
    created_at desc
  )
  where status in ('reserved', 'succeeded');

create index if not exists free_device_budget_requests_user_idx
  on private.free_device_budget_requests (user_id);

comment on table private.free_device_budget_devices is
  'Privacy-minimal device keys used only for cross-account Free quota protection. Key is SHA-256 of a random HttpOnly browser token.';
comment on table private.free_device_budget_requests is
  'Rolling 30-day Free device-budget reservations linked 1:1 to generation_requests.';

create or replace function private.free_device_budget_required(
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
      and p.active_plan_code = 'free'
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

revoke all on function private.free_device_budget_required(uuid)
  from public, anon, authenticated, service_role;

create or replace function private.lock_free_device_budget(
  p_user_id uuid,
  p_device_token_hash text,
  p_action text
)
returns table(
  required boolean,
  allowed boolean,
  used integer,
  device_limit integer,
  denial_code text
)
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_required boolean;
  v_limit integer;
  v_used integer := 0;
begin
  if p_action not in ('generate_lesson', 'revise_lesson', 'revise_block', 'import_lesson') then
    raise exception 'invalid_free_device_budget_action' using errcode = '22023';
  end if;

  v_required := private.free_device_budget_required(p_user_id);

  if not v_required then
    return query select false, true, 0, null::integer, null::text;
    return;
  end if;

  v_limit := case
    when p_action = 'generate_lesson' then 10
    when p_action in ('revise_lesson', 'revise_block') then 40
    when p_action = 'import_lesson' then 6
    else null
  end;

  if p_device_token_hash is null
     or p_device_token_hash !~ '^[0-9a-f]{64}$' then
    return query select true, false, 0, v_limit, 'free_device_cookie_required'::text;
    return;
  end if;

  insert into private.free_device_budget_devices (token_hash)
  values (p_device_token_hash)
  on conflict (token_hash) do nothing;

  perform 1
  from private.free_device_budget_devices d
  where d.token_hash = p_device_token_hash
  for update;

  -- Keep account and device ledgers aligned if a reservation was abandoned.
  update public.generation_requests g
  set status = 'failed',
      completed_at = now()
  where g.status = 'pending'
    and g.id in (
      select b.request_id
      from private.free_device_budget_requests b
      where b.device_token_hash = p_device_token_hash
        and b.status = 'reserved'
        and b.created_at < now() - interval '10 minutes'
    );

  update private.free_device_budget_requests b
  set status = 'failed',
      completed_at = now()
  where b.device_token_hash = p_device_token_hash
    and b.status = 'reserved'
    and b.created_at < now() - interval '10 minutes';

  select count(*)::integer
  into v_used
  from private.free_device_budget_requests b
  where b.device_token_hash = p_device_token_hash
    and b.status in ('reserved', 'succeeded')
    and b.created_at >= now() - interval '30 days'
    and (
      (p_action = 'generate_lesson' and b.action = 'generate_lesson')
      or (
        p_action in ('revise_lesson', 'revise_block')
        and b.action in ('revise_lesson', 'revise_block')
      )
      or (p_action = 'import_lesson' and b.action = 'import_lesson')
    );

  if v_used >= v_limit then
    return query select true, false, v_used, v_limit, 'free_device_budget_exhausted'::text;
    return;
  end if;

  return query select true, true, v_used, v_limit, null::text;
end;
$function$;

revoke all on function private.lock_free_device_budget(uuid, text, text)
  from public, anon, authenticated, service_role;

create or replace function private.reserve_free_device_budget_request(
  p_request_id uuid,
  p_user_id uuid,
  p_device_token_hash text,
  p_action text
)
returns void
language plpgsql
security definer
set search_path = ''
as $function$
begin
  if not private.free_device_budget_required(p_user_id) then
    return;
  end if;

  if p_device_token_hash is null
     or p_device_token_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'free_device_cookie_required' using errcode = 'P0001';
  end if;

  insert into private.free_device_budget_requests (
    request_id,
    device_token_hash,
    user_id,
    action,
    status
  )
  values (
    p_request_id,
    p_device_token_hash,
    p_user_id,
    p_action,
    'reserved'
  );
end;
$function$;

revoke all on function private.reserve_free_device_budget_request(uuid, uuid, text, text)
  from public, anon, authenticated, service_role;

create or replace function private.complete_free_device_budget_request(
  p_request_id uuid,
  p_user_id uuid,
  p_status text
)
returns void
language plpgsql
security definer
set search_path = ''
as $function$
begin
  if p_status not in ('succeeded', 'failed') then
    raise exception 'invalid_free_device_budget_status' using errcode = '22023';
  end if;

  update private.free_device_budget_requests
  set status = p_status,
      completed_at = now()
  where request_id = p_request_id
    and user_id = p_user_id
    and status = 'reserved';
end;
$function$;

revoke all on function private.complete_free_device_budget_request(uuid, uuid, text)
  from public, anon, authenticated, service_role;

-- Server-only atomic reservation for lesson generation.
create or replace function public.reserve_lesson_generation_server(
  p_user_id uuid,
  p_device_token_hash text
)
returns table(
  request_id uuid,
  allowed boolean,
  used integer,
  monthly_limit integer,
  denial_code text,
  device_used integer,
  device_limit integer
)
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_org_id uuid;
  v_limit integer;
  v_used integer;
  v_request_id uuid;
  v_month_start timestamptz := date_trunc('month', now() at time zone 'UTC') at time zone 'UTC';
  v_month_end timestamptz := (date_trunc('month', now() at time zone 'UTC') + interval '1 month') at time zone 'UTC';
  v_device_required boolean := false;
  v_device_allowed boolean := true;
  v_device_used integer := 0;
  v_device_limit integer;
  v_device_denial text;
begin
  if p_user_id is null then raise exception 'user_required'; end if;

  select cao.organization_id, cao.monthly_lesson_limit
  into v_org_id, v_limit
  from private.current_active_organization(p_user_id) cao;

  if v_org_id is not null then
    perform 1 from public.organizations o where o.id = v_org_id for update;

    update public.generation_requests
    set status = 'failed', completed_at = now()
    where organization_id = v_org_id
      and status = 'pending'
      and created_at < now() - interval '10 minutes';

    select count(*)::integer into v_used
    from public.generation_requests g
    where g.organization_id = v_org_id
      and g.action = 'generate_lesson'
      and g.status in ('pending', 'succeeded')
      and g.created_at >= v_month_start
      and g.created_at < v_month_end;
  else
    select p.monthly_lesson_limit
    into v_limit
    from public.profiles p
    where p.id = p_user_id
    for update;

    if not found then raise exception 'profile_not_found'; end if;

    update public.generation_requests
    set status = 'failed', completed_at = now()
    where user_id = p_user_id
      and organization_id is null
      and status = 'pending'
      and created_at < now() - interval '10 minutes';

    select count(*)::integer into v_used
    from public.generation_requests g
    where g.user_id = p_user_id
      and g.organization_id is null
      and g.action = 'generate_lesson'
      and g.status in ('pending', 'succeeded')
      and g.created_at >= v_month_start
      and g.created_at < v_month_end;
  end if;

  if v_limit is not null and v_used >= v_limit then
    return query select
      null::uuid, false, v_used, v_limit,
      'account_quota_exhausted'::text,
      null::integer, null::integer;
    return;
  end if;

  select d.required, d.allowed, d.used, d.device_limit, d.denial_code
  into v_device_required, v_device_allowed, v_device_used, v_device_limit, v_device_denial
  from private.lock_free_device_budget(
    p_user_id,
    p_device_token_hash,
    'generate_lesson'
  ) d;

  if not v_device_allowed then
    return query select
      null::uuid, false, v_used, v_limit,
      v_device_denial,
      v_device_used, v_device_limit;
    return;
  end if;

  insert into public.generation_requests (
    user_id,
    organization_id,
    action,
    status
  )
  values (
    p_user_id,
    v_org_id,
    'generate_lesson',
    'pending'
  )
  returning id into v_request_id;

  if v_device_required then
    perform private.reserve_free_device_budget_request(
      v_request_id,
      p_user_id,
      p_device_token_hash,
      'generate_lesson'
    );
  end if;

  return query select
    v_request_id,
    true,
    v_used + 1,
    v_limit,
    null::text,
    case when v_device_required then v_device_used + 1 else null end,
    v_device_limit;
end;
$function$;

revoke all on function public.reserve_lesson_generation_server(uuid, text)
  from public, anon, authenticated;
grant execute on function public.reserve_lesson_generation_server(uuid, text)
  to service_role;

-- Server-only atomic reservation for lesson/block revisions.
create or replace function public.reserve_revision_operation_server(
  p_user_id uuid,
  p_action text,
  p_device_token_hash text
)
returns table(
  request_id uuid,
  allowed boolean,
  used integer,
  monthly_limit integer,
  denial_code text,
  device_used integer,
  device_limit integer
)
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_org_id uuid;
  v_limit integer;
  v_used integer;
  v_request_id uuid;
  v_month_start timestamptz := date_trunc('month', now() at time zone 'UTC') at time zone 'UTC';
  v_month_end timestamptz := (date_trunc('month', now() at time zone 'UTC') + interval '1 month') at time zone 'UTC';
  v_device_required boolean := false;
  v_device_allowed boolean := true;
  v_device_used integer := 0;
  v_device_limit integer;
  v_device_denial text;
begin
  if p_user_id is null then raise exception 'user_required'; end if;
  if p_action not in ('revise_lesson', 'revise_block') then
    raise exception 'invalid_revision_action';
  end if;

  select cao.organization_id, cao.monthly_revision_limit
  into v_org_id, v_limit
  from private.current_active_organization(p_user_id) cao;

  if v_org_id is not null then
    perform 1 from public.organizations o where o.id = v_org_id for update;

    update public.generation_requests
    set status = 'failed', completed_at = now()
    where organization_id = v_org_id
      and status = 'pending'
      and created_at < now() - interval '10 minutes';

    select count(*)::integer into v_used
    from public.generation_requests g
    where g.organization_id = v_org_id
      and g.action in ('revise_lesson', 'revise_block')
      and g.status in ('pending', 'succeeded')
      and g.created_at >= v_month_start
      and g.created_at < v_month_end;
  else
    select p.monthly_revision_limit
    into v_limit
    from public.profiles p
    where p.id = p_user_id
    for update;

    if not found then raise exception 'profile_not_found'; end if;

    update public.generation_requests
    set status = 'failed', completed_at = now()
    where user_id = p_user_id
      and organization_id is null
      and status = 'pending'
      and created_at < now() - interval '10 minutes';

    select count(*)::integer into v_used
    from public.generation_requests g
    where g.user_id = p_user_id
      and g.organization_id is null
      and g.action in ('revise_lesson', 'revise_block')
      and g.status in ('pending', 'succeeded')
      and g.created_at >= v_month_start
      and g.created_at < v_month_end;
  end if;

  if v_limit is not null and v_used >= v_limit then
    return query select
      null::uuid, false, v_used, v_limit,
      'account_quota_exhausted'::text,
      null::integer, null::integer;
    return;
  end if;

  select d.required, d.allowed, d.used, d.device_limit, d.denial_code
  into v_device_required, v_device_allowed, v_device_used, v_device_limit, v_device_denial
  from private.lock_free_device_budget(
    p_user_id,
    p_device_token_hash,
    p_action
  ) d;

  if not v_device_allowed then
    return query select
      null::uuid, false, v_used, v_limit,
      v_device_denial,
      v_device_used, v_device_limit;
    return;
  end if;

  insert into public.generation_requests (
    user_id,
    organization_id,
    action,
    status
  )
  values (
    p_user_id,
    v_org_id,
    p_action,
    'pending'
  )
  returning id into v_request_id;

  if v_device_required then
    perform private.reserve_free_device_budget_request(
      v_request_id,
      p_user_id,
      p_device_token_hash,
      p_action
    );
  end if;

  return query select
    v_request_id,
    true,
    v_used + 1,
    v_limit,
    null::text,
    case when v_device_required then v_device_used + 1 else null end,
    v_device_limit;
end;
$function$;

revoke all on function public.reserve_revision_operation_server(uuid, text, text)
  from public, anon, authenticated;
grant execute on function public.reserve_revision_operation_server(uuid, text, text)
  to service_role;

-- Server-only atomic reservation for Free imports/copies.
create or replace function public.reserve_lesson_import_server(
  p_user_id uuid,
  p_device_token_hash text
)
returns table(
  request_id uuid,
  allowed boolean,
  used integer,
  monthly_limit integer,
  denial_code text,
  device_used integer,
  device_limit integer
)
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_limit integer;
  v_used integer;
  v_request_id uuid;
  v_month_start timestamptz := date_trunc('month', now() at time zone 'UTC') at time zone 'UTC';
  v_month_end timestamptz := (date_trunc('month', now() at time zone 'UTC') + interval '1 month') at time zone 'UTC';
  v_device_required boolean := false;
  v_device_allowed boolean := true;
  v_device_used integer := 0;
  v_device_limit integer;
  v_device_denial text;
begin
  if p_user_id is null then raise exception 'user_required'; end if;

  if private.lesson_reuse_enabled(p_user_id) then
    return query select
      null::uuid, true, 0, null::integer,
      null::text, null::integer, null::integer;
    return;
  end if;

  select bp.monthly_import_limit
  into v_limit
  from public.billing_plans bp
  where bp.code = 'free';

  if v_limit is null then
    raise exception 'free_import_limit_not_configured';
  end if;

  perform 1
  from public.profiles p
  where p.id = p_user_id
  for update;

  if not found then raise exception 'profile_not_found'; end if;

  update public.generation_requests
  set status = 'failed', completed_at = now()
  where user_id = p_user_id
    and organization_id is null
    and action = 'import_lesson'
    and status = 'pending'
    and created_at < now() - interval '10 minutes';

  select count(*)::integer
  into v_used
  from public.generation_requests g
  where g.user_id = p_user_id
    and g.organization_id is null
    and g.action = 'import_lesson'
    and g.status in ('pending', 'succeeded')
    and g.created_at >= v_month_start
    and g.created_at < v_month_end;

  if v_used >= v_limit then
    return query select
      null::uuid, false, v_used, v_limit,
      'account_quota_exhausted'::text,
      null::integer, null::integer;
    return;
  end if;

  select d.required, d.allowed, d.used, d.device_limit, d.denial_code
  into v_device_required, v_device_allowed, v_device_used, v_device_limit, v_device_denial
  from private.lock_free_device_budget(
    p_user_id,
    p_device_token_hash,
    'import_lesson'
  ) d;

  if not v_device_allowed then
    return query select
      null::uuid, false, v_used, v_limit,
      v_device_denial,
      v_device_used, v_device_limit;
    return;
  end if;

  insert into public.generation_requests (
    user_id,
    organization_id,
    action,
    status
  )
  values (
    p_user_id,
    null,
    'import_lesson',
    'pending'
  )
  returning id into v_request_id;

  if v_device_required then
    perform private.reserve_free_device_budget_request(
      v_request_id,
      p_user_id,
      p_device_token_hash,
      'import_lesson'
    );
  end if;

  return query select
    v_request_id,
    true,
    v_used + 1,
    v_limit,
    null::text,
    case when v_device_required then v_device_used + 1 else null end,
    v_device_limit;
end;
$function$;

revoke all on function public.reserve_lesson_import_server(uuid, text)
  from public, anon, authenticated;
grant execute on function public.reserve_lesson_import_server(uuid, text)
  to service_role;

-- Finish account and device reservations together.
create or replace function public.finish_generation_request(
  p_request_id uuid,
  p_status text,
  p_cost_usd numeric default null,
  p_lesson_id uuid default null
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_user_id uuid := auth.uid();
  v_updated boolean := false;
begin
  if v_user_id is null then
    raise exception 'not_authenticated';
  end if;

  if p_status not in ('succeeded', 'failed') then
    raise exception 'invalid_generation_status';
  end if;

  update public.generation_requests
  set status = p_status,
      cost_usd = p_cost_usd,
      lesson_id = p_lesson_id,
      completed_at = now()
  where id = p_request_id
    and user_id = v_user_id
    and status = 'pending';

  v_updated := found;

  if v_updated then
    perform private.complete_free_device_budget_request(
      p_request_id,
      v_user_id,
      p_status
    );
  end if;

  return v_updated;
end;
$function$;

-- Old authenticated quota RPCs remain for paid/org backward compatibility,
-- but Free is fail-closed because a client-supplied device hash would be forgeable.
alter function public.reserve_lesson_generation()
  rename to reserve_lesson_generation_legacy;
revoke all on function public.reserve_lesson_generation_legacy()
  from public, anon, authenticated, service_role;

create function public.reserve_lesson_generation()
returns table(
  request_id uuid,
  allowed boolean,
  used integer,
  monthly_limit integer
)
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_user_id uuid := auth.uid();
begin
  if v_user_id is null then raise exception 'not_authenticated'; end if;

  if private.free_device_budget_required(v_user_id) then
    raise exception 'free_device_budget_server_required' using errcode = 'P0001';
  end if;

  return query
  select *
  from public.reserve_lesson_generation_legacy();
end;
$function$;

revoke all on function public.reserve_lesson_generation()
  from public, anon;
grant execute on function public.reserve_lesson_generation()
  to authenticated, service_role;

alter function public.reserve_revision_operation(text)
  rename to reserve_revision_operation_legacy;
revoke all on function public.reserve_revision_operation_legacy(text)
  from public, anon, authenticated, service_role;

create function public.reserve_revision_operation(p_action text)
returns table(
  request_id uuid,
  allowed boolean,
  used integer,
  monthly_limit integer
)
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_user_id uuid := auth.uid();
begin
  if v_user_id is null then raise exception 'not_authenticated'; end if;

  if private.free_device_budget_required(v_user_id) then
    raise exception 'free_device_budget_server_required' using errcode = 'P0001';
  end if;

  return query
  select *
  from public.reserve_revision_operation_legacy(p_action);
end;
$function$;

revoke all on function public.reserve_revision_operation(text)
  from public, anon;
grant execute on function public.reserve_revision_operation(text)
  to authenticated, service_role;

alter function public.reserve_lesson_import()
  rename to reserve_lesson_import_legacy;
revoke all on function public.reserve_lesson_import_legacy()
  from public, anon, authenticated, service_role;

create function public.reserve_lesson_import()
returns table(
  request_id uuid,
  allowed boolean,
  used integer,
  monthly_limit integer
)
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_user_id uuid := auth.uid();
begin
  if v_user_id is null then raise exception 'not_authenticated'; end if;

  if private.free_device_budget_required(v_user_id) then
    raise exception 'free_device_budget_server_required' using errcode = 'P0001';
  end if;

  return query
  select *
  from public.reserve_lesson_import_legacy();
end;
$function$;

revoke all on function public.reserve_lesson_import()
  from public, anon;
grant execute on function public.reserve_lesson_import()
  to authenticated, service_role;

-- Keep the old public share-import RPC compatible for paid/org users, while
-- preventing Free callers from bypassing the server-authoritative device hash.
alter function public.import_lesson_share(text)
  rename to import_lesson_share_legacy;
revoke all on function public.import_lesson_share_legacy(text)
  from public, anon, authenticated, service_role;

create function public.import_lesson_share(p_token text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_user_id uuid := auth.uid();
begin
  if v_user_id is null then
    raise exception 'Authentication required.' using errcode = '42501';
  end if;

  if private.free_device_budget_required(v_user_id) then
    raise exception 'free_device_budget_server_required' using errcode = 'P0001';
  end if;

  return public.import_lesson_share_legacy(p_token);
end;
$function$;

revoke all on function public.import_lesson_share(text)
  from public, anon;
grant execute on function public.import_lesson_share(text)
  to authenticated, service_role;

create or replace function public.import_lesson_share_server(
  p_user_id uuid,
  p_token text,
  p_device_token_hash text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_share public.lesson_shares%rowtype;
  v_lesson_id uuid;
  v_request_id uuid;
  v_reservation record;
begin
  if p_user_id is null then
    raise exception 'user_required' using errcode = '22023';
  end if;

  if p_token is null or p_token !~ '^[0-9a-f]{48}$' then
    raise exception 'Shared lesson not found.' using errcode = 'P0002';
  end if;

  select s.*
  into v_share
  from public.lesson_shares s
  where s.token = p_token
    and s.status = 'active'
    and s.organization_origin_id is null;

  if not found then
    raise exception 'Shared lesson not found.' using errcode = 'P0002';
  end if;

  select l.id
  into v_lesson_id
  from public.lessons l
  where l.owner_id = p_user_id
    and l.source_share_id = v_share.id;

  if found then
    return v_lesson_id;
  end if;

  if not private.lesson_reuse_enabled(p_user_id) then
    select *
    into v_reservation
    from public.reserve_lesson_import_server(
      p_user_id,
      p_device_token_hash
    );

    if not coalesce(v_reservation.allowed, false)
       or v_reservation.request_id is null then
      if v_reservation.denial_code = 'free_device_budget_exhausted' then
        raise exception 'free_device_budget_exhausted' using errcode = 'P0001';
      elsif v_reservation.denial_code = 'free_device_cookie_required' then
        raise exception 'free_device_cookie_required' using errcode = 'P0001';
      else
        raise exception 'free_lesson_import_quota_exhausted' using errcode = 'P0001';
      end if;
    end if;

    v_request_id := v_reservation.request_id;
  end if;

  insert into public.lessons (
    owner_id,
    title,
    source_prompt,
    lesson,
    source_share_id,
    source_lesson_id
  )
  values (
    p_user_id,
    left(coalesce(v_share.snapshot ->> 'title', 'Shared lesson'), 200),
    'Imported from a shared lesson.',
    v_share.snapshot,
    v_share.id,
    v_share.lesson_id
  )
  on conflict (owner_id, source_share_id) where source_share_id is not null
  do nothing
  returning id into v_lesson_id;

  if v_lesson_id is null then
    if v_request_id is not null then
      update public.generation_requests
      set status = 'failed',
          completed_at = now()
      where id = v_request_id
        and user_id = p_user_id
        and action = 'import_lesson'
        and status = 'pending';

      perform private.complete_free_device_budget_request(
        v_request_id,
        p_user_id,
        'failed'
      );
    end if;

    select l.id
    into v_lesson_id
    from public.lessons l
    where l.owner_id = p_user_id
      and l.source_share_id = v_share.id;

    return v_lesson_id;
  end if;

  if v_request_id is not null then
    update public.generation_requests
    set status = 'succeeded',
        lesson_id = v_lesson_id,
        cost_usd = coalesce(cost_usd, 0),
        completed_at = now()
    where id = v_request_id
      and user_id = p_user_id
      and action = 'import_lesson'
      and status = 'pending';

    perform private.complete_free_device_budget_request(
      v_request_id,
      p_user_id,
      'succeeded'
    );
  end if;

  return v_lesson_id;
end;
$function$;

revoke all on function public.import_lesson_share_server(uuid, text, text)
  from public, anon, authenticated;
grant execute on function public.import_lesson_share_server(uuid, text, text)
  to service_role;

comment on function public.reserve_lesson_generation_server(uuid, text) is
  'Service-role-only atomic account + rolling Free-device reservation for lesson generation.';
comment on function public.reserve_revision_operation_server(uuid, text, text) is
  'Service-role-only atomic account + rolling Free-device reservation for AI revisions.';
comment on function public.reserve_lesson_import_server(uuid, text) is
  'Service-role-only atomic account + rolling Free-device reservation for Free lesson imports/copies.';
