-- Reduce Free entry limits to protect AI unit economics.
-- Free becomes 3 AI lesson generations / 10 AI revisions / 2 imports or copies monthly.
-- The cross-account device budget remains approximately two full Free accounts,
-- but is now derived dynamically from billing_plans instead of hardcoded numbers.

update public.billing_plans
set monthly_lesson_limit = 3,
    monthly_revision_limit = 10,
    monthly_import_limit = 2,
    updated_at = now()
where code = 'free';

-- New auth profiles are inserted before apply_profile_plan runs, so keep table
-- defaults aligned with the actual Free plan as defense in depth.
alter table public.profiles
  alter column monthly_lesson_limit set default 3;

alter table public.profiles
  alter column monthly_revision_limit set default 10;

-- Refresh existing Free profiles while preserving explicit manual overrides.
do $$
declare
  v_profile record;
begin
  for v_profile in
    select p.id
    from public.profiles p
    where p.role <> 'admin'
      and p.active_plan_code = 'free'
  loop
    perform private.apply_profile_plan(v_profile.id, 'free');
  end loop;
end;
$$;

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
  v_free_lesson_limit integer;
  v_free_revision_limit integer;
  v_free_import_limit integer;
begin
  if p_action not in ('generate_lesson', 'revise_lesson', 'revise_block', 'import_lesson') then
    raise exception 'invalid_free_device_budget_action' using errcode = '22023';
  end if;

  v_required := private.free_device_budget_required(p_user_id);

  if not v_required then
    return query select false, true, 0, null::integer, null::text;
    return;
  end if;

  select
    bp.monthly_lesson_limit,
    bp.monthly_revision_limit,
    bp.monthly_import_limit
  into
    v_free_lesson_limit,
    v_free_revision_limit,
    v_free_import_limit
  from public.billing_plans bp
  where bp.code = 'free';

  if v_free_lesson_limit is null
     or v_free_revision_limit is null
     or v_free_import_limit is null then
    raise exception 'free_device_budget_plan_limits_missing' using errcode = 'P0001';
  end if;

  -- Allow roughly two complete Free accounts on a shared browser device.
  v_limit := case
    when p_action = 'generate_lesson' then v_free_lesson_limit * 2
    when p_action in ('revise_lesson', 'revise_block') then v_free_revision_limit * 2
    when p_action = 'import_lesson' then v_free_import_limit * 2
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

comment on function private.lock_free_device_budget(uuid, text, text) is
  'Free-only rolling 30-day device budget. Limits are 2x current Free billing plan values, keeping device anti-farming aligned with product quotas.';
