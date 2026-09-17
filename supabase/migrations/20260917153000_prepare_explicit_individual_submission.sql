-- Prepare explicit submit semantics for scored individual responses without changing
-- current production behavior yet. The legacy answer trigger is dropped only after
-- the compatible application code is deployed.

alter table public.responses
  add column if not exists submitted_answer jsonb null,
  add column if not exists submitted_at timestamptz null;

-- Before explicit-submit semantics, every persisted individual response was
-- effectively treated as submitted. Preserve that meaning for existing data.
update public.responses
set submitted_answer = answer,
    submitted_at = updated_at
where submitted_answer is null;

create index if not exists responses_submitted_idx
  on public.responses(session_id, block_id, submitted_at)
  where submitted_at is not null;

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

  select block
  into v_block
  from public.sessions s
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

  -- A newer explicit submit may replace a still-pending snapshot without
  -- creating another provider call. Once grading has started, the student can
  -- never reset the evaluation back to pending.
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
      grader_version = 'b7-v4-explicit-submit',
      updated_at = now()
  where response_id = v_response.id
    and status = 'pending'
    and answer_snapshot is distinct from v_response.submitted_answer;

  if found then return true; end if;

  -- Any existing evaluation that is identical, grading, graded, failed, or
  -- waiting for teacher review is a hard cost boundary for student actions.
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
    v_response.id, null, v_response.submitted_at, 'pending', v_points, v_rubric,
    v_response.submitted_answer, '[]'::jsonb, null, null, null, null, null,
    null, null, null, false, null, null, 'b7-v4-explicit-submit', now()
  )
  on conflict (response_id) do nothing;

  return found;
end;
$$;

revoke all on function public.queue_submitted_response_evaluation(uuid) from public, anon, authenticated;
grant execute on function public.queue_submitted_response_evaluation(uuid) to service_role;

-- Harden the already-explicit team submit path with the same cost boundary.
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

  select block
  into v_block
  from public.sessions s
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
      grader_version = 'b7-v4-explicit-submit',
      updated_at = now()
  where team_response_id = v_response.id
    and status = 'pending'
    and answer_snapshot is distinct from v_response.submitted_answer;

  if found then return true; end if;

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
    v_response.id, v_response.submitted_at, 'pending', v_points, v_rubric,
    v_response.submitted_answer, '[]'::jsonb, null, null, null, null, null,
    null, null, null, false, null, null, 'b7-v4-explicit-submit', now()
  )
  on conflict (team_response_id) do nothing;

  return found;
end;
$$;

revoke all on function public.queue_submitted_team_response_evaluation(uuid) from public, anon, authenticated;
grant execute on function public.queue_submitted_team_response_evaluation(uuid) to service_role;
