-- Publish clear customer-facing AI grading allowances while keeping
-- dollar budgets as internal circuit breakers with ample headroom.
--
-- Customer allowances:
-- Teacher Pro: 60 AI grading attempts per billing quota window.
-- School: 300 AI grading attempts per UTC calendar month, shared.
-- Campus: 750 AI grading attempts per UTC calendar month, shared.
--
-- The internal reservation is deliberately conservative at $0.10 per in-flight
-- grading request. Dollar circuit breakers are set to twice the maximum
-- reservation value implied by the public count limit, so the count allowance
-- remains the normal customer-facing boundary.

update public.billing_plans
set monthly_ai_grading_count_limit = 60,
    monthly_ai_grading_budget_usd = 12.00
where code = 'teacher_pro';

update public.billing_plans
set monthly_ai_grading_count_limit = 300,
    monthly_ai_grading_budget_usd = 60.00
where code = 'school';

update public.billing_plans
set monthly_ai_grading_count_limit = 750,
    monthly_ai_grading_budget_usd = 150.00
where code = 'campus';

create or replace function private.reserve_ai_grading_budget(p_evaluation_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
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

revoke all on function private.reserve_ai_grading_budget(uuid) from public, anon, authenticated, service_role;

drop function public.get_ai_quota();

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
  quota_window_start timestamptz,
  quota_window_end timestamptz,
  quota_source text
)
language plpgsql
security definer
set search_path = ''
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
    v_quota_source;
end;
$function$;

revoke all on function public.get_ai_quota() from public, anon, authenticated, service_role;
grant execute on function public.get_ai_quota() to authenticated, service_role;
