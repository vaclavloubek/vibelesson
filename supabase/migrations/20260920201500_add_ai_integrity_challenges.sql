-- Add short student verification challenges for high AI-use suspicion.
-- Suspicion remains advisory: only a teacher can change the score.

alter table public.response_evaluations
  add column if not exists integrity_challenge_question text,
  add column if not exists integrity_challenge_answer text,
  add column if not exists integrity_challenge_status text not null default 'not_required',
  add column if not exists integrity_challenge_created_at timestamptz,
  add column if not exists integrity_challenge_presented_at timestamptz,
  add column if not exists integrity_challenge_expires_at timestamptz,
  add column if not exists integrity_challenge_submitted_at timestamptz;

alter table public.response_evaluations
  drop constraint if exists response_evaluations_integrity_challenge_status_check,
  drop constraint if exists response_evaluations_integrity_challenge_question_length_check,
  drop constraint if exists response_evaluations_integrity_challenge_answer_length_check;

alter table public.response_evaluations
  add constraint response_evaluations_integrity_challenge_status_check
    check (integrity_challenge_status in ('not_required', 'pending', 'answered', 'expired')),
  add constraint response_evaluations_integrity_challenge_question_length_check
    check (integrity_challenge_question is null or char_length(integrity_challenge_question) between 10 and 500),
  add constraint response_evaluations_integrity_challenge_answer_length_check
    check (integrity_challenge_answer is null or char_length(integrity_challenge_answer) between 1 and 1000);

create index if not exists response_evaluations_pending_integrity_challenge_idx
  on public.response_evaluations (session_id, participant_id, integrity_challenge_created_at desc)
  where integrity_challenge_status = 'pending' and participant_id is not null;

create or replace function public.record_response_integrity_challenge(
  p_evaluation_id uuid,
  p_question text
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
  if p_question is null or char_length(btrim(p_question)) not between 10 and 500 then
    raise exception 'Invalid integrity challenge question' using errcode = '22023';
  end if;

  update public.response_evaluations e
  set integrity_challenge_question = btrim(p_question),
      integrity_challenge_answer = null,
      integrity_challenge_status = 'pending',
      integrity_challenge_created_at = now(),
      integrity_challenge_presented_at = null,
      integrity_challenge_expires_at = null,
      integrity_challenge_submitted_at = null,
      updated_at = now()
  where e.id = p_evaluation_id
    and e.status = 'grading'
    and e.participant_id is not null
    and exists (
      select 1 from public.sessions s
      where s.id = e.session_id and s.teacher_id = v_user_id
    );

  get diagnostics v_count = row_count;
  return v_count > 0;
end;
$function$;

revoke all on function public.record_response_integrity_challenge(uuid, text) from public, anon;
grant execute on function public.record_response_integrity_challenge(uuid, text) to authenticated;

create or replace function public.record_grading_job_integrity_challenge(
  p_token text,
  p_question text
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
  if p_token is null or p_token !~ '^[0-9a-fA-F]{64}$' then return false; end if;
  if p_question is null or char_length(btrim(p_question)) not between 10 and 500 then
    raise exception 'Invalid integrity challenge question' using errcode = '22023';
  end if;

  v_hash := encode(extensions.digest(lower(p_token), 'sha256'), 'hex');
  select j.evaluation_id into v_evaluation_id
  from private.grading_jobs j
  where j.token_hash = v_hash and j.status = 'claimed' and j.expires_at > now()
  for update;

  if v_evaluation_id is null then return false; end if;

  update public.response_evaluations e
  set integrity_challenge_question = btrim(p_question),
      integrity_challenge_answer = null,
      integrity_challenge_status = 'pending',
      integrity_challenge_created_at = now(),
      integrity_challenge_presented_at = null,
      integrity_challenge_expires_at = null,
      integrity_challenge_submitted_at = null,
      updated_at = now()
  where e.id = v_evaluation_id
    and e.status = 'grading'
    and e.participant_id is not null;

  get diagnostics v_count = row_count;
  return v_count > 0;
end;
$function$;

revoke all on function public.record_grading_job_integrity_challenge(text, text)
  from public, authenticated, service_role;
grant execute on function public.record_grading_job_integrity_challenge(text, text) to anon;

create or replace function private.reset_integrity_challenge_on_new_snapshot()
returns trigger
language plpgsql
set search_path = ''
as $function$
begin
  if new.answer_snapshot is distinct from old.answer_snapshot then
    new.integrity_challenge_question := null;
    new.integrity_challenge_answer := null;
    new.integrity_challenge_status := 'not_required';
    new.integrity_challenge_created_at := null;
    new.integrity_challenge_presented_at := null;
    new.integrity_challenge_expires_at := null;
    new.integrity_challenge_submitted_at := null;
  end if;
  return new;
end;
$function$;

revoke all on function private.reset_integrity_challenge_on_new_snapshot()
  from public, anon, authenticated, service_role;

drop trigger if exists reset_integrity_challenge_on_new_snapshot on public.response_evaluations;
create trigger reset_integrity_challenge_on_new_snapshot
before update of answer_snapshot on public.response_evaluations
for each row execute function private.reset_integrity_challenge_on_new_snapshot();
