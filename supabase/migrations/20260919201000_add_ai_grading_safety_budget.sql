-- Add a server-authoritative fair-use safety budget for AI response grading.
-- This is intentionally not a customer-facing product quota. It caps runaway
-- cost while leaving normal grading usage unaffected.
--
-- Current observed grading cost (2026-09-19):
-- avg $0.014362, p95 $0.026176, p99 $0.030383, max $0.033980.
-- Each in-flight grading attempt reserves $0.04 until its actual cost is known.

alter table public.billing_plans
  add column if not exists monthly_ai_grading_budget_usd numeric(12,2),
  add column if not exists monthly_ai_grading_count_limit integer;

alter table public.billing_plans
  drop constraint if exists billing_plans_ai_grading_budget_nonnegative,
  drop constraint if exists billing_plans_ai_grading_count_nonnegative;

alter table public.billing_plans
  add constraint billing_plans_ai_grading_budget_nonnegative
    check (monthly_ai_grading_budget_usd is null or monthly_ai_grading_budget_usd >= 0),
  add constraint billing_plans_ai_grading_count_nonnegative
    check (monthly_ai_grading_count_limit is null or monthly_ai_grading_count_limit >= 0);

update public.billing_plans
set
  monthly_ai_grading_budget_usd = case code
    when 'teacher_pro' then 8.00
    when 'school' then 75.00
    when 'campus' then 200.00
    else null
  end,
  monthly_ai_grading_count_limit = case code
    when 'teacher_pro' then 1000
    when 'school' then 7500
    when 'campus' then 20000
    else null
  end,
  updated_at = now();

comment on column public.billing_plans.monthly_ai_grading_budget_usd is
  'Internal fair-use safety budget for actual + reserved AI grading cost per UTC calendar month. Not a customer-facing quota.';
comment on column public.billing_plans.monthly_ai_grading_count_limit is
  'Internal fair-use safety ceiling for AI grading attempts per UTC calendar month. Not a customer-facing quota.';

create table if not exists private.ai_grading_budget_requests (
  id uuid primary key default gen_random_uuid(),
  evaluation_id uuid not null
    references public.response_evaluations(id) on delete cascade,
  user_id uuid not null
    references auth.users(id) on delete cascade,
  organization_id uuid
    references public.organizations(id) on delete cascade,
  plan_code text not null
    references public.billing_plans(code),
  status text not null default 'reserved'
    check (status in ('reserved', 'succeeded', 'failed')),
  reserved_cost_usd numeric(12,6) not null default 0.040000
    check (reserved_cost_usd >= 0),
  actual_cost_usd numeric(12,6)
    check (actual_cost_usd is null or actual_cost_usd >= 0),
  created_at timestamptz not null default now(),
  completed_at timestamptz,
  check (
    (status = 'reserved' and completed_at is null and actual_cost_usd is null)
    or
    (status = 'succeeded' and completed_at is not null and actual_cost_usd is not null)
    or
    (status = 'failed' and completed_at is not null)
  )
);

alter table private.ai_grading_budget_requests enable row level security;
revoke all on table private.ai_grading_budget_requests from public, anon, authenticated, service_role;

create unique index if not exists ai_grading_budget_one_reservation_per_evaluation_idx
  on private.ai_grading_budget_requests (evaluation_id)
  where status = 'reserved';

create index if not exists ai_grading_budget_personal_month_idx
  on private.ai_grading_budget_requests (user_id, created_at)
  where organization_id is null
    and status in ('reserved', 'succeeded');

create index if not exists ai_grading_budget_org_month_idx
  on private.ai_grading_budget_requests (organization_id, created_at)
  where organization_id is not null
    and status in ('reserved', 'succeeded');

comment on table private.ai_grading_budget_requests is
  'Internal reservation ledger for monthly AI grading fair-use budgets. One grading attempt reserves $0.04 and is settled to actual cost on completion.';

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

  -- Internal admin/testing accounts remain intentionally unlimited.
  if v_role = 'admin' then
    return true;
  end if;

  select cao.organization_id, cao.plan_code
  into v_org_id, v_plan_code
  from private.current_active_organization(v_user_id) cao;

  if v_org_id is not null then
    -- Serialize all organization grading reservations through one row lock.
    perform 1
    from public.organizations o
    where o.id = v_org_id
    for update;
  else
    -- Serialize all personal grading reservations through the user's profile row.
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

  -- Fail closed for any non-admin AI-enabled plan that has not explicitly
  -- configured both safety limits.
  if v_budget is null or v_count_limit is null then
    return false;
  end if;

  -- A crashed worker must not hold budget forever.
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

  -- A stale grading retry may legitimately reclaim the same evaluation.
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

revoke all on function private.reserve_ai_grading_budget(uuid)
  from public, anon, authenticated, service_role;

create or replace function private.complete_ai_grading_budget(
  p_evaluation_id uuid,
  p_cost_usd numeric,
  p_succeeded boolean
)
returns void
language plpgsql
security definer
set search_path = ''
as $function$
begin
  if p_succeeded and p_cost_usd is not null and p_cost_usd < 0 then
    raise exception 'AI grading cost must be nonnegative.' using errcode = '22023';
  end if;

  update private.ai_grading_budget_requests r
  set status = case when p_succeeded then 'succeeded' else 'failed' end,
      actual_cost_usd = case
        when p_succeeded then coalesce(p_cost_usd, r.reserved_cost_usd)
        else null
      end,
      completed_at = now()
  where r.evaluation_id = p_evaluation_id
    and r.status = 'reserved';
end;
$function$;

revoke all on function private.complete_ai_grading_budget(uuid, numeric, boolean)
  from public, anon, authenticated, service_role;

-- Browser-authenticated grading path. Lock the evaluation before reserving so
-- it cannot race the server worker and double-spend or incorrectly release a
-- shared reservation.
create or replace function public.claim_response_evaluation(p_evaluation_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_user_id uuid := auth.uid();
  v_locked_id uuid;
  v_result jsonb;
begin
  if v_user_id is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;

  select e.id
  into v_locked_id
  from public.response_evaluations e
  join public.sessions s on s.id = e.session_id
  join public.profiles p on p.id = s.teacher_id
  where e.id = p_evaluation_id
    and s.teacher_id = v_user_id
    and (coalesce(p.ai_grading_enabled, false) or p.role = 'admin')
    and (
      e.status in ('pending', 'failed')
      or (e.status = 'grading' and e.updated_at < now() - interval '5 minutes')
    )
  for update of e;

  if v_locked_id is null then
    return null;
  end if;

  if not private.reserve_ai_grading_budget(p_evaluation_id) then
    update public.response_evaluations
    set status = 'needs_review',
        grader_version = 'manual-budget-v1',
        error = null,
        updated_at = now()
    where id = p_evaluation_id;
    return null;
  end if;

  update public.response_evaluations e
  set status = 'grading',
      error = null,
      updated_at = now()
  where e.id = p_evaluation_id
  returning jsonb_build_object(
    'id', e.id,
    'session_id', e.session_id,
    'block_id', e.block_id,
    'answer_snapshot', e.answer_snapshot,
    'rubric', e.rubric,
    'max_points', e.max_points,
    'source_updated_at', e.source_updated_at,
    'grader_version', e.grader_version
  ) into v_result;

  return v_result;
end;
$function$;

revoke all on function public.claim_response_evaluation(uuid) from public, anon;
grant execute on function public.claim_response_evaluation(uuid) to authenticated;

create or replace function public.finish_response_evaluation(
  p_evaluation_id uuid,
  p_ai_score integer,
  p_rationale text,
  p_confidence double precision,
  p_criterion_scores jsonb,
  p_model text,
  p_cost_usd numeric
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_user_id uuid := auth.uid();
  v_rubric jsonb;
  v_max_points integer;
  v_sum integer;
  v_count integer := 0;
begin
  if v_user_id is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;

  select e.rubric, e.max_points
  into v_rubric, v_max_points
  from public.response_evaluations e
  where e.id = p_evaluation_id
    and e.status = 'grading'
    and exists (
      select 1 from public.sessions s
      where s.id = e.session_id
        and s.teacher_id = v_user_id
    );

  if not found then return false; end if;

  if p_ai_score < 0 or p_ai_score > v_max_points then
    raise exception 'AI score out of range' using errcode = '22023';
  end if;
  if p_confidence < 0 or p_confidence > 1 then
    raise exception 'Confidence out of range' using errcode = '22023';
  end if;
  if p_cost_usd is not null and p_cost_usd < 0 then
    raise exception 'AI grading cost must be nonnegative' using errcode = '22023';
  end if;
  if p_rationale is null
     or char_length(btrim(p_rationale)) < 1
     or char_length(p_rationale) > 2000 then
    raise exception 'Invalid rationale' using errcode = '22023';
  end if;
  if jsonb_typeof(p_criterion_scores) <> 'array'
     or jsonb_array_length(p_criterion_scores) <> jsonb_array_length(v_rubric) then
    raise exception 'Invalid criterion scores' using errcode = '22023';
  end if;
  if exists (
    select 1
    from jsonb_array_elements(v_rubric) r
    where not exists (
      select 1
      from jsonb_array_elements(p_criterion_scores) c
      where c->>'criterionId' = r->>'id'
        and jsonb_typeof(c->'points') = 'number'
        and (c->>'points')::integer between 0 and (r->>'maxPoints')::integer
        and jsonb_typeof(c->'rationale') = 'string'
        and char_length(btrim(c->>'rationale')) between 1 and 500
    )
  ) then
    raise exception 'Criterion score does not match rubric' using errcode = '22023';
  end if;
  if (
    select count(*)
    from jsonb_array_elements(p_criterion_scores)
  ) <> (
    select count(distinct c->>'criterionId')
    from jsonb_array_elements(p_criterion_scores) c
  ) then
    raise exception 'Duplicate criterion score' using errcode = '22023';
  end if;

  select coalesce(sum((c->>'points')::integer), 0)
  into v_sum
  from jsonb_array_elements(p_criterion_scores) c;

  if v_sum <> p_ai_score then
    raise exception 'Criterion score sum mismatch' using errcode = '22023';
  end if;

  update public.response_evaluations e
  set status = case when p_confidence < 0.70 then 'needs_review' else 'graded' end,
      ai_score = p_ai_score,
      rationale = btrim(p_rationale),
      confidence = p_confidence,
      criterion_scores = p_criterion_scores,
      model = nullif(btrim(p_model), ''),
      cost_usd = p_cost_usd,
      error = null,
      evaluated_at = now(),
      teacher_confirmed = false,
      teacher_reviewed_at = null,
      teacher_note = null,
      updated_at = now()
  where e.id = p_evaluation_id
    and e.status = 'grading'
    and exists (
      select 1 from public.sessions s
      where s.id = e.session_id
        and s.teacher_id = v_user_id
    );

  get diagnostics v_count = row_count;
  if v_count > 0 then
    perform private.complete_ai_grading_budget(p_evaluation_id, p_cost_usd, true);
  end if;
  return v_count > 0;
end;
$function$;

revoke all on function public.finish_response_evaluation(
  uuid, integer, text, double precision, jsonb, text, numeric
) from public, anon;
grant execute on function public.finish_response_evaluation(
  uuid, integer, text, double precision, jsonb, text, numeric
) to authenticated;

create or replace function public.fail_response_evaluation(
  p_evaluation_id uuid,
  p_error text
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_user_id uuid := auth.uid();
  v_count integer := 0;
begin
  if v_user_id is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;

  update public.response_evaluations e
  set status = 'failed',
      error = left(coalesce(nullif(btrim(p_error), ''), 'AI grading failed'), 1000),
      updated_at = now()
  where e.id = p_evaluation_id
    and e.status = 'grading'
    and exists (
      select 1 from public.sessions s
      where s.id = e.session_id
        and s.teacher_id = v_user_id
    );

  get diagnostics v_count = row_count;
  if v_count > 0 then
    perform private.complete_ai_grading_budget(p_evaluation_id, null, false);
  end if;
  return v_count > 0;
end;
$function$;

revoke all on function public.fail_response_evaluation(uuid, text) from public, anon;
grant execute on function public.fail_response_evaluation(uuid, text) to authenticated;

-- Capability-token worker path. The evaluation row lock serializes it with the
-- browser path before either path can reserve budget.
create or replace function public.claim_grading_job(p_token text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_hash text;
  v_evaluation_id uuid;
  v_locked_id uuid;
  v_result jsonb;
begin
  if p_token is null or p_token !~ '^[0-9a-fA-F]{64}$' then
    return null;
  end if;

  v_hash := encode(extensions.digest(lower(p_token), 'sha256'), 'hex');

  select j.evaluation_id
  into v_evaluation_id
  from private.grading_jobs j
  where j.token_hash = v_hash
    and j.status = 'pending'
    and j.expires_at > now()
  for update;

  if v_evaluation_id is null then return null; end if;

  select e.id
  into v_locked_id
  from public.response_evaluations e
  join public.sessions s on s.id = e.session_id
  join public.profiles p on p.id = s.teacher_id
  where e.id = v_evaluation_id
    and (coalesce(p.ai_grading_enabled, false) or p.role = 'admin')
    and (
      e.status = 'pending'
      or (e.status = 'grading' and e.updated_at < now() - interval '5 minutes')
    )
  for update of e;

  if v_locked_id is null then
    delete from private.grading_jobs where evaluation_id = v_evaluation_id;
    return null;
  end if;

  if not private.reserve_ai_grading_budget(v_evaluation_id) then
    update public.response_evaluations
    set status = 'needs_review',
        grader_version = 'manual-budget-v1',
        error = null,
        updated_at = now()
    where id = v_evaluation_id;

    delete from private.grading_jobs where evaluation_id = v_evaluation_id;
    return null;
  end if;

  update public.response_evaluations
  set status = 'grading',
      error = null,
      updated_at = now()
  where id = v_evaluation_id;

  update private.grading_jobs
  set status = 'claimed',
      claimed_at = now()
  where evaluation_id = v_evaluation_id
    and token_hash = v_hash;

  select jsonb_build_object(
    'id', e.id,
    'session_id', e.session_id,
    'block_id', e.block_id,
    'answer_snapshot', e.answer_snapshot,
    'rubric', e.rubric,
    'max_points', e.max_points,
    'source_updated_at', e.source_updated_at,
    'grader_version', e.grader_version,
    'lesson_snapshot', s.lesson_snapshot
  )
  into v_result
  from public.response_evaluations e
  join public.sessions s on s.id = e.session_id
  where e.id = v_evaluation_id;

  return v_result;
end;
$function$;

revoke all on function public.claim_grading_job(text)
  from public, authenticated, service_role;
grant execute on function public.claim_grading_job(text) to anon;

create or replace function public.finish_grading_job(
  p_token text,
  p_ai_score integer,
  p_rationale text,
  p_confidence double precision,
  p_criterion_scores jsonb,
  p_model text,
  p_cost_usd numeric
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_hash text;
  v_evaluation_id uuid;
  v_rubric jsonb;
  v_max_points integer;
  v_sum integer;
  v_count integer := 0;
begin
  if p_token is null or p_token !~ '^[0-9a-fA-F]{64}$' then return false; end if;

  v_hash := encode(extensions.digest(lower(p_token), 'sha256'), 'hex');

  select j.evaluation_id
  into v_evaluation_id
  from private.grading_jobs j
  where j.token_hash = v_hash
    and j.status = 'claimed'
    and j.expires_at > now()
  for update;

  if v_evaluation_id is null then return false; end if;

  select e.rubric, e.max_points
  into v_rubric, v_max_points
  from public.response_evaluations e
  where e.id = v_evaluation_id
    and e.status = 'grading';

  if not found then
    perform private.complete_ai_grading_budget(v_evaluation_id, null, false);
    delete from private.grading_jobs where evaluation_id = v_evaluation_id;
    return false;
  end if;

  if p_ai_score < 0 or p_ai_score > v_max_points then
    raise exception 'AI score out of range' using errcode = '22023';
  end if;
  if p_confidence < 0 or p_confidence > 1 then
    raise exception 'Confidence out of range' using errcode = '22023';
  end if;
  if p_cost_usd is not null and p_cost_usd < 0 then
    raise exception 'AI grading cost must be nonnegative' using errcode = '22023';
  end if;
  if p_rationale is null
     or char_length(btrim(p_rationale)) < 1
     or char_length(p_rationale) > 2000 then
    raise exception 'Invalid rationale' using errcode = '22023';
  end if;
  if jsonb_typeof(p_criterion_scores) <> 'array'
     or jsonb_array_length(p_criterion_scores) <> jsonb_array_length(v_rubric) then
    raise exception 'Invalid criterion scores' using errcode = '22023';
  end if;
  if exists (
    select 1
    from jsonb_array_elements(v_rubric) r
    where not exists (
      select 1
      from jsonb_array_elements(p_criterion_scores) c
      where c->>'criterionId' = r->>'id'
        and jsonb_typeof(c->'points') = 'number'
        and (c->>'points')::integer between 0 and (r->>'maxPoints')::integer
        and jsonb_typeof(c->'rationale') = 'string'
        and char_length(btrim(c->>'rationale')) between 1 and 500
    )
  ) then
    raise exception 'Criterion score does not match rubric' using errcode = '22023';
  end if;
  if (
    select count(*) from jsonb_array_elements(p_criterion_scores)
  ) <> (
    select count(distinct c->>'criterionId')
    from jsonb_array_elements(p_criterion_scores) c
  ) then
    raise exception 'Duplicate criterion score' using errcode = '22023';
  end if;

  select coalesce(sum((c->>'points')::integer), 0)
  into v_sum
  from jsonb_array_elements(p_criterion_scores) c;

  if v_sum <> p_ai_score then
    raise exception 'Criterion score sum mismatch' using errcode = '22023';
  end if;

  update public.response_evaluations e
  set status = case when p_confidence < 0.70 then 'needs_review' else 'graded' end,
      ai_score = p_ai_score,
      rationale = btrim(p_rationale),
      confidence = p_confidence,
      criterion_scores = p_criterion_scores,
      model = nullif(btrim(p_model), ''),
      cost_usd = p_cost_usd,
      error = null,
      evaluated_at = now(),
      teacher_confirmed = false,
      teacher_reviewed_at = null,
      teacher_note = null,
      updated_at = now()
  where e.id = v_evaluation_id
    and e.status = 'grading';

  get diagnostics v_count = row_count;
  if v_count = 0 then
    perform private.complete_ai_grading_budget(v_evaluation_id, null, false);
    return false;
  end if;

  perform private.complete_ai_grading_budget(v_evaluation_id, p_cost_usd, true);

  delete from private.grading_jobs
  where evaluation_id = v_evaluation_id
    and token_hash = v_hash;

  return true;
end;
$function$;

revoke all on function public.finish_grading_job(
  text, integer, text, double precision, jsonb, text, numeric
) from public, authenticated, service_role;
grant execute on function public.finish_grading_job(
  text, integer, text, double precision, jsonb, text, numeric
) to anon;

create or replace function public.fail_grading_job(
  p_token text,
  p_error text
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_hash text;
  v_evaluation_id uuid;
  v_count integer := 0;
begin
  if p_token is null or p_token !~ '^[0-9a-fA-F]{64}$' then return false; end if;

  v_hash := encode(extensions.digest(lower(p_token), 'sha256'), 'hex');

  select j.evaluation_id
  into v_evaluation_id
  from private.grading_jobs j
  where j.token_hash = v_hash
    and j.status = 'claimed'
  for update;

  if v_evaluation_id is null then return false; end if;

  update public.response_evaluations e
  set status = 'failed',
      error = left(coalesce(nullif(btrim(p_error), ''), 'AI grading failed'), 1000),
      updated_at = now()
  where e.id = v_evaluation_id
    and e.status = 'grading';

  get diagnostics v_count = row_count;

  perform private.complete_ai_grading_budget(v_evaluation_id, null, false);

  delete from private.grading_jobs
  where evaluation_id = v_evaluation_id
    and token_hash = v_hash;

  return v_count > 0;
end;
$function$;

revoke all on function public.fail_grading_job(text, text)
  from public, authenticated, service_role;
grant execute on function public.fail_grading_job(text, text) to anon;

comment on function private.reserve_ai_grading_budget(uuid) is
  'Atomically reserves one AI grading attempt against the teacher or active organization monthly safety budget.';
