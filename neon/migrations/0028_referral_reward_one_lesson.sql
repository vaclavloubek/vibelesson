-- Referral program: the reward is 1 bonus AI lesson generation per qualified
-- invitee instead of 3 (owner decision 2026-09-28: three could tempt misuse).
-- Data only; lib/referral-program-config.ts mirrors the value. No grant existed
-- when this was applied, so no credited reward changes.

update private.referral_program_settings
set reward_units = 1,
    updated_at = now()
where id;
