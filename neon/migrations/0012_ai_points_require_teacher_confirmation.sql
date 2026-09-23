-- LEGAL-021: AI points are only a proposal. Only teacher-confirmed points count
-- toward the student scoreboard, and the teacher can confirm proposals in bulk.
--
-- 1. get_student_public_scoreboard is patched in place from the live catalog
--    (like 0010). Both replacements must match exactly once or the migration
--    aborts. Privileges are preserved by CREATE OR REPLACE.
-- 2. confirm_ai_evaluation_proposals mirrors review_response_evaluation: it
--    acts only for the session's teacher (auth.uid()).
-- Idempotent.

do $migration$
declare
  v_fn constant regprocedure := 'public.get_student_public_scoreboard(uuid,text)'::regprocedure;
  v_def text := pg_catalog.pg_get_functiondef(v_fn);
  v_team_old constant text := 'else coalesce(team_evaluation.teacher_score, team_evaluation.ai_score, 0)';
  v_team_new constant text := 'else case when team_evaluation.teacher_confirmed then coalesce(team_evaluation.teacher_score, 0) else 0 end';
  v_part_old constant text := 'else coalesce(participant_evaluation.teacher_score, participant_evaluation.ai_score, 0)';
  v_part_new constant text := 'else case when participant_evaluation.teacher_confirmed then coalesce(participant_evaluation.teacher_score, 0) else 0 end';
begin
  if position(v_team_new in v_def) > 0 and position(v_part_new in v_def) > 0 then
    return;
  end if;
  if (length(v_def) - length(replace(v_def, v_team_old, ''))) / length(v_team_old) <> 1
    or (length(v_def) - length(replace(v_def, v_part_old, ''))) / length(v_part_old) <> 1
  then
    raise exception 'get_student_public_scoreboard definition changed; refusing to patch';
  end if;
  execute replace(replace(v_def, v_team_old, v_team_new), v_part_old, v_part_new);
end;
$migration$;

create or replace function public.confirm_ai_evaluation_proposals(p_session_id uuid)
returns integer
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_user_id uuid := auth.uid();
  v_count integer;
begin
  if v_user_id is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;
  if not exists (
    select 1 from public.sessions s where s.id = p_session_id and s.teacher_id = v_user_id
  ) then
    return null;
  end if;
  update public.response_evaluations e
  set teacher_score = e.ai_score,
      teacher_confirmed = true,
      teacher_reviewed_at = now(),
      updated_at = now()
  where e.session_id = p_session_id
    and not e.teacher_confirmed
    and e.status in ('graded', 'needs_review')
    and e.ai_score is not null
    and e.ai_score between 0 and e.max_points;
  get diagnostics v_count = row_count;
  return v_count;
end;
$function$;

revoke all on function public.confirm_ai_evaluation_proposals(uuid) from public, anon, anonymous;
grant execute on function public.confirm_ai_evaluation_proposals(uuid) to authenticated;

notify pgrst, 'reload schema';
