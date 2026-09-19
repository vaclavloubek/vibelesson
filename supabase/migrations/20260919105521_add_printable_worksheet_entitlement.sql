alter table public.billing_plans
  add column if not exists worksheet_export_enabled boolean not null default false;
alter table public.profiles
  add column if not exists worksheet_export_enabled boolean not null default false;
alter table public.manual_entitlement_overrides
  add column if not exists worksheet_export_enabled boolean;
update public.billing_plans
set worksheet_export_enabled = (code in ('teacher_pro', 'admin')), updated_at = now()
where worksheet_export_enabled is distinct from (code in ('teacher_pro', 'admin'));
update public.profiles p
set worksheet_export_enabled = bp.worksheet_export_enabled, updated_at = now()
from public.billing_plans bp
where bp.code = p.active_plan_code
  and p.worksheet_export_enabled is distinct from bp.worksheet_export_enabled;
comment on column public.billing_plans.worksheet_export_enabled is 'Plan entitlement for printable worksheet preview, browser printing and PDF export.';
comment on column public.profiles.worksheet_export_enabled is 'Server-authoritative effective entitlement for printable worksheet export.';
comment on column public.manual_entitlement_overrides.worksheet_export_enabled is 'Optional manual override for printable worksheet export entitlement.';
create or replace function private.apply_profile_plan(p_user_id uuid,p_plan_code text)
returns text language plpgsql security definer set search_path = '' as $$
declare
  v_role text;
  v_plan public.billing_plans%rowtype;
  v_override public.manual_entitlement_overrides%rowtype;
  v_lesson_limit integer;
  v_revision_limit integer;
  v_ai_grading boolean;
  v_folders boolean;
  v_multilingual boolean;
  v_worksheet_export boolean;
  v_applied_plan text;
begin
  select p.role into v_role from public.profiles p where p.id=p_user_id for update;
  if not found then raise exception 'profile_not_found' using errcode='P0001'; end if;
  if v_role='admin' then
    update public.profiles set active_plan_code='admin',monthly_lesson_limit=null,monthly_revision_limit=null,ai_grading_enabled=true,lesson_folders_enabled=true,multilingual_lessons_enabled=true,worksheet_export_enabled=true,updated_at=now() where id=p_user_id;
    return 'admin';
  end if;
  select * into v_plan from public.billing_plans where code=p_plan_code and audience='individual';
  if not found then raise exception 'invalid_individual_plan' using errcode='P0001'; end if;
  v_lesson_limit:=v_plan.monthly_lesson_limit; v_revision_limit:=v_plan.monthly_revision_limit; v_ai_grading:=v_plan.ai_grading_enabled; v_folders:=v_plan.lesson_folders_enabled; v_multilingual:=v_plan.multilingual_lessons_enabled; v_worksheet_export:=v_plan.worksheet_export_enabled;
  select * into v_override from public.manual_entitlement_overrides where user_id=p_user_id;
  if found then
    if v_override.lesson_limit_override then v_lesson_limit:=v_override.monthly_lesson_limit; end if;
    if v_override.revision_limit_override then v_revision_limit:=v_override.monthly_revision_limit; end if;
    if v_override.ai_grading_enabled is not null then v_ai_grading:=v_override.ai_grading_enabled; end if;
    if v_override.lesson_folders_enabled is not null then v_folders:=v_override.lesson_folders_enabled; end if;
    if v_override.multilingual_lessons_enabled is not null then v_multilingual:=v_override.multilingual_lessons_enabled; end if;
    if v_override.worksheet_export_enabled is not null then v_worksheet_export:=v_override.worksheet_export_enabled; end if;
  end if;
  v_applied_plan:=v_plan.code;
  update public.profiles set active_plan_code=v_applied_plan,monthly_lesson_limit=v_lesson_limit,monthly_revision_limit=v_revision_limit,ai_grading_enabled=v_ai_grading,lesson_folders_enabled=v_folders,multilingual_lessons_enabled=v_multilingual,worksheet_export_enabled=v_worksheet_export,updated_at=now() where id=p_user_id;
  return v_applied_plan;
end;
$$;
revoke all on function private.apply_profile_plan(uuid,text) from public,anon,authenticated;
