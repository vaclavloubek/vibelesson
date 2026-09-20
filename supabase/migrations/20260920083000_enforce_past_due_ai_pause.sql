-- Phase 2: activate only after the application shows payment-state UX.
-- past_due keeps non-AI paid entitlements but blocks new variable-cost AI work.

create or replace function private.enforce_individual_ai_payment_state()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
begin
  if new.organization_id is null
     and new.action in ('generate_lesson', 'revise_lesson', 'revise_block')
     and private.individual_ai_billing_paused(new.user_id) then
    raise exception 'billing_payment_required' using errcode = 'P0001';
  end if;
  return new;
end;
$function$;

revoke all on function private.enforce_individual_ai_payment_state()
  from public, anon, authenticated, service_role;

drop trigger if exists generation_requests_enforce_ai_payment_state
  on public.generation_requests;

create trigger generation_requests_enforce_ai_payment_state
before insert on public.generation_requests
for each row execute function private.enforce_individual_ai_payment_state();

create or replace function private.dispatch_response_evaluation_job(
  p_evaluation_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_token text;
  v_hash text;
begin
  if not exists (
    select 1
    from public.response_evaluations e
    join public.sessions s on s.id = e.session_id
    join public.profiles p on p.id = s.teacher_id
    where e.id = p_evaluation_id
      and (coalesce(p.ai_grading_enabled, false) or p.role = 'admin')
      and not private.individual_ai_billing_paused(s.teacher_id)
      and (
        e.status = 'pending'
        or (e.status = 'grading' and e.updated_at < now() - interval '5 minutes')
      )
  ) then
    return false;
  end if;

  v_token := encode(extensions.gen_random_bytes(32), 'hex');
  v_hash := encode(extensions.digest(v_token, 'sha256'), 'hex');

  insert into private.grading_jobs (
    evaluation_id,
    token_hash,
    status,
    attempt_count,
    created_at,
    expires_at,
    claimed_at
  )
  values (
    p_evaluation_id,
    v_hash,
    'pending',
    1,
    now(),
    now() + interval '15 minutes',
    null
  )
  on conflict (evaluation_id) do update
  set token_hash = excluded.token_hash,
      status = 'pending',
      attempt_count = private.grading_jobs.attempt_count + 1,
      created_at = now(),
      expires_at = now() + interval '15 minutes',
      claimed_at = null;

  perform net.http_post(
    url := 'https://www.syllonaut.com/api/internal/grading/jobs',
    body := jsonb_build_object('token', v_token),
    headers := '{"Content-Type":"application/json"}'::jsonb,
    timeout_milliseconds := 5000
  );

  return true;
end;
$function$;

create or replace function private.enqueue_server_grading_job()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_user_id uuid;
begin
  if new.status <> 'pending' then
    return new;
  end if;

  if tg_op = 'UPDATE'
     and old.status = 'pending'
     and old.source_updated_at is not distinct from new.source_updated_at then
    return new;
  end if;

  select s.teacher_id
  into v_user_id
  from public.sessions s
  where s.id = new.session_id;

  if v_user_id is not null
     and private.individual_ai_billing_paused(v_user_id) then
    update public.response_evaluations
    set status = 'needs_review',
        grader_version = 'manual-payment-v1',
        error = null,
        updated_at = now()
    where id = new.id
      and status = 'pending';
    return new;
  end if;

  perform private.dispatch_response_evaluation_job(new.id);
  return new;
end;
$function$;

create or replace function private.reserve_ai_grading_budget(
  p_evaluation_id uuid
)
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
  v_reservation numeric(12,6) := 0.040000;
  v_month_start timestamptz := date_trunc('month', now() at time zone 'UTC') at time zone 'UTC';
  v_month_end timestamptz := (date_trunc('month', now() at time zone 'UTC') + interval '1 month') at time zone 'UTC';
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

  if private.individual_ai_billing_paused(v_user_id) then
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
  else
    perform 1
    from public.profiles p
    where p.id = v_user_id
    for update;

    select coalesce(p.active_plan_code, 'free')
    into v_plan_code
    from public.profiles p
    where p.id = v_user_id;
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
    and r.created_at >= v_month_start
    and r.created_at < v_month_end
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

comment on function private.individual_ai_billing_paused(uuid) is
  'True only when the effective LIVE individual Stripe subscription is past_due and no active organization/admin exemption applies.';
