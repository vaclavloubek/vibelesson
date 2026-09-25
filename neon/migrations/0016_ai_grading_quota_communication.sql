-- AI grading quota communication (phase 1, no payments).
--
-- 1. private.ai_grading_quota_notices: one row per account (individual user or
--    organization) and quota window when an AI grading suggestion is refused
--    because the allowance ran out. The app drains it into the marketing event
--    'syllonaut.grading_quota.reached'; Resend sends the email.
-- 2. private.reserve_ai_grading_budget: on refusal because of the count limit
--    or the internal cost ceiling, records the notice (on conflict do nothing).
--    Everything else is unchanged from the production definition.
-- 3. public.get_ai_quota: two extra columns at the END of the result,
--    plan_code and quota_scope ('individual' | 'organization'). The return type
--    changes, so drop + create with the grants of 20260921042019. The previous
--    app build ignores the extra keys.
-- 4. private.claim_ai_grading_quota_notices / private.finish_ai_grading_quota_notice
--    for the server drain (owner connection only).
--
-- Server-only tables and functions: the Data API roles get no privileges.
-- Apply statement by statement through run_sql_transaction (PL/pgSQL bodies).
-- After applying, refresh the Data API schema cache (get_ai_quota changed).

create table if not exists private.ai_grading_quota_notices (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null
    references public.profiles(id) on delete cascade,
  organization_id uuid
    references public.organizations(id) on delete cascade,
  window_start timestamptz not null,
  window_end timestamptz not null,
  used_count integer not null check (used_count >= 0),
  count_limit integer not null check (count_limit > 0),
  status text not null default 'pending'
    check (status in ('pending', 'sent', 'skipped', 'failed')),
  attempt_count integer not null default 0 check (attempt_count >= 0),
  last_error text,
  -- Lease for the concurrent drains (every submission schedules one), and the
  -- retry backoff after a failed attempt.
  claimed_at timestamptz,
  created_at timestamptz not null default now(),
  sent_at timestamptz,
  check (window_end > window_start),
  check ((status = 'sent') = (sent_at is not null))
);

create unique index if not exists ai_grading_quota_notices_account_window_key
  on private.ai_grading_quota_notices ((coalesce(organization_id, user_id)), window_start);

create index if not exists ai_grading_quota_notices_open_idx
  on private.ai_grading_quota_notices (created_at)
  where status in ('pending', 'failed');

alter table private.ai_grading_quota_notices enable row level security;

revoke all on table private.ai_grading_quota_notices from public;
revoke all on table private.ai_grading_quota_notices from anon, anonymous, authenticated, authenticator;

comment on table private.ai_grading_quota_notices is
  'One notice per account and AI quota window when an AI grading suggestion was refused because the allowance ran out. Drained by the app into the marketing event syllonaut.grading_quota.reached.';

create or replace function private.reserve_ai_grading_budget(p_evaluation_id uuid)
 returns boolean
 language plpgsql
 security definer
 set search_path to ''
as $function$
declare
  v_user_id uuid;
  v_role text;
  v_ai_enabled boolean;
  v_org_id uuid;
  v_plan_code text;
  v_budget numeric(12,2);
  v_count_limit integer;
  v_used_count integer;
  v_used_cost numeric(14,6);
  v_reservation numeric(12,6) := 0.100000;
  v_window_start timestamptz;
  v_window_end timestamptz;
begin
  select s.teacher_id, p.role, coalesce(p.ai_grading_enabled, false)
  into v_user_id, v_role, v_ai_enabled
  from public.response_evaluations e
  join public.sessions s on s.id = e.session_id
  join public.profiles p on p.id = s.teacher_id
  where e.id = p_evaluation_id;

  if v_user_id is null or not v_ai_enabled then
    return false;
  end if;

  if v_role = 'admin' then
    return true;
  end if;

  if private.effective_ai_billing_paused(v_user_id) then
    return false;
  end if;

  select cao.organization_id, cao.plan_code
  into v_org_id, v_plan_code
  from private.current_active_organization(v_user_id) cao;

  if v_org_id is not null then
    perform 1
    from public.organizations o
    where o.id = v_org_id
    for update;

    v_window_start := date_trunc('month', now() at time zone 'UTC') at time zone 'UTC';
    v_window_end := (date_trunc('month', now() at time zone 'UTC') + interval '1 month') at time zone 'UTC';
  else
    perform 1
    from public.profiles p
    where p.id = v_user_id
    for update;

    select coalesce(p.active_plan_code, 'free')
    into v_plan_code
    from public.profiles p
    where p.id = v_user_id;

    select q.window_start, q.window_end
    into v_window_start, v_window_end
    from private.individual_ai_quota_window(v_user_id, now()) q;
  end if;

  select bp.monthly_ai_grading_budget_usd,
         bp.monthly_ai_grading_count_limit
  into v_budget, v_count_limit
  from public.billing_plans bp
  where bp.code = v_plan_code
    and bp.ai_grading_enabled;

  if v_budget is null or v_count_limit is null then
    return false;
  end if;

  update private.ai_grading_budget_requests r
  set status = 'failed',
      completed_at = now()
  where r.status = 'reserved'
    and r.created_at < now() - interval '15 minutes'
    and (
      (v_org_id is not null and r.organization_id = v_org_id)
      or
      (v_org_id is null and r.organization_id is null and r.user_id = v_user_id)
    );

  if exists (
    select 1
    from private.ai_grading_budget_requests r
    where r.evaluation_id = p_evaluation_id
      and r.status = 'reserved'
  ) then
    return true;
  end if;

  select
    count(*)::integer,
    coalesce(sum(
      case
        when r.status = 'reserved' then r.reserved_cost_usd
        else coalesce(r.actual_cost_usd, 0)
      end
    ), 0)::numeric(14,6)
  into v_used_count, v_used_cost
  from private.ai_grading_budget_requests r
  where r.status in ('reserved', 'succeeded')
    and r.created_at >= v_window_start
    and r.created_at < v_window_end
    and (
      (v_org_id is not null and r.organization_id = v_org_id)
      or
      (v_org_id is null and r.organization_id is null and r.user_id = v_user_id)
    );

  if v_used_count >= v_count_limit
     or v_used_cost + v_reservation > v_budget then
    insert into private.ai_grading_quota_notices (
      user_id,
      organization_id,
      window_start,
      window_end,
      used_count,
      count_limit
    )
    values (
      v_user_id,
      v_org_id,
      v_window_start,
      v_window_end,
      v_used_count,
      v_count_limit
    )
    on conflict do nothing;

    return false;
  end if;

  insert into private.ai_grading_budget_requests (
    evaluation_id,
    user_id,
    organization_id,
    plan_code,
    status,
    reserved_cost_usd
  )
  values (
    p_evaluation_id,
    v_user_id,
    v_org_id,
    v_plan_code,
    'reserved',
    v_reservation
  );

  return true;
end;
$function$;

revoke all on function private.reserve_ai_grading_budget(uuid) from public;
revoke all on function private.reserve_ai_grading_budget(uuid) from anon, anonymous, authenticated, authenticator;

drop function if exists public.get_ai_quota();

create function public.get_ai_quota()
 returns table(
   lesson_used integer,
   lesson_limit integer,
   lesson_remaining integer,
   revision_used integer,
   revision_limit integer,
   revision_remaining integer,
   lesson_unlimited boolean,
   revision_unlimited boolean,
   grading_used integer,
   grading_limit integer,
   grading_remaining integer,
   grading_unlimited boolean,
   grading_enabled boolean,
   quota_window_start timestamp with time zone,
   quota_window_end timestamp with time zone,
   quota_source text,
   plan_code text,
   quota_scope text
 )
 language plpgsql
 security definer
 set search_path to ''
as $function$
declare
  v_user_id uuid := auth.uid();
  v_org_id uuid;
  v_plan_code text;
  v_lesson_limit integer;
  v_revision_limit integer;
  v_lesson_used integer;
  v_revision_used integer;
  v_grading_limit integer;
  v_grading_used integer := 0;
  v_grading_enabled boolean := false;
  v_grading_unlimited boolean := false;
  v_window_start timestamptz;
  v_window_end timestamptz;
  v_quota_source text;
begin
  if v_user_id is null then raise exception 'not_authenticated'; end if;

  select cao.organization_id, cao.plan_code, cao.monthly_lesson_limit, cao.monthly_revision_limit
  into v_org_id, v_plan_code, v_lesson_limit, v_revision_limit
  from private.current_active_organization(v_user_id) cao;

  if v_org_id is not null then
    v_window_start := date_trunc('month', now() at time zone 'UTC') at time zone 'UTC';
    v_window_end := (date_trunc('month', now() at time zone 'UTC') + interval '1 month') at time zone 'UTC';
    v_quota_source := 'calendar_utc';

    select count(*)::integer into v_lesson_used
    from public.generation_requests g
    where g.organization_id = v_org_id
      and g.action = 'generate_lesson'
      and g.status in ('pending', 'succeeded')
      and g.created_at >= v_window_start
      and g.created_at < v_window_end;

    select count(*)::integer into v_revision_used
    from public.generation_requests g
    where g.organization_id = v_org_id
      and g.action in ('revise_lesson', 'revise_block')
      and g.status in ('pending', 'succeeded')
      and g.created_at >= v_window_start
      and g.created_at < v_window_end;
  else
    select coalesce(p.active_plan_code, 'free'), p.monthly_lesson_limit, p.monthly_revision_limit
    into v_plan_code, v_lesson_limit, v_revision_limit
    from public.profiles p
    where p.id = v_user_id;

    if not found then raise exception 'profile_not_found'; end if;

    select q.window_start, q.window_end, q.quota_source
    into v_window_start, v_window_end, v_quota_source
    from private.individual_ai_quota_window(v_user_id, now()) q;

    select count(*)::integer into v_lesson_used
    from public.generation_requests g
    where g.user_id = v_user_id
      and g.organization_id is null
      and g.action = 'generate_lesson'
      and g.status in ('pending', 'succeeded')
      and g.created_at >= v_window_start
      and g.created_at < v_window_end;

    select count(*)::integer into v_revision_used
    from public.generation_requests g
    where g.user_id = v_user_id
      and g.organization_id is null
      and g.action in ('revise_lesson', 'revise_block')
      and g.status in ('pending', 'succeeded')
      and g.created_at >= v_window_start
      and g.created_at < v_window_end;
  end if;

  select bp.ai_grading_enabled, bp.monthly_ai_grading_count_limit
  into v_grading_enabled, v_grading_limit
  from public.billing_plans bp
  where bp.code = v_plan_code;

  v_grading_enabled := coalesce(v_grading_enabled, false);
  v_grading_unlimited := v_plan_code = 'admin' and v_grading_enabled;

  if v_grading_enabled and not v_grading_unlimited and v_grading_limit is not null then
    select count(*)::integer into v_grading_used
    from private.ai_grading_budget_requests r
    where r.status in ('reserved', 'succeeded')
      and r.created_at >= v_window_start
      and r.created_at < v_window_end
      and (
        (v_org_id is not null and r.organization_id = v_org_id)
        or
        (v_org_id is null and r.organization_id is null and r.user_id = v_user_id)
      );
  end if;

  return query select
    v_lesson_used,
    v_lesson_limit,
    case when v_lesson_limit is null then null else greatest(v_lesson_limit - v_lesson_used, 0) end,
    v_revision_used,
    v_revision_limit,
    case when v_revision_limit is null then null else greatest(v_revision_limit - v_revision_used, 0) end,
    v_lesson_limit is null,
    v_revision_limit is null,
    v_grading_used,
    v_grading_limit,
    case
      when not v_grading_enabled or v_grading_unlimited or v_grading_limit is null then null
      else greatest(v_grading_limit - v_grading_used, 0)
    end,
    v_grading_unlimited,
    v_grading_enabled,
    v_window_start,
    v_window_end,
    v_quota_source,
    v_plan_code,
    case when v_org_id is not null then 'organization' else 'individual' end;
end;
$function$;

revoke all on function public.get_ai_quota() from public;
revoke all on function public.get_ai_quota() from anon, anonymous, authenticated, authenticator;
grant execute on function public.get_ai_quota() to authenticated;

create or replace function private.claim_ai_grading_quota_notices(p_limit integer)
 returns table(
   id uuid,
   recipient_user_id uuid,
   organization_id uuid,
   organization_internal_test boolean,
   window_start timestamptz,
   window_end timestamptz,
   used_count integer,
   count_limit integer,
   plan_code text,
   quota_scope text,
   attempt_count integer
 )
 language sql
 set search_path to ''
as $function$
  with candidates as (
    select n.id
    from private.ai_grading_quota_notices n
    where (n.status = 'pending' or (n.status = 'failed' and n.attempt_count < 5))
      and (n.claimed_at is null or n.claimed_at < now() - interval '5 minutes')
    order by n.created_at
    limit greatest(1, least(coalesce(p_limit, 20), 20))
    for update skip locked
  ),
  claimed as (
    update private.ai_grading_quota_notices n
    set claimed_at = now(),
        attempt_count = n.attempt_count + 1
    from candidates c
    where n.id = c.id
    returning n.*
  )
  select
    c.id,
    coalesce(o.owner_user_id, c.user_id),
    c.organization_id,
    coalesce(o.is_internal_test, false),
    c.window_start,
    c.window_end,
    c.used_count,
    c.count_limit,
    coalesce(o.plan_code, p.active_plan_code, 'free'),
    case when c.organization_id is not null then 'organization' else 'individual' end,
    c.attempt_count
  from claimed c
  left join public.organizations o on o.id = c.organization_id
  left join public.profiles p on p.id = c.user_id
  order by c.created_at;
$function$;

create or replace function private.finish_ai_grading_quota_notice(
  p_notice_id uuid,
  p_status text,
  p_error text default null
)
 returns boolean
 language plpgsql
 set search_path to ''
as $function$
declare
  v_count integer;
begin
  if p_status is null or p_status not in ('sent', 'skipped', 'failed') then
    raise exception 'invalid_quota_notice_status';
  end if;

  update private.ai_grading_quota_notices n
  set status = p_status,
      last_error = case when p_status = 'sent' then null else left(nullif(btrim(p_error), ''), 500) end,
      sent_at = case when p_status = 'sent' then now() else null end,
      -- A failed attempt keeps claimed_at as the retry backoff.
      claimed_at = case when p_status = 'failed' then n.claimed_at else null end
  where n.id = p_notice_id
    and n.status in ('pending', 'failed');

  get diagnostics v_count = row_count;
  return v_count > 0;
end;
$function$;

revoke all on function private.claim_ai_grading_quota_notices(integer) from public;
revoke all on function private.claim_ai_grading_quota_notices(integer) from anon, anonymous, authenticated, authenticator;
revoke all on function private.finish_ai_grading_quota_notice(uuid, text, text) from public;
revoke all on function private.finish_ai_grading_quota_notice(uuid, text, text) from anon, anonymous, authenticated, authenticator;
