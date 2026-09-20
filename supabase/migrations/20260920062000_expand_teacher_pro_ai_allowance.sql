-- Teacher Pro allowance expansion 2026-09-20.
-- Commercial adjustment: make the premium individual plan more attractive
-- while preserving the measured-cost safety envelope and the $2 grading cap.

update public.billing_plans
set monthly_lesson_limit = 25,
    monthly_revision_limit = 40,
    updated_at = now()
where code = 'teacher_pro'
  and (
    monthly_lesson_limit is distinct from 25
    or monthly_revision_limit is distinct from 40
  );

-- Refresh effective Teacher Pro profile limits while preserving explicit
-- manual entitlement overrides.
do $$
declare
  v_profile record;
begin
  for v_profile in
    select p.id, p.active_plan_code
    from public.profiles p
    where p.role <> 'admin'
      and p.active_plan_code = 'teacher_pro'
  loop
    perform private.apply_profile_plan(v_profile.id, v_profile.active_plan_code);
  end loop;
end;
$$;
