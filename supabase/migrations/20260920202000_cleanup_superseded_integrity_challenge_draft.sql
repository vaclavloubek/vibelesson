-- Remove superseded objects created by an earlier parallel integrity-challenge draft.
-- Keep the canonical 0.9.65 ai_use_suspicion fields and the 0.9.66 challenge lifecycle.

drop trigger if exists a_reset_response_integrity_on_new_snapshot on public.response_evaluations;
drop trigger if exists z_force_high_suspicion_teacher_review on public.response_evaluations;

drop function if exists private.reset_response_integrity_on_new_snapshot();
drop function if exists private.force_high_suspicion_teacher_review();
drop function if exists public.record_response_evaluation_integrity(uuid, text, jsonb, text);
drop function if exists public.record_grading_job_integrity(text, text, jsonb, text);

alter table public.response_evaluations
  drop column if exists ai_suspicion,
  drop column if exists ai_suspicion_reasons;
