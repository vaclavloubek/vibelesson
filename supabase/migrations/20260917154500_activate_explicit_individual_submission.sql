-- Activate SEC-001 remediation after the compatible student UI and Edge Function
-- have been deployed. Draft writes must no longer enqueue paid AI grading.

drop trigger if exists queue_scored_individual_response_evaluation on public.responses;

drop function if exists public.sync_scored_response_evaluation();
