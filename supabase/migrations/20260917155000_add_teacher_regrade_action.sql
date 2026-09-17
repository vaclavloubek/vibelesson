create or replace function public.requeue_response_evaluation_for_teacher(p_evaluation_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user_id uuid := auth.uid();
  v_evaluation public.response_evaluations%rowtype;
  v_submitted_answer jsonb;
  v_submitted_at timestamptz;
begin
  if v_user_id is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;

  select e.*
  into v_evaluation
  from public.response_evaluations e
  where e.id = p_evaluation_id
    and exists (
      select 1
      from public.sessions s
      where s.id = e.session_id
        and s.teacher_id = v_user_id
    );

  if not found then
    return false;
  end if;

  if v_evaluation.status not in ('graded', 'needs_review', 'failed') then
    return false;
  end if;

  if v_evaluation.response_id is not null then
    select r.submitted_answer, r.submitted_at
    into v_submitted_answer, v_submitted_at
    from public.responses r
    where r.id = v_evaluation.response_id
      and r.session_id = v_evaluation.session_id;
  elsif v_evaluation.team_response_id is not null then
    select r.submitted_answer, r.submitted_at
    into v_submitted_answer, v_submitted_at
    from public.team_responses r
    where r.id = v_evaluation.team_response_id
      and r.session_id = v_evaluation.session_id;
  else
    return false;
  end if;

  if v_submitted_at is null
     or jsonb_typeof(v_submitted_answer) <> 'object'
     or nullif(btrim(v_submitted_answer->>'text'), '') is null
     or v_submitted_answer is not distinct from v_evaluation.answer_snapshot then
    return false;
  end if;

  update public.response_evaluations e
  set source_updated_at = v_submitted_at,
      status = 'pending',
      answer_snapshot = v_submitted_answer,
      criterion_scores = '[]'::jsonb,
      ai_score = null,
      teacher_score = null,
      rationale = null,
      confidence = null,
      model = null,
      cost_usd = null,
      error = null,
      evaluated_at = null,
      teacher_confirmed = false,
      teacher_reviewed_at = null,
      teacher_note = null,
      grader_version = 'b7-v4-teacher-regrade',
      updated_at = now()
  where e.id = p_evaluation_id;

  return true;
end;
$$;

revoke all on function public.requeue_response_evaluation_for_teacher(uuid) from public, anon;
grant execute on function public.requeue_response_evaluation_for_teacher(uuid) to authenticated;
