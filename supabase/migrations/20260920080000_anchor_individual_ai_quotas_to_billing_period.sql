-- Anchor paid individual AI quotas to the actual Stripe subscription period.
-- Free and organization shared quotas intentionally remain UTC-calendar based.

create or replace function private.individual_ai_quota_window(
  p_user_id uuid,
  p_at timestamptz default now()
)
returns table(
  window_start timestamptz,
  window_end timestamptz,
  quota_source text
)
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare
  v_role text;
  v_plan_code text;
  v_billing_period text;
  v_period_start timestamptz;
  v_period_end timestamptz;
  v_index integer;
  v_window_start timestamptz;
  v_window_end timestamptz;
begin
  if p_user_id is null or p_at is null then
    raise exception 'quota_window_user_and_time_required' using errcode = '22023';
  end if;

  select p.role, p.active_plan_code
  into v_role, v_plan_code
  from public.profiles p
  where p.id = p_user_id;

  if not found then
    raise exception 'profile_not_found' using errcode = 'P0001';
  end if;

  -- Free/manual non-Stripe profiles keep the existing UTC calendar month.
  -- Admin is unlimited, but returning a deterministic window keeps quota reads coherent.
  if v_role = 'admin' or v_plan_code not in ('teacher', 'teacher_pro') then
    v_window_start := date_trunc('month', p_at at time zone 'UTC') at time zone 'UTC';
    v_window_end := (date_trunc('month', p_at at time zone 'UTC') + interval '1 month') at time zone 'UTC';

    return query
    select v_window_start, v_window_end, 'calendar_utc'::text;
    return;
  end if;

  select
    bs.billing_period,
    bs.current_period_start,
    bs.current_period_end
  into
    v_billing_period,
    v_period_start,
    v_period_end
  from public.billing_subscriptions bs
  where bs.user_id = p_user_id
    and bs.provider = 'stripe'
    and bs.livemode = true
    and bs.plan_code = v_plan_code
    and bs.status in ('trialing', 'active', 'past_due')
    and bs.current_period_start is not null
    and bs.current_period_end is not null
  order by
    case bs.status
      when 'active' then 0
      when 'trialing' then 1
      else 2
    end,
    bs.updated_at desc
  limit 1;

  if not found then
    raise exception 'paid_quota_period_unavailable' using errcode = 'P0001';
  end if;

  if p_at < v_period_start or p_at >= v_period_end then
    raise exception 'paid_quota_period_out_of_range' using errcode = 'P0001';
  end if;

  if v_billing_period = 'monthly' then
    return query
    select v_period_start, v_period_end, 'stripe_monthly'::text;
    return;
  end if;

  if v_billing_period <> 'annual' then
    raise exception 'paid_quota_billing_period_invalid' using errcode = 'P0001';
  end if;

  select gs
  into v_index
  from generate_series(0, 11) as gs
  where (
    (
      (v_period_start at time zone 'UTC') + make_interval(months => gs)
    ) at time zone 'UTC'
  ) <= p_at
    and (
      (
        (v_period_start at time zone 'UTC') + make_interval(months => gs)
      ) at time zone 'UTC'
    ) < v_period_end
  order by gs desc
  limit 1;

  if v_index is null then
    raise exception 'annual_quota_window_unavailable' using errcode = 'P0001';
  end if;

  v_window_start := (
    (v_period_start at time zone 'UTC') + make_interval(months => v_index)
  ) at time zone 'UTC';

  v_window_end := least(
    (
      (v_period_start at time zone 'UTC') + make_interval(months => v_index + 1)
    ) at time zone 'UTC',
    v_period_end
  );

  if p_at < v_window_start or p_at >= v_window_end then
    raise exception 'annual_quota_window_out_of_range' using errcode = 'P0001';
  end if;

  return query
  select v_window_start, v_window_end, 'stripe_annual_month'::text;
end;
$function$;

revoke all on function private.individual_ai_quota_window(uuid,timestamptz)
  from public, anon, authenticated, service_role;

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
  v_window_start timestamptz;
  v_window_end timestamptz;
  v_calendar_start timestamptz := date_trunc('month', now() at time zone 'UTC') at time zone 'UTC';
  v_calendar_end timestamptz := (date_trunc('month', now() at time zone 'UTC') + interval '1 month') at time zone 'UTC';
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

    v_window_start := v_calendar_start;
    v_window_end := v_calendar_end;

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
      and g.created_at >= v_window_start
      and g.created_at < v_window_end;
  else
    select p.monthly_lesson_limit
    into v_limit
    from public.profiles p
    where p.id = p_user_id
    for update;

    if not found then raise exception 'profile_not_found'; end if;

    select q.window_start, q.window_end
    into v_window_start, v_window_end
    from private.individual_ai_quota_window(p_user_id, now()) q;

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
      and g.created_at >= v_window_start
      and g.created_at < v_window_end;
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
  v_window_start timestamptz;
  v_window_end timestamptz;
  v_calendar_start timestamptz := date_trunc('month', now() at time zone 'UTC') at time zone 'UTC';
  v_calendar_end timestamptz := (date_trunc('month', now() at time zone 'UTC') + interval '1 month') at time zone 'UTC';
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

    v_window_start := v_calendar_start;
    v_window_end := v_calendar_end;

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
      and g.created_at >= v_window_start
      and g.created_at < v_window_end;
  else
    select p.monthly_revision_limit
    into v_limit
    from public.profiles p
    where p.id = p_user_id
    for update;

    if not found then raise exception 'profile_not_found'; end if;

    select q.window_start, q.window_end
    into v_window_start, v_window_end
    from private.individual_ai_quota_window(p_user_id, now()) q;

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
      and g.created_at >= v_window_start
      and g.created_at < v_window_end;
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

create or replace function public.get_ai_quota()
returns table(
  lesson_used integer,
  lesson_limit integer,
  lesson_remaining integer,
  revision_used integer,
  revision_limit integer,
  revision_remaining integer,
  lesson_unlimited boolean,
  revision_unlimited boolean
)
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_user_id uuid := auth.uid();
  v_org_id uuid;
  v_lesson_limit integer;
  v_revision_limit integer;
  v_lesson_used integer;
  v_revision_used integer;
  v_window_start timestamptz;
  v_window_end timestamptz;
begin
  if v_user_id is null then raise exception 'not_authenticated'; end if;

  select cao.organization_id, cao.monthly_lesson_limit, cao.monthly_revision_limit
  into v_org_id, v_lesson_limit, v_revision_limit
  from private.current_active_organization(v_user_id) cao;

  if v_org_id is not null then
    v_window_start := date_trunc('month', now() at time zone 'UTC') at time zone 'UTC';
    v_window_end := (date_trunc('month', now() at time zone 'UTC') + interval '1 month') at time zone 'UTC';

    select count(*)::integer into v_lesson_used
    from public.generation_requests g
    where g.organization_id = v_org_id
      and g.action = 'generate_lesson'
      and g.status in ('pending', 'succeeded')
      and g.created_at >= v_window_start and g.created_at < v_window_end;

    select count(*)::integer into v_revision_used
    from public.generation_requests g
    where g.organization_id = v_org_id
      and g.action in ('revise_lesson', 'revise_block')
      and g.status in ('pending', 'succeeded')
      and g.created_at >= v_window_start and g.created_at < v_window_end;
  else
    select p.monthly_lesson_limit, p.monthly_revision_limit
    into v_lesson_limit, v_revision_limit
    from public.profiles p
    where p.id = v_user_id;

    if not found then raise exception 'profile_not_found'; end if;

    select q.window_start, q.window_end
    into v_window_start, v_window_end
    from private.individual_ai_quota_window(v_user_id, now()) q;

    select count(*)::integer into v_lesson_used
    from public.generation_requests g
    where g.user_id = v_user_id
      and g.organization_id is null
      and g.action = 'generate_lesson'
      and g.status in ('pending', 'succeeded')
      and g.created_at >= v_window_start and g.created_at < v_window_end;

    select count(*)::integer into v_revision_used
    from public.generation_requests g
    where g.user_id = v_user_id
      and g.organization_id is null
      and g.action in ('revise_lesson', 'revise_block')
      and g.status in ('pending', 'succeeded')
      and g.created_at >= v_window_start and g.created_at < v_window_end;
  end if;

  return query select
    v_lesson_used,
    v_lesson_limit,
    case when v_lesson_limit is null then null else greatest(v_lesson_limit - v_lesson_used, 0) end,
    v_revision_used,
    v_revision_limit,
    case when v_revision_limit is null then null else greatest(v_revision_limit - v_revision_used, 0) end,
    v_lesson_limit is null,
    v_revision_limit is null;
end;
$function$;

-- Retire the old authenticated reservation compatibility paths.
-- Cost-bearing AI reservations must go through the service-role server RPCs above.
revoke execute on function public.reserve_lesson_generation()
  from public, anon, authenticated, service_role;
revoke execute on function public.reserve_revision_operation(text)
  from public, anon, authenticated, service_role;
