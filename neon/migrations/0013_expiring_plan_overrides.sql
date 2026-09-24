-- Manual entitlement overrides can grant a whole individual plan for a limited
-- time (e.g. a one-week Teacher Pro trial without a Stripe subscription).
--
-- 1. manual_entitlement_overrides gets plan_code (optional individual plan) and
--    expires_at (optional; the whole override is ignored from that moment).
-- 2. apply_profile_plan uses the override plan when it ranks above the billing
--    plan, so limits, features, AI grading budget and import limit follow it.
-- 3. recompute_current_profile_entitlements starts from the live billing plan
--    instead of profiles.active_plan_code, which may now carry an override plan.
-- 4. individual_ai_quota_window uses the UTC calendar month for a paid plan that
--    comes from an override (there is no Stripe period). Patched in place from
--    the live catalog; the replacement must match exactly once.
-- 5. expire_manual_entitlement_overrides() deletes expired overrides and
--    recomputes the affected profiles; the hourly /api/cron/neon-grading calls it.
--
-- Grant: insert the row, then select private.recompute_current_profile_entitlements(user_id).
-- Idempotent.

alter table public.manual_entitlement_overrides
  add column if not exists plan_code text references public.billing_plans(code),
  add column if not exists expires_at timestamptz;

comment on column public.manual_entitlement_overrides.plan_code is
  'Optional individual plan granted manually. Applied only when it ranks above the billing plan.';
comment on column public.manual_entitlement_overrides.expires_at is
  'Optional end of the whole override. Expired rows are ignored and deleted by private.expire_manual_entitlement_overrides().';

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
  v_org_ai boolean := false;
  v_org_folders boolean := false;
  v_org_multilingual boolean := false;
  v_org_worksheet boolean := false;
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
    coalesce(bool_or(bp.worksheet_export_enabled), false)
  into v_org_ai, v_org_folders, v_org_multilingual, v_org_worksheet
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
      updated_at = now()
  where id = p_user_id;

  return v_applied_plan;
end;
$function$;

create or replace function private.recompute_current_profile_entitlements(p_user_id uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_plan text;
begin
  select case when p.role = 'admin' then 'free' else private.effective_billing_plan(p.id, true) end
  into v_plan
  from public.profiles p
  where p.id = p_user_id;

  if not found then return null; end if;
  return private.apply_profile_plan(p_user_id, v_plan);
end;
$function$;

do $migration$
declare
  v_fn constant regprocedure := 'private.individual_ai_quota_window(uuid,timestamptz)'::regprocedure;
  v_def text := pg_catalog.pg_get_functiondef(v_fn);
  v_old constant text := '  if not found then
    raise exception ''paid_quota_period_unavailable'' using errcode = ''P0001'';
  end if;';
  v_new constant text := '  if not found then
    -- Paid plan granted by a manual override has no Stripe period.
    if exists (
      select 1 from public.manual_entitlement_overrides meo
      where meo.user_id = p_user_id and meo.plan_code = v_plan_code
    ) then
      v_window_start := date_trunc(''month'', p_at at time zone ''UTC'') at time zone ''UTC'';
      v_window_end := (date_trunc(''month'', p_at at time zone ''UTC'') + interval ''1 month'') at time zone ''UTC'';
      return query
      select v_window_start, v_window_end, ''calendar_utc''::text;
      return;
    end if;
    raise exception ''paid_quota_period_unavailable'' using errcode = ''P0001'';
  end if;';
begin
  if position('Paid plan granted by a manual override' in v_def) > 0 then
    return;
  end if;
  if (length(v_def) - length(replace(v_def, v_old, ''))) / length(v_old) <> 1 then
    raise exception 'individual_ai_quota_window definition changed; refusing to patch';
  end if;
  execute replace(v_def, v_old, v_new);
end;
$migration$;

create or replace function private.expire_manual_entitlement_overrides()
returns integer
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_user_id uuid;
  v_count integer := 0;
begin
  for v_user_id in
    delete from public.manual_entitlement_overrides
    where expires_at <= now()
    returning user_id
  loop
    perform private.recompute_current_profile_entitlements(v_user_id);
    v_count := v_count + 1;
  end loop;
  return v_count;
end;
$function$;

revoke all on function private.apply_profile_plan(uuid, text) from public, anon, anonymous, authenticated, authenticator;
revoke all on function private.recompute_current_profile_entitlements(uuid) from public, anon, anonymous, authenticated, authenticator;
revoke all on function private.individual_ai_quota_window(uuid, timestamptz) from public, anon, anonymous, authenticated, authenticator;
revoke all on function private.expire_manual_entitlement_overrides() from public, anon, anonymous, authenticated, authenticator;
