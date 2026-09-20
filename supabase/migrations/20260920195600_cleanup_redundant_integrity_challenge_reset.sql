drop trigger if exists reset_integrity_challenge_on_new_snapshot
  on public.response_evaluations;

drop function if exists private.reset_integrity_challenge_on_new_snapshot();
