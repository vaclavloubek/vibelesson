-- Measured unit economics baseline 2026-09-20.
-- Rebalance plan quotas using observed AI Gateway costs while keeping
-- finished paid lessons reusable live without consuming AI creation quota.
--
-- Observed averages from production:
-- generate_lesson $0.142037
-- observed revision mix $0.071409
-- AI grading response $0.014362

with plan_limits(code, lesson_limit, revision_limit) as (
  values
    ('free', 5, 10),
    ('teacher', 10, 20),
    ('teacher_pro', 20, 25),
    ('team', 40, 80),
    ('school', 120, 240),
    ('campus', 300, 600)
)
update public.billing_plans bp
set monthly_lesson_limit = pl.lesson_limit,
    monthly_revision_limit = pl.revision_limit,
    updated_at = now()
from plan_limits pl
where bp.code = pl.code
  and (
    bp.monthly_lesson_limit is distinct from pl.lesson_limit
    or bp.monthly_revision_limit is distinct from pl.revision_limit
  );

update public.billing_plans
set monthly_ai_grading_budget_usd = case code
      when 'teacher_pro' then 2.00
      when 'school' then 10.00
      when 'campus' then 25.00
      else monthly_ai_grading_budget_usd
    end,
    monthly_ai_grading_count_limit = case code
      when 'teacher_pro' then 150
      when 'school' then 700
      when 'campus' then 1750
      else monthly_ai_grading_count_limit
    end,
    updated_at = now()
where code in ('teacher_pro', 'school', 'campus');

-- Refresh effective individual profile limits while preserving explicit
-- manual overrides. Organization shared quotas read billing_plans directly.
do $$
declare
  v_profile record;
begin
  for v_profile in
    select p.id, p.active_plan_code
    from public.profiles p
    where p.role <> 'admin'
      and p.active_plan_code in ('free', 'teacher', 'teacher_pro')
  loop
    perform private.apply_profile_plan(v_profile.id, v_profile.active_plan_code);
  end loop;
end;
$$;
