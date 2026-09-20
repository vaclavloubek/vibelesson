-- Phase 1: add server-only trusted-device write paths without removing legacy callers.
-- This migration is intentionally backward-compatible so the app can switch first.

create or replace function private.personal_trusted_device_hash_valid(
  p_user_id uuid,
  p_token_hash text
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $function$
  select
    exists (
      select 1
      from public.profiles p
      where p.id = p_user_id
    )
    and (
      not private.personal_trusted_device_policy_required(p_user_id)
      or (
        coalesce(p_token_hash ~ '^[0-9a-f]{64}
        and exists (
          select 1
          from private.user_trusted_devices d
          where d.user_id = p_user_id
            and d.token_hash = p_token_hash
            and d.revoked_at is null
        )
      )
    );
$function$;

revoke all on function private.personal_trusted_device_hash_valid(uuid, text)
  from public, anon, authenticated, service_role;

create or replace function public.create_live_session_server(
  p_user_id uuid,
  p_lesson_id uuid,
  p_join_code text,
  p_realtime_key text,
  p_device_token_hash text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_lesson public.lessons%rowtype;
  v_session public.sessions%rowtype;
begin
  if p_user_id is null or p_lesson_id is null then
    raise exception 'invalid_session_request' using errcode = '22023';
  end if;

  if not private.personal_trusted_device_hash_valid(p_user_id, p_device_token_hash) then
    raise exception 'trusted_device_required' using errcode = '42501';
  end if;

  select l.*
  into v_lesson
  from public.lessons l
  where l.id = p_lesson_id
    and l.owner_id = p_user_id;

  if not found then
    raise exception 'lesson_not_found' using errcode = 'P0002';
  end if;

  if v_lesson.organization_origin_id is not null
     and not private.organization_origin_access_enabled(
       p_user_id,
       v_lesson.organization_origin_id
     ) then
    raise exception 'organization_origin_access_required' using errcode = '42501';
  end if;

  insert into public.sessions (
    lesson_id,
    teacher_id,
    join_code,
    status,
    active_block_id,
    lesson_snapshot,
    realtime_key,
    started_at,
    ended_at
  )
  values (
    p_lesson_id,
    p_user_id,
    p_join_code,
    'lobby',
    null,
    v_lesson.lesson,
    p_realtime_key,
    null,
    null
  )
  returning * into v_session;

  return jsonb_build_object(
    'id', v_session.id,
    'join_code', v_session.join_code,
    'status', v_session.status,
    'realtime_key', v_session.realtime_key,
    'lesson_snapshot', v_session.lesson_snapshot
  );
end;
$function$;

revoke all on function public.create_live_session_server(uuid, uuid, text, text, text)
  from public, anon, authenticated;
grant execute on function public.create_live_session_server(uuid, uuid, text, text, text)
  to service_role;

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
      status = case when v_ai_enabled then 'pending' else 'needs_review' end,
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
      grader_version = case when v_ai_enabled then 'b7-v6-server-regrade' else 'manual-v1' end,
      updated_at = now()
  where e.id = p_evaluation_id;

  return true;
end;
$function$;

revoke all on function public.requeue_response_evaluation_server(uuid, uuid, text)
  from public, anon, authenticated;
grant execute on function public.requeue_response_evaluation_server(uuid, uuid, text)
  to service_role;

comment on function public.create_live_session_server(uuid, uuid, text, text, text) is
  'Service-role-only live-session creation using DB-authoritative lesson state and trusted-device validation for paid individual accounts.';
comment on function public.requeue_response_evaluation_server(uuid, uuid, text) is
  'Service-role-only evaluation requeue with trusted-device validation for paid individual accounts.';
, false)
        and exists (
          select 1
          from private.user_trusted_devices d
          where d.user_id = p_user_id
            and d.token_hash = p_token_hash
            and d.revoked_at is null
        )
      )
    );
$function$;

revoke all on function private.personal_trusted_device_hash_valid(uuid, text)
  from public, anon, authenticated, service_role;

create or replace function public.create_live_session_server(
  p_user_id uuid,
  p_lesson_id uuid,
  p_join_code text,
  p_realtime_key text,
  p_device_token_hash text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_lesson public.lessons%rowtype;
  v_session public.sessions%rowtype;
begin
  if p_user_id is null or p_lesson_id is null then
    raise exception 'invalid_session_request' using errcode = '22023';
  end if;

  if not private.personal_trusted_device_hash_valid(p_user_id, p_device_token_hash) then
    raise exception 'trusted_device_required' using errcode = '42501';
  end if;

  select l.*
  into v_lesson
  from public.lessons l
  where l.id = p_lesson_id
    and l.owner_id = p_user_id;

  if not found then
    raise exception 'lesson_not_found' using errcode = 'P0002';
  end if;

  if v_lesson.organization_origin_id is not null
     and not private.organization_origin_access_enabled(
       p_user_id,
       v_lesson.organization_origin_id
     ) then
    raise exception 'organization_origin_access_required' using errcode = '42501';
  end if;

  insert into public.sessions (
    lesson_id,
    teacher_id,
    join_code,
    status,
    active_block_id,
    lesson_snapshot,
    realtime_key,
    started_at,
    ended_at
  )
  values (
    p_lesson_id,
    p_user_id,
    p_join_code,
    'lobby',
    null,
    v_lesson.lesson,
    p_realtime_key,
    null,
    null
  )
  returning * into v_session;

  return jsonb_build_object(
    'id', v_session.id,
    'join_code', v_session.join_code,
    'status', v_session.status,
    'realtime_key', v_session.realtime_key,
    'lesson_snapshot', v_session.lesson_snapshot
  );
end;
$function$;

revoke all on function public.create_live_session_server(uuid, uuid, text, text, text)
  from public, anon, authenticated;
grant execute on function public.create_live_session_server(uuid, uuid, text, text, text)
  to service_role;

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
      status = case when v_ai_enabled then 'pending' else 'needs_review' end,
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
      grader_version = case when v_ai_enabled then 'b7-v6-server-regrade' else 'manual-v1' end,
      updated_at = now()
  where e.id = p_evaluation_id;

  return true;
end;
$function$;

revoke all on function public.requeue_response_evaluation_server(uuid, uuid, text)
  from public, anon, authenticated;
grant execute on function public.requeue_response_evaluation_server(uuid, uuid, text)
  to service_role;

comment on function public.create_live_session_server(uuid, uuid, text, text, text) is
  'Service-role-only live-session creation using DB-authoritative lesson state and trusted-device validation for paid individual accounts.';
comment on function public.requeue_response_evaluation_server(uuid, uuid, text) is
  'Service-role-only evaluation requeue with trusted-device validation for paid individual accounts.';
