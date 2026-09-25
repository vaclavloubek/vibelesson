-- Syllonaut Help for teachers (0.9.150): enable the plans prepared in 0017.
--
-- Teacher 40 messages / $1, Teacher Pro 80 / $2 (per account), School 80 / $8
-- and Campus 80 / $20 (message limit per teacher, budget per organization).
-- Free and Team stay without Help. Limits are unchanged from 0017.
-- Privacy Notice 1.9 describes the processing; the Pricing page does not list
-- Help (owner decision: an extra feature, not part of the offer).
--
-- profiles.help_assistant_enabled is derived by private.apply_profile_plan, so
-- every profile is recomputed from its current plan and memberships.
-- Idempotent. After applying, no Data API schema change (no refresh needed).

update public.billing_plans
set help_assistant_enabled = true,
    updated_at = now()
where code in ('teacher', 'teacher_pro', 'school', 'campus')
  and not help_assistant_enabled;

select private.recompute_current_profile_entitlements(p.id)
from public.profiles p;
