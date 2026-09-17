alter table public.profiles
  add column if not exists ai_grading_enabled boolean not null default false;

update public.profiles
set ai_grading_enabled = true,
    updated_at = now()
where role = 'admin'
  and ai_grading_enabled is distinct from true;

comment on column public.profiles.ai_grading_enabled is
  'Server-authoritative entitlement. True only for plans allowed to use paid AI grading; admin accounts are also treated as entitled.';

create or replace function public.queue_submitted_response_evaluation(p_response_id uuid)
returns boolean
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_response public.responses%rowtype;
  v_block jsonb;
  v_rubric jsonb;
  v_points integer;
  v_sum integer;
  v_ai_enabled boolean := false;
  v_status text;
  v_grader_version text;
begin
  select *
  into v_response
  from public.responses
  where id = p_response_id;

  if not found then return false; end if;

  if v_response.submitted_at is null
     or jsonb_typeof(v_response.submitted_answer) <> 'object'
     or nullif(btrim(v_response.submitted_answer->>'text'), '') is null then
    return false;
  end if;

  select block,
         coalesce(p.ai_grading_enabled, false) or p.role = 'admin'
  into v_block, v_ai_enabled
  from public.sessions s
  join public.profiles p on p.id = s.teacher_id
  cross join lateral jsonb_array_elements(
    case
      when jsonb_typeof(s.lesson_snapshot->'blocks') = 'array'
        then s.lesson_snapshot->'blocks'
      else '[]'::jsonb
    end
  ) as block
  where s.id = v_response.session_id
    and block->>'id' = v_response.block_id
  limit 1;

  if v_block is null or v_block->>'type' not in ('open_text', 'exit_ticket') then
    return false;
  end if;

  if jsonb_typeof(v_block->'points') <> 'number'
     or coalesce(v_block->>'points', '') !~ '^[0-9]+$' then return false; end if;

  v_points := (v_block->>'points')::integer;
  if v_points < 1 or v_points > 20 then return false; end if;

  v_rubric := v_block->'gradingRubric';
  if jsonb_typeof(v_rubric) <> 'array'
     or jsonb_array_length(v_rubric) < 1
     or jsonb_array_length(v_rubric) > 6 then return false; end if;

  if exists (
    select 1
    from jsonb_array_elements(v_rubric) c
    where jsonb_typeof(c) <> 'object'
       or nullif(btrim(c->>'id'), '') is null
       or nullif(btrim(c->>'title'), '') is null
       or nullif(btrim(c->>'description'), '') is null
       or coalesce(c->>'maxPoints', '') !~ '^[0-9]+$'
       or (c->>'maxPoints')::integer not between 1 and 20
  ) then return false; end if;

  if (select count(*) from jsonb_array_elements(v_rubric)) <>
     (select count(distinct c->>'id') from jsonb_array_elements(v_rubric) c) then
    return false;
  end if;

  select coalesce(sum((c->>'maxPoints')::integer), 0)
  into v_sum
  from jsonb_array_elements(v_rubric) c;
  if v_sum <> v_points then return false; end if;

  v_status := case when v_ai_enabled then 'pending' else 'needs_review' end;
  v_grader_version := case when v_ai_enabled then 'b7-v5-ai-entitlement' else 'manual-v1' end;

  if v_ai_enabled then
    update public.response_evaluations
    set source_updated_at = v_response.submitted_at,
        max_points = v_points,
        rubric = v_rubric,
        answer_snapshot = v_response.submitted_answer,
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
        grader_version = v_grader_version,
        updated_at = now()
    where response_id = v_response.id
      and status = 'pending'
      and answer_snapshot is distinct from v_response.submitted_answer;

    if found then return true; end if;
  end if;

  if exists (
    select 1
    from public.response_evaluations
    where response_id = v_response.id
  ) then
    return false;
  end if;

  insert into public.response_evaluations (
    session_id, block_id, participant_id, team_id, response_id, team_response_id,
    source_updated_at, status, max_points, rubric, answer_snapshot,
    criterion_scores, ai_score, teacher_score, rationale, confidence, model,
    cost_usd, error, evaluated_at, teacher_confirmed, teacher_reviewed_at,
    teacher_note, grader_version, updated_at
  ) values (
    v_response.session_id, v_response.block_id, v_response.participant_id, null,
    v_response.id, null, v_response.submitted_at, v_status, v_points, v_rubric,
    v_response.submitted_answer, '[]'::jsonb, null, null, null, null, null,
    null, null, null, false, null, null, v_grader_version, now()
  )
  on conflict (response_id) do nothing;

  return found;
end;
$$;

revoke all on function public.queue_submitted_response_evaluation(uuid) from public, anon, authenticated;
grant execute on function public.queue_submitted_response_evaluation(uuid) to service_role;

create or replace function public.queue_submitted_team_response_evaluation(p_team_response_id uuid)
returns boolean
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_response public.team_responses%rowtype;
  v_block jsonb;
  v_rubric jsonb;
  v_points integer;
  v_sum integer;
  v_ai_enabled boolean := false;
  v_status text;
  v_grader_version text;
begin
  select *
  into v_response
  from public.team_responses
  where id = p_team_response_id;

  if not found then return false; end if;

  if v_response.submitted_at is null
     or jsonb_typeof(v_response.submitted_answer) <> 'object'
     or nullif(btrim(v_response.submitted_answer->>'text'), '') is null then
    return false;
  end if;

  select block,
         coalesce(p.ai_grading_enabled, false) or p.role = 'admin'
  into v_block, v_ai_enabled
  from public.sessions s
  join public.profiles p on p.id = s.teacher_id
  cross join lateral jsonb_array_elements(
    case
      when jsonb_typeof(s.lesson_snapshot->'blocks') = 'array'
        then s.lesson_snapshot->'blocks'
      else '[]'::jsonb
    end
  ) as block
  where s.id = v_response.session_id
    and block->>'id' = v_response.block_id
  limit 1;

  if v_block is null or v_block->>'type' <> 'team_task' then return false; end if;
  if jsonb_typeof(v_block->'points') <> 'number'
     or coalesce(v_block->>'points', '') !~ '^[0-9]+$' then return false; end if;

  v_points := (v_block->>'points')::integer;
  if v_points < 1 or v_points > 20 then return false; end if;

  v_rubric := v_block->'gradingRubric';
  if jsonb_typeof(v_rubric) <> 'array'
     or jsonb_array_length(v_rubric) < 1
     or jsonb_array_length(v_rubric) > 6 then return false; end if;

  if exists (
    select 1
    from jsonb_array_elements(v_rubric) c
    where jsonb_typeof(c) <> 'object'
       or nullif(btrim(c->>'id'), '') is null
       or nullif(btrim(c->>'title'), '') is null
       or nullif(btrim(c->>'description'), '') is null
       or coalesce(c->>'maxPoints', '') !~ '^[0-9]+$'
       or (c->>'maxPoints')::integer not between 1 and 20
  ) then return false; end if;

  if (select count(*) from jsonb_array_elements(v_rubric)) <>
     (select count(distinct c->>'id') from jsonb_array_elements(v_rubric) c) then
    return false;
  end if;

  select coalesce(sum((c->>'maxPoints')::integer), 0)
  into v_sum
  from jsonb_array_elements(v_rubric) c;
  if v_sum <> v_points then return false; end if;

  v_status := case when v_ai_enabled then 'pending' else 'needs_review' end;
  v_grader_version := case when v_ai_enabled then 'b7-v5-ai-entitlement' else 'manual-v1' end;

  if v_ai_enabled then
    update public.response_evaluations
    set source_updated_at = v_response.submitted_at,
        max_points = v_points,
        rubric = v_rubric,
        answer_snapshot = v_response.submitted_answer,
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
        grader_version = v_grader_version,
        updated_at = now()
    where team_response_id = v_response.id
      and status = 'pending'
      and answer_snapshot is distinct from v_response.submitted_answer;

    if found then return true; end if;
  end if;

  if exists (
    select 1
    from public.response_evaluations
    where team_response_id = v_response.id
  ) then
    return false;
  end if;

  insert into public.response_evaluations (
    session_id, block_id, participant_id, team_id, response_id, team_response_id,
    source_updated_at, status, max_points, rubric, answer_snapshot,
    criterion_scores, ai_score, teacher_score, rationale, confidence, model,
    cost_usd, error, evaluated_at, teacher_confirmed, teacher_reviewed_at,
    teacher_note, grader_version, updated_at
  ) values (
    v_response.session_id, v_response.block_id, null, v_response.team_id, null,
    v_response.id, v_response.submitted_at, v_status, v_points, v_rubric,
    v_response.submitted_answer, '[]'::jsonb, null, null, null, null, null,
    null, null, null, false, null, null, v_grader_version, now()
  )
  on conflict (team_response_id) do nothing;

  return found;
end;
$$;

revoke all on function public.queue_submitted_team_response_evaluation(uuid) from public, anon, authenticated;
grant execute on function public.queue_submitted_team_response_evaluation(uuid) to service_role;

create or replace function public.claim_response_evaluation(p_evaluation_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user_id uuid := auth.uid();
  v_result jsonb;
begin
  if v_user_id is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;

  update public.response_evaluations e
  set status = 'grading',
      error = null,
      updated_at = now()
  where e.id = p_evaluation_id
    and exists (
      select 1
      from public.sessions s
      join public.profiles p on p.id = s.teacher_id
      where s.id = e.session_id
        and s.teacher_id = v_user_id
        and (coalesce(p.ai_grading_enabled, false) or p.role = 'admin')
    )
    and (
      e.status in ('pending', 'failed')
      or (e.status = 'grading' and e.updated_at < now() - interval '5 minutes')
    )
  returning jsonb_build_object(
    'id', e.id,
    'session_id', e.session_id,
    'block_id', e.block_id,
    'answer_snapshot', e.answer_snapshot,
    'rubric', e.rubric,
    'max_points', e.max_points,
    'source_updated_at', e.source_updated_at,
    'grader_version', e.grader_version
  ) into v_result;

  return v_result;
end;
$$;

revoke all on function public.claim_response_evaluation(uuid) from public, anon;
grant execute on function public.claim_response_evaluation(uuid) to authenticated;

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
  v_ai_enabled boolean := false;
begin
  if v_user_id is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;

  select e.*
  into v_evaluation
  from public.response_evaluations e
  join public.sessions s on s.id = e.session_id
  where e.id = p_evaluation_id
    and s.teacher_id = v_user_id;

  if not found then return false; end if;
  if v_evaluation.status not in ('graded', 'needs_review', 'failed') then return false; end if;

  select coalesce(p.ai_grading_enabled, false) or p.role = 'admin'
  into v_ai_enabled
  from public.sessions s
  join public.profiles p on p.id = s.teacher_id
  where s.id = v_evaluation.session_id
    and s.teacher_id = v_user_id;

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
      grader_version = case when v_ai_enabled then 'b7-v5-teacher-regrade' else 'manual-v1' end,
      updated_at = now()
  where e.id = p_evaluation_id;

  return true;
end;
$$;

revoke all on function public.requeue_response_evaluation_for_teacher(uuid) from public, anon;
grant execute on function public.requeue_response_evaluation_for_teacher(uuid) to authenticated;

update public.response_evaluations e
set status = 'needs_review',
    ai_score = null,
    rationale = null,
    confidence = null,
    model = null,
    cost_usd = null,
    error = null,
    evaluated_at = null,
    grader_version = 'manual-v1',
    updated_at = now()
from public.sessions s
join public.profiles p on p.id = s.teacher_id
where e.session_id = s.id
  and not (coalesce(p.ai_grading_enabled, false) or p.role = 'admin')
  and e.status in ('pending', 'grading');