-- Add a human-in-the-loop integrity check for AI-graded written responses.
-- AI suspicion is evidence for review only: it never changes points by itself.
-- High-confidence suspicion can create a short, time-bounded verification
-- question for an individual participant. The teacher remains the final arbiter.

alter table public.response_evaluations
  add column if not exists ai_suspicion text not null default 'none',
  add column if not exists ai_suspicion_reasons jsonb not null default '[]'::jsonb,
  add column if not exists integrity_challenge_question text,
  add column if not exists integrity_challenge_answer text,
  add column if not exists integrity_challenge_status text not null default 'not_required',
  add column if not exists integrity_challenge_created_at timestamptz,
  add column if not exists integrity_challenge_expires_at timestamptz,
  add column if not exists integrity_challenge_submitted_at timestamptz;

alter table public.response_evaluations
  drop constraint if exists response_evaluations_ai_suspicion_check,
  drop constraint if exists response_evaluations_ai_suspicion_reasons_check,
  drop constraint if exists response_evaluations_integrity_challenge_status_check,
  drop constraint if exists response_evaluations_integrity_challenge_question_length_check,
  drop constraint if exists response_evaluations_integrity_challenge_answer_length_check;

alter table public.response_evaluations
  add constraint response_evaluations_ai_suspicion_check
    check (ai_suspicion in ('none', 'low', 'high')),
  add constraint response_evaluations_ai_suspicion_reasons_check
    check (
      jsonb_typeof(ai_suspicion_reasons) = 'array'
      and jsonb_array_length(ai_suspicion_reasons) <= 3
    ),
  add constraint response_evaluations_integrity_challenge_status_check
    check (integrity_challenge_status in ('not_required', 'pending', 'answered', 'expired')),
  add constraint response_evaluations_integrity_challenge_question_length_check
    check (
      integrity_challenge_question is null
      or char_length(integrity_challenge_question) between 10 and 500
    ),
  add constraint response_evaluations_integrity_challenge_answer_length_check
    check (
      integrity_challenge_answer is null
      or char_length(integrity_challenge_answer) between 1 and 1000
    );

create index if not exists response_evaluations_pending_integrity_challenge_idx
  on public.response_evaluations (session_id, participant_id, integrity_challenge_expires_at)
  where integrity_challenge_status = 'pending'
    and participant_id is not null;

comment on column public.response_evaluations.ai_suspicion is
  'AI-generated-text suspicion signal for teacher review only. Never an automatic penalty.';
comment on column public.response_evaluations.ai_suspicion_reasons is
  'Up to three concrete model-provided reasons for the integrity signal.';
comment on column public.response_evaluations.integrity_challenge_question is
  'Short verification question generated only for high-suspicion individual responses.';
comment on column public.response_evaluations.integrity_challenge_status is
  'Lifecycle of the short verification question.';

create or replace function public.record_response_evaluation_integrity(
  p_evaluation_id uuid,
  p_ai_suspicion text,
  p_ai_suspicion_reasons jsonb,
  p_integrity_challenge_question text
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_user_id uuid := auth.uid();
  v_count integer := 0;
begin
  if v_user_id is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;

  if p_ai_suspicion not in ('none', 'low', 'high') then
    raise exception 'Invalid AI suspicion level' using errcode = '22023';
  end if;

  if p_ai_suspicion_reasons is null
     or jsonb_typeof(p_ai_suspicion_reasons) <> 'array'
     or jsonb_array_length(p_ai_suspicion_reasons) > 3
     or exists (
       select 1
       from jsonb_array_elements(p_ai_suspicion_reasons) item
       where jsonb_typeof(item) <> 'string'
          or char_length(btrim(item #>> '{}')) not between 1 and 240
     ) then
    raise exception 'Invalid AI suspicion reasons' using errcode = '22023';
  end if;

  if p_ai_suspicion = 'none' and jsonb_array_length(p_ai_suspicion_reasons) <> 0 then
    raise exception 'No-suspicion result must not include reasons' using errcode = '22023';
  end if;

  if p_ai_suspicion = 'high'
     and (p_integrity_challenge_question is null
       or char_length(btrim(p_integrity_challenge_question)) not between 10 and 500) then
    raise exception 'High suspicion requires a verification question' using errcode = '22023';
  end if;

  update public.response_evaluations e
  set ai_suspicion = p_ai_suspicion,
      ai_suspicion_reasons = case
        when p_ai_suspicion = 'none' then '[]'::jsonb
        else p_ai_suspicion_reasons
      end,
      integrity_challenge_question = case
        when p_ai_suspicion = 'high' and e.participant_id is not null
          then btrim(p_integrity_challenge_question)
        else null
      end,
      integrity_challenge_answer = null,
      integrity_challenge_status = case
        when p_ai_suspicion = 'high' and e.participant_id is not null then 'pending'
        else 'not_required'
      end,
      integrity_challenge_created_at = case
        when p_ai_suspicion = 'high' and e.participant_id is not null then now()
        else null
      end,
      integrity_challenge_expires_at = case
        when p_ai_suspicion = 'high' and e.participant_id is not null then now() + interval '60 seconds'
        else null
      end,
      integrity_challenge_submitted_at = null,
      updated_at = now()
  where e.id = p_evaluation_id
    and e.status = 'grading'
    and exists (
      select 1
      from public.sessions s
      where s.id = e.session_id
        and s.teacher_id = v_user_id
    );

  get diagnostics v_count = row_count;
  return v_count > 0;
end;
$function$;

revoke all on function public.record_response_evaluation_integrity(uuid, text, jsonb, text)
  from public, anon;
grant execute on function public.record_response_evaluation_integrity(uuid, text, jsonb, text)
  to authenticated;

create or replace function public.record_grading_job_integrity(
  p_token text,
  p_ai_suspicion text,
  p_ai_suspicion_reasons jsonb,
  p_integrity_challenge_question text
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_hash text;
  v_evaluation_id uuid;
  v_count integer := 0;
begin
  if p_token is null or p_token !~ '^[0-9a-fA-F]{64}$' then
    return false;
  end if;

  if p_ai_suspicion not in ('none', 'low', 'high') then
    raise exception 'Invalid AI suspicion level' using errcode = '22023';
  end if;

  if p_ai_suspicion_reasons is null
     or jsonb_typeof(p_ai_suspicion_reasons) <> 'array'
     or jsonb_array_length(p_ai_suspicion_reasons) > 3
     or exists (
       select 1
       from jsonb_array_elements(p_ai_suspicion_reasons) item
       where jsonb_typeof(item) <> 'string'
          or char_length(btrim(item #>> '{}')) not between 1 and 240
     ) then
    raise exception 'Invalid AI suspicion reasons' using errcode = '22023';
  end if;

  if p_ai_suspicion = 'none' and jsonb_array_length(p_ai_suspicion_reasons) <> 0 then
    raise exception 'No-suspicion result must not include reasons' using errcode = '22023';
  end if;

  if p_ai_suspicion = 'high'
     and (p_integrity_challenge_question is null
       or char_length(btrim(p_integrity_challenge_question)) not between 10 and 500) then
    raise exception 'High suspicion requires a verification question' using errcode = '22023';
  end if;

  v_hash := encode(extensions.digest(lower(p_token), 'sha256'), 'hex');

  select j.evaluation_id
  into v_evaluation_id
  from private.grading_jobs j
  where j.token_hash = v_hash
    and j.status = 'claimed'
    and j.expires_at > now()
  for update;

  if v_evaluation_id is null then
    return false;
  end if;

  update public.response_evaluations e
  set ai_suspicion = p_ai_suspicion,
      ai_suspicion_reasons = case
        when p_ai_suspicion = 'none' then '[]'::jsonb
        else p_ai_suspicion_reasons
      end,
      integrity_challenge_question = case
        when p_ai_suspicion = 'high' and e.participant_id is not null
          then btrim(p_integrity_challenge_question)
        else null
      end,
      integrity_challenge_answer = null,
      integrity_challenge_status = case
        when p_ai_suspicion = 'high' and e.participant_id is not null then 'pending'
        else 'not_required'
      end,
      integrity_challenge_created_at = case
        when p_ai_suspicion = 'high' and e.participant_id is not null then now()
        else null
      end,
      integrity_challenge_expires_at = case
        when p_ai_suspicion = 'high' and e.participant_id is not null then now() + interval '60 seconds'
        else null
      end,
      integrity_challenge_submitted_at = null,
      updated_at = now()
  where e.id = v_evaluation_id
    and e.status = 'grading';

  get diagnostics v_count = row_count;
  return v_count > 0;
end;
$function$;

revoke all on function public.record_grading_job_integrity(text, text, jsonb, text)
  from public, authenticated, service_role;
grant execute on function public.record_grading_job_integrity(text, text, jsonb, text)
  to anon;

create or replace function private.reset_response_integrity_on_new_snapshot()
returns trigger
language plpgsql
set search_path = ''
as $function$
begin
  if new.answer_snapshot is distinct from old.answer_snapshot then
    new.ai_suspicion := 'none';
    new.ai_suspicion_reasons := '[]'::jsonb;
    new.integrity_challenge_question := null;
    new.integrity_challenge_answer := null;
    new.integrity_challenge_status := 'not_required';
    new.integrity_challenge_created_at := null;
    new.integrity_challenge_expires_at := null;
    new.integrity_challenge_submitted_at := null;
  end if;
  return new;
end;
$function$;

revoke all on function private.reset_response_integrity_on_new_snapshot()
  from public, anon, authenticated, service_role;

drop trigger if exists a_reset_response_integrity_on_new_snapshot
  on public.response_evaluations;
create trigger a_reset_response_integrity_on_new_snapshot
before update of answer_snapshot
on public.response_evaluations
for each row
execute function private.reset_response_integrity_on_new_snapshot();

create or replace function private.force_high_suspicion_teacher_review()
returns trigger
language plpgsql
set search_path = ''
as $function$
begin
  if new.ai_suspicion = 'high' and new.status = 'graded' then
    new.status := 'needs_review';
  end if;
  return new;
end;
$function$;

revoke all on function private.force_high_suspicion_teacher_review()
  from public, anon, authenticated, service_role;

drop trigger if exists z_force_high_suspicion_teacher_review
  on public.response_evaluations;
create trigger z_force_high_suspicion_teacher_review
before update of status, ai_suspicion
on public.response_evaluations
for each row
execute function private.force_high_suspicion_teacher_review();
