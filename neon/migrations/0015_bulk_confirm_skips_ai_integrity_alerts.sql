-- Bulk "Confirm all AI suggestions" must not confirm answers with a high
-- AI-use integrity alert: the teacher would never see the alert, and the AI
-- points would count. Those stay unconfirmed until the teacher reviews each
-- one (review_response_evaluation). Same signature and grants as 0012, so the
-- previous app build keeps working. Idempotent.

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
    and e.ai_score between 0 and e.max_points
    and e.ai_use_suspicion is distinct from 'high';
  get diagnostics v_count = row_count;
  return v_count;
end;
$function$;

revoke all on function public.confirm_ai_evaluation_proposals(uuid) from public, anon, anonymous;
grant execute on function public.confirm_ai_evaluation_proposals(uuid) to authenticated;

notify pgrst, 'reload schema';
