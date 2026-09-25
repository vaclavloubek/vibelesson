-- Syllonaut Help (AI assistant for signed-in teachers), phase 1: admin only.
--
-- 1. billing_plans: help_assistant_enabled, monthly_help_message_limit (per
--    teacher) and monthly_help_budget_usd (per individual account, or per
--    organization for Team/School/Campus). Only 'admin' is enabled for now;
--    Teacher 40/$1, Teacher Pro 80/$2, School 80/$8, Campus 80/$20 are
--    prepared but stay disabled. Free and Team have no assistant.
-- 2. profiles.help_assistant_enabled, derived in private.apply_profile_plan
--    (latest definition from 0013): individual plan OR any active school
--    membership whose plan has it; admin always true. No manual override.
-- 3. public.help_assistant_requests: one row per message, no conversation text
--    (route pattern, topic, cost, feedback only). Teachers may read their rows
--    and set feedback on them through the Data API; everything else is server-side.
-- 4. private.help_message_allowance (limits and window),
--    public.reserve_help_message_server, public.finish_help_message_server and
--    public.get_help_message_usage_server: service role only.
--
-- Apply statement by statement through run_sql_transaction (PL/pgSQL bodies).
-- After applying, refresh the Data API schema cache (new table and column).

alter table public.billing_plans
  add column if not exists help_assistant_enabled boolean not null default false,
  add column if not exists monthly_help_message_limit integer
    check (monthly_help_message_limit is null or monthly_help_message_limit > 0),
  add column if not exists monthly_help_budget_usd numeric(12,2)
    check (monthly_help_budget_usd is null or monthly_help_budget_usd >= 0);

update public.billing_plans bp
set help_assistant_enabled = v.enabled,
    monthly_help_message_limit = v.message_limit,
    monthly_help_budget_usd = v.budget_usd,
    updated_at = now()
from (values
  ('free', false, null::integer, null::numeric),
  ('teacher', false, 40, 1.00),
  ('teacher_pro', false, 80, 2.00),
  ('team', false, null, null),
  ('school', false, 80, 8.00),
  ('campus', false, 80, 20.00),
  ('admin', true, null, null)
) as v(code, enabled, message_limit, budget_usd)
where bp.code = v.code;

alter table public.profiles
  add column if not exists help_assistant_enabled boolean not null default false;

create or replace function private.apply_profile_plan(p_user_id uuid, p_plan_code text)
returns text
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_role text;
  v_plan public.billing_plans%rowtype;
  v_override_plan public.billing_plans%rowtype;
  v_override public.manual_entitlement_overrides%rowtype;
  v_lesson_limit integer;
  v_revision_limit integer;
  v_ai_grading boolean;
  v_folders boolean;
  v_multilingual boolean;
  v_worksheet_export boolean;
  v_help boolean;
  v_org_ai boolean := false;
  v_org_folders boolean := false;
  v_org_multilingual boolean := false;
  v_org_worksheet boolean := false;
  v_org_help boolean := false;
  v_applied_plan text;
begin
  select p.role into v_role
  from public.profiles p
  where p.id = p_user_id
  for update;

  if not found then
    raise exception 'profile_not_found' using errcode = 'P0001';
  end if;

  if v_role = 'admin' then
    update public.profiles
    set active_plan_code = 'admin',
        monthly_lesson_limit = null,
        monthly_revision_limit = null,
        ai_grading_enabled = true,
        lesson_folders_enabled = true,
        multilingual_lessons_enabled = true,
        worksheet_export_enabled = true,
        help_assistant_enabled = true,
        updated_at = now()
    where id = p_user_id;
    return 'admin';
  end if;

  select * into v_plan
  from public.billing_plans
  where code = p_plan_code and audience = 'individual';

  if not found then
    raise exception 'invalid_individual_plan' using errcode = 'P0001';
  end if;

  select bp.* into v_override_plan
  from public.manual_entitlement_overrides meo
  join public.billing_plans bp on bp.code = meo.plan_code
  where meo.user_id = p_user_id
    and bp.audience = 'individual'
    and (meo.expires_at is null or meo.expires_at > now());

  if found and v_override_plan.access_rank > v_plan.access_rank then
    v_plan := v_override_plan;
  end if;

  select
    coalesce(bool_or(bp.ai_grading_enabled), false),
    coalesce(bool_or(bp.lesson_folders_enabled), false),
    coalesce(bool_or(bp.multilingual_lessons_enabled), false),
    coalesce(bool_or(bp.worksheet_export_enabled), false),
    coalesce(bool_or(bp.help_assistant_enabled), false)
  into v_org_ai, v_org_folders, v_org_multilingual, v_org_worksheet, v_org_help
  from public.organization_memberships om
  join public.organizations o on o.id = om.organization_id
  join public.billing_plans bp on bp.code = o.plan_code
  where om.user_id = p_user_id
    and om.status = 'active'
    and o.status = 'active'
    and bp.audience = 'organization';

  v_lesson_limit := v_plan.monthly_lesson_limit;
  v_revision_limit := v_plan.monthly_revision_limit;
  v_ai_grading := v_plan.ai_grading_enabled or v_org_ai;
  v_folders := v_plan.lesson_folders_enabled or v_org_folders;
  v_multilingual := v_plan.multilingual_lessons_enabled or v_org_multilingual;
  v_worksheet_export := v_plan.worksheet_export_enabled or v_org_worksheet;
  -- No manual override for the help assistant: plan OR school membership only.
  v_help := v_plan.help_assistant_enabled or v_org_help;

  select * into v_override
  from public.manual_entitlement_overrides
  where user_id = p_user_id
    and (expires_at is null or expires_at > now());

  if found then
    if v_override.lesson_limit_override then v_lesson_limit := v_override.monthly_lesson_limit; end if;
    if v_override.revision_limit_override then v_revision_limit := v_override.monthly_revision_limit; end if;
    if v_override.ai_grading_enabled is not null then v_ai_grading := v_override.ai_grading_enabled; end if;
    if v_override.lesson_folders_enabled is not null then v_folders := v_override.lesson_folders_enabled; end if;
    if v_override.multilingual_lessons_enabled is not null then v_multilingual := v_override.multilingual_lessons_enabled; end if;
    if v_override.worksheet_export_enabled is not null then v_worksheet_export := v_override.worksheet_export_enabled; end if;
  end if;

  v_applied_plan := v_plan.code;

  update public.profiles
  set active_plan_code = v_applied_plan,
      monthly_lesson_limit = v_lesson_limit,
      monthly_revision_limit = v_revision_limit,
      ai_grading_enabled = v_ai_grading,
      lesson_folders_enabled = v_folders,
      multilingual_lessons_enabled = v_multilingual,
      worksheet_export_enabled = v_worksheet_export,
      help_assistant_enabled = v_help,
      updated_at = now()
  where id = p_user_id;

  return v_applied_plan;
end;
$function$;

-- Only the admin plan is enabled and no organization plan is, so the derived
-- value is exactly role = 'admin'. Avoids recomputing every other entitlement.
update public.profiles
set help_assistant_enabled = (role = 'admin')
where help_assistant_enabled is distinct from (role = 'admin');

create table if not exists public.help_assistant_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null
    references public.profiles(id) on delete cascade,
  organization_id uuid
    references public.organizations(id) on delete set null,
  created_at timestamptz not null default now(),
  completed_at timestamptz,
  status text not null default 'pending'
    check (status in ('pending', 'succeeded', 'failed')),
  cost_usd numeric(12,6)
    check (cost_usd is null or cost_usd >= 0),
  route text not null
    check (route ~ '^/[a-z0-9/_\[\]-]{0,80}$'),
  topic text
    check (topic in ('lesson', 'edit', 'live', 'teams', 'evaluation', 'quota', 'language',
      'worksheets', 'billing', 'subscription', 'legal', 'devices', 'other')),
  feedback text
    check (feedback in ('up', 'down')),
  check ((status = 'pending') = (completed_at is null))
);

comment on table public.help_assistant_requests is
  'One row per Syllonaut Help message. Never stores conversation text: only the route pattern, topic, cost and feedback.';

create index if not exists help_assistant_requests_user_created_idx
  on public.help_assistant_requests (user_id, created_at);

create index if not exists help_assistant_requests_org_created_idx
  on public.help_assistant_requests (organization_id, created_at)
  where organization_id is not null;

alter table public.help_assistant_requests enable row level security;

revoke all on table public.help_assistant_requests from public, anon, anonymous, authenticated, authenticator;
grant select (id, created_at, status, route, topic, feedback) on public.help_assistant_requests to authenticated;
grant update (feedback) on public.help_assistant_requests to authenticated;

drop policy if exists users_can_view_own_help_requests on public.help_assistant_requests;
create policy users_can_view_own_help_requests
  on public.help_assistant_requests
  for select
  to authenticated
  using ((select auth.uid()) is not null and (select auth.uid()) = user_id);

drop policy if exists users_can_rate_own_help_answers on public.help_assistant_requests;
create policy users_can_rate_own_help_answers
  on public.help_assistant_requests
  for update
  to authenticated
  using ((select auth.uid()) is not null and (select auth.uid()) = user_id and status = 'succeeded')
  with check ((select auth.uid()) is not null and (select auth.uid()) = user_id and status = 'succeeded');

create or replace function private.help_message_allowance(p_user_id uuid)
returns table(
  enabled boolean,
  unlimited boolean,
  organization_id uuid,
  message_limit integer,
  budget_usd numeric,
  window_start timestamptz,
  window_end timestamptz
)
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_role text;
  v_enabled boolean;
  v_plan_code text;
  v_org_id uuid;
  v_org_plan public.billing_plans%rowtype;
  v_plan public.billing_plans%rowtype;
  v_window_start timestamptz;
  v_window_end timestamptz;
begin
  select p.role, p.help_assistant_enabled, p.active_plan_code
  into v_role, v_enabled, v_plan_code
  from public.profiles p
  where p.id = p_user_id;

  if not found then
    raise exception 'profile_not_found' using errcode = 'P0001';
  end if;

  if v_role = 'admin' then
    return query select true, true, null::uuid, null::integer, null::numeric,
      null::timestamptz, null::timestamptz;
    return;
  end if;

  if not v_enabled then
    return query select false, false, null::uuid, null::integer, null::numeric,
      null::timestamptz, null::timestamptz;
    return;
  end if;

  -- School membership first: shared budget per organization, calendar month.
  select bp.* into v_org_plan
  from private.current_active_organization(p_user_id) cao
  join public.billing_plans bp on bp.code = cao.plan_code;

  if found and v_org_plan.help_assistant_enabled then
    select cao.organization_id into v_org_id
    from private.current_active_organization(p_user_id) cao;

    v_window_start := date_trunc('month', now() at time zone 'UTC') at time zone 'UTC';
    v_window_end := (date_trunc('month', now() at time zone 'UTC') + interval '1 month') at time zone 'UTC';

    if v_org_plan.monthly_help_message_limit is null or v_org_plan.monthly_help_budget_usd is null then
      return query select false, false, null::uuid, null::integer, null::numeric,
        null::timestamptz, null::timestamptz;
      return;
    end if;

    return query select true, false, v_org_id, v_org_plan.monthly_help_message_limit,
      v_org_plan.monthly_help_budget_usd, v_window_start, v_window_end;
    return;
  end if;

  select bp.* into v_plan
  from public.billing_plans bp
  where bp.code = v_plan_code and bp.audience = 'individual';

  -- Fail closed when the individual plan has no assistant or no limits.
  if not found
    or not v_plan.help_assistant_enabled
    or v_plan.monthly_help_message_limit is null
    or v_plan.monthly_help_budget_usd is null then
    return query select false, false, null::uuid, null::integer, null::numeric,
      null::timestamptz, null::timestamptz;
    return;
  end if;

  select q.window_start, q.window_end
  into v_window_start, v_window_end
  from private.individual_ai_quota_window(p_user_id, now()) q;

  return query select true, false, null::uuid, v_plan.monthly_help_message_limit,
    v_plan.monthly_help_budget_usd, v_window_start, v_window_end;
end;
$function$;

create or replace function public.reserve_help_message_server(p_user_id uuid, p_route text)
returns table(
  request_id uuid,
  allowed boolean,
  denial_code text,
  used integer,
  monthly_limit integer
)
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_allowance record;
  v_recent integer;
  v_used integer := 0;
  v_spent numeric := 0;
  v_request_id uuid;
begin
  if p_user_id is null then
    raise exception 'user_required' using errcode = '22023';
  end if;

  if p_route is null or p_route !~ '^/[a-z0-9/_\[\]-]{0,80}$' then
    raise exception 'invalid_help_route' using errcode = '22023';
  end if;

  -- Serialize this teacher's reservations.
  perform 1 from public.profiles p where p.id = p_user_id for update;
  if not found then
    raise exception 'profile_not_found' using errcode = 'P0001';
  end if;

  select * into v_allowance from private.help_message_allowance(p_user_id);

  if not v_allowance.enabled then
    return query select null::uuid, false, 'not_entitled'::text, 0, null::integer;
    return;
  end if;

  if (public.get_effective_ai_billing_pause_state_server(p_user_id) ->> 'reason') is not null then
    return query select null::uuid, false, 'payment_required'::text, 0, v_allowance.message_limit;
    return;
  end if;

  update public.help_assistant_requests
  set status = 'failed', completed_at = now()
  where user_id = p_user_id
    and status = 'pending'
    and created_at < now() - interval '10 minutes';

  select count(*)::integer into v_recent
  from public.help_assistant_requests r
  where r.user_id = p_user_id
    and r.created_at > now() - interval '60 seconds';

  if v_recent >= 6 then
    return query select null::uuid, false, 'rate_limited'::text, 0, v_allowance.message_limit;
    return;
  end if;

  if not v_allowance.unlimited then
    if v_allowance.organization_id is not null then
      -- Shared budget: serialize the organization's members.
      perform 1 from public.organizations o where o.id = v_allowance.organization_id for update;

      select coalesce(sum(r.cost_usd), 0) into v_spent
      from public.help_assistant_requests r
      where r.organization_id = v_allowance.organization_id
        and r.created_at >= v_allowance.window_start
        and r.created_at < v_allowance.window_end;
    else
      select coalesce(sum(r.cost_usd), 0) into v_spent
      from public.help_assistant_requests r
      where r.user_id = p_user_id
        and r.organization_id is null
        and r.created_at >= v_allowance.window_start
        and r.created_at < v_allowance.window_end;
    end if;

    select count(*)::integer into v_used
    from public.help_assistant_requests r
    where r.user_id = p_user_id
      and r.status in ('pending', 'succeeded')
      and r.created_at >= v_allowance.window_start
      and r.created_at < v_allowance.window_end;

    if v_used >= v_allowance.message_limit then
      return query select null::uuid, false, 'monthly_limit'::text, v_used, v_allowance.message_limit;
      return;
    end if;

    if v_spent >= v_allowance.budget_usd then
      return query select null::uuid, false, 'budget_exhausted'::text, v_used, v_allowance.message_limit;
      return;
    end if;
  end if;

  insert into public.help_assistant_requests (user_id, organization_id, route, status)
  values (p_user_id, v_allowance.organization_id, p_route, 'pending')
  returning id into v_request_id;

  return query select v_request_id, true, null::text, v_used + 1, v_allowance.message_limit;
end;
$function$;

create or replace function public.finish_help_message_server(
  p_user_id uuid,
  p_request_id uuid,
  p_status text,
  p_cost_usd numeric default null,
  p_topic text default null
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $function$
begin
  if p_user_id is null then
    raise exception 'user_required' using errcode = '22023';
  end if;

  if p_request_id is null then
    raise exception 'request_required' using errcode = '22023';
  end if;

  if p_status not in ('succeeded', 'failed') then
    raise exception 'invalid_help_status' using errcode = '22023';
  end if;

  if p_cost_usd is not null and p_cost_usd < 0 then
    raise exception 'invalid_help_cost' using errcode = '22023';
  end if;

  update public.help_assistant_requests
  set status = p_status,
      cost_usd = p_cost_usd,
      topic = p_topic,
      completed_at = now()
  where id = p_request_id
    and user_id = p_user_id
    and status = 'pending';

  return found;
end;
$function$;

create or replace function public.get_help_message_usage_server(p_user_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_allowance record;
  v_used integer := 0;
begin
  if p_user_id is null then
    raise exception 'user_required' using errcode = '22023';
  end if;

  select * into v_allowance from private.help_message_allowance(p_user_id);

  if v_allowance.enabled and not v_allowance.unlimited then
    select count(*)::integer into v_used
    from public.help_assistant_requests r
    where r.user_id = p_user_id
      and r.status in ('pending', 'succeeded')
      and r.created_at >= v_allowance.window_start
      and r.created_at < v_allowance.window_end;
  end if;

  return jsonb_build_object(
    'enabled', v_allowance.enabled,
    'unlimited', v_allowance.unlimited,
    'used', v_used,
    'limit', v_allowance.message_limit,
    'windowEnd', v_allowance.window_end
  );
end;
$function$;

revoke all on function private.apply_profile_plan(uuid, text) from public, anon, anonymous, authenticated, authenticator;
revoke all on function private.help_message_allowance(uuid) from public, anon, anonymous, authenticated, authenticator;
revoke all on function public.reserve_help_message_server(uuid, text) from public, anon, anonymous, authenticated, authenticator;
revoke all on function public.finish_help_message_server(uuid, uuid, text, numeric, text) from public, anon, anonymous, authenticated, authenticator;
revoke all on function public.get_help_message_usage_server(uuid) from public, anon, anonymous, authenticated, authenticator;
grant execute on function public.reserve_help_message_server(uuid, text) to service_role;
grant execute on function public.finish_help_message_server(uuid, uuid, text, numeric, text) to service_role;
grant execute on function public.get_help_message_usage_server(uuid) to service_role;
