-- Keep newest-submission refresh available during a payment issue, but fall back to manual review.

create or replace function public.requeue_response_evaluation_server(
  p_user_id uuid,
  p_evaluation_id uuid,
  p_device_token_hash text
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_evaluation public.response_evaluations%rowtype;
  v_submitted_answer jsonb;
  v_submitted_at timestamptz;
  v_ai_enabled boolean := false;
  v_payment_paused boolean := false;
begin
  if p_user_id is null or p_evaluation_id is null then
    raise exception 'invalid_regrade_request' using errcode = '22023';
  end if;

  if not private.personal_trusted_device_hash_valid(p_user_id, p_device_token_hash) then
    raise exception 'trusted_device_required' using errcode = '42501';
  end if;

  select e.*
  into v_evaluation
  from public.response_evaluations e
  join public.sessions s on s.id = e.session_id
  where e.id = p_evaluation_id
    and s.teacher_id = p_user_id;

  if not found then return false; end if;
  if v_evaluation.status not in ('graded', 'needs_review', 'failed') then return false; end if;

  select coalesce(p.ai_grading_enabled, false) or p.role = 'admin'
  into v_ai_enabled
  from public.sessions s
  join public.profiles p on p.id = s.teacher_id
  where s.id = v_evaluation.session_id
    and s.teacher_id = p_user_id;

  v_ai_enabled := coalesce(v_ai_enabled, false);
  v_payment_paused := private.individual_ai_billing_paused(p_user_id);

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
      status = case
        when v_ai_enabled and not v_payment_paused then 'pending'
        else 'needs_review'
      end,
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
      grader_version = case
        when v_ai_enabled and not v_payment_paused then 'b7-v6-server-regrade'
        when v_ai_enabled and v_payment_paused then 'manual-payment-v1'
        else 'manual-v1'
      end,
      updated_at = now()
  where e.id = p_evaluation_id;

  return true;
end;
$function$;

revoke all on function public.requeue_response_evaluation_server(uuid, uuid, text)
  from public, anon, authenticated;
grant execute on function public.requeue_response_evaluation_server(uuid, uuid, text)
  to service_role;
