-- Rebalance organization pricing economics after measuring real AI Gateway costs.
-- Public prices live in lib/organization-billing-catalog.ts; this migration updates
-- the server-authoritative shared AI pools and internal AI-grading safety ceilings.
--
-- Observed generation costs on 2026-09-19:
-- lesson avg ~$0.142; full revision avg ~$0.096; block revision avg ~$0.032.
-- The new pools keep normal school usage generous while preventing a fully
-- exhausted shared quota from structurally exceeding plan revenue.

update public.billing_plans
set
  monthly_lesson_limit = case code
    when 'team' then 60
    when 'school' then 150
    when 'campus' then 400
    else monthly_lesson_limit
  end,
  monthly_revision_limit = case code
    when 'team' then 180
    when 'school' then 300
    when 'campus' then 700
    else monthly_revision_limit
  end,
  monthly_ai_grading_budget_usd = case code
    when 'school' then 20.00
    when 'campus' then 40.00
    else monthly_ai_grading_budget_usd
  end,
  monthly_ai_grading_count_limit = case code
    when 'school' then 2500
    when 'campus' then 5000
    else monthly_ai_grading_count_limit
  end,
  updated_at = now()
where code in ('team', 'school', 'campus')
  and audience = 'organization';

comment on column public.billing_plans.monthly_lesson_limit is
  'Monthly AI lesson-generation allowance. Organization plans use a shared pool across active members.';
comment on column public.billing_plans.monthly_revision_limit is
  'Monthly AI revision allowance. Organization plans use a shared pool across active members.';
