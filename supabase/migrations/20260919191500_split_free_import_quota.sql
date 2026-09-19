-- Split the Free lesson allowance into two independent quotas:
-- 5 AI-generated lessons per month (existing generation quota)
-- 3 imported or duplicated lessons per month.

alter table public.billing_plans
  add column if not exists monthly_import_limit integer;

alter table public.billing_plans
  drop constraint if exists billing_plans_monthly_import_limit_check;

alter table public.billing_plans
  add constraint billing_plans_monthly_import_limit_check
  check (monthly_import_limit is null or monthly_import_limit >= 0);

update public.billing_plans
set monthly_import_limit = case when code = 'free' then 3 else null end;

alter table public.generation_requests
  drop constraint if exists generation_requests_action_check;

alter table public.generation_requests
  add constraint generation_requests_action_check
  check (action in ('generate_lesson', 'revise_lesson', 'revise_block', 'import_lesson'));

create or replace function public.reserve_lesson_import()
returns table(
  request_id uuid,
  allowed boolean,
  used integer,
  monthly_limit integer
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_limit integer;
  v_used integer;
  v_request_id uuid;
  v_month_start timestamptz := date_trunc('month', now() at time zone 'UTC') at time zone 'UTC';
  v_month_end timestamptz := (date_trunc('month', now() at time zone 'UTC') + interval '1 month') at time zone 'UTC';
begin
  if v_user_id is null then
    raise exception 'not_authenticated';
  end if;

  if private.lesson_reuse_enabled(v_user_id) then
    return query select null::uuid, true, 0, null::integer;
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
  where p.id = v_user_id
  for update;

  if not found then
    raise exception 'profile_not_found';
  end if;

  update public.generation_requests
  set status = 'failed', completed_at = now()
  where user_id = v_user_id
    and organization_id is null
    and action = 'import_lesson'
    and status = 'pending'
    and created_at < now() - interval '10 minutes';

  select count(*)::integer
  into v_used
  from public.generation_requests g
  where g.user_id = v_user_id
    and g.organization_id is null
    and g.action = 'import_lesson'
    and g.status in ('pending', 'succeeded')
    and g.created_at >= v_month_start
    and g.created_at < v_month_end;

  if v_used >= v_limit then
    return query select null::uuid, false, v_used, v_limit;
    return;
  end if;

  insert into public.generation_requests (user_id, organization_id, action, status)
  values (v_user_id, null, 'import_lesson', 'pending')
  returning id into v_request_id;

  return query select v_request_id, true, v_used + 1, v_limit;
end;
$$;

revoke all on function public.reserve_lesson_import() from public, anon;
grant execute on function public.reserve_lesson_import() to authenticated, service_role;

create or replace function private.enforce_free_lesson_creation_quota()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_action text;
  v_request_id uuid;
  v_allowed boolean;
begin
  if v_user_id is null or new.owner_id <> v_user_id then
    return new;
  end if;

  if private.lesson_reuse_enabled(v_user_id) then
    return new;
  end if;

  v_action := case
    when new.source_share_id is not null or new.source_lesson_id is not null
      then 'import_lesson'
    else 'generate_lesson'
  end;

  select g.id
  into v_request_id
  from public.generation_requests g
  where g.user_id = v_user_id
    and g.organization_id is null
    and g.action = v_action
    and g.status = 'pending'
    and g.lesson_id is null
    and g.created_at >= now() - interval '10 minutes'
  order by g.created_at desc
  for update skip locked
  limit 1;

  if v_request_id is null then
    if v_action = 'import_lesson' then
      select r.request_id, r.allowed
      into v_request_id, v_allowed
      from public.reserve_lesson_import() r;
    else
      select r.request_id, r.allowed
      into v_request_id, v_allowed
      from public.reserve_lesson_generation() r;
    end if;

    if not coalesce(v_allowed, false) or v_request_id is null then
      if v_action = 'import_lesson' then
        raise exception 'free_lesson_import_quota_exhausted' using errcode = 'P0001';
      end if;
      raise exception 'free_lesson_quota_exhausted' using errcode = 'P0001';
    end if;
  end if;

  update public.generation_requests
  set status = 'succeeded',
      lesson_id = new.id,
      cost_usd = coalesce(cost_usd, 0),
      completed_at = now()
  where id = v_request_id
    and user_id = v_user_id
    and action = v_action
    and status = 'pending';

  if not found then
    raise exception 'free_lesson_quota_reservation_required' using errcode = 'P0001';
  end if;

  return new;
end;
$$;

create or replace function public.import_lesson_share(p_token text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_share public.lesson_shares%rowtype;
  v_lesson_id uuid;
  v_request_id uuid;
  v_allowed boolean;
begin
  if v_user_id is null then
    raise exception 'Authentication required.' using errcode = '42501';
  end if;

  if p_token is null or p_token !~ '^[0-9a-f]{48}$' then
    raise exception 'Shared lesson not found.' using errcode = 'P0002';
  end if;

  select s.*
  into v_share
  from public.lesson_shares s
  where s.token = p_token
    and s.status = 'active';

  if not found then
    raise exception 'Shared lesson not found.' using errcode = 'P0002';
  end if;

  select l.id
  into v_lesson_id
  from public.lessons l
  where l.owner_id = v_user_id
    and l.source_share_id = v_share.id;

  if found then
    return v_lesson_id;
  end if;

  if not private.lesson_reuse_enabled(v_user_id) then
    select r.request_id, r.allowed
    into v_request_id, v_allowed
    from public.reserve_lesson_import() r;

    if not coalesce(v_allowed, false) or v_request_id is null then
      raise exception 'free_lesson_import_quota_exhausted' using errcode = 'P0001';
    end if;
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
    v_user_id,
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
      set status = 'failed', completed_at = now()
      where id = v_request_id
        and user_id = v_user_id
        and action = 'import_lesson'
        and status = 'pending';
    end if;

    select l.id
    into v_lesson_id
    from public.lessons l
    where l.owner_id = v_user_id
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
      and user_id = v_user_id
      and action = 'import_lesson'
      and status = 'pending';
  end if;

  return v_lesson_id;
end;
$$;

revoke all on function public.import_lesson_share(text) from public, anon;
grant execute on function public.import_lesson_share(text) to authenticated, service_role;

comment on function public.reserve_lesson_import() is
  'Reserves one of the three monthly Free lesson import/copy slots. Paid and organization entitlements are unlimited.';
