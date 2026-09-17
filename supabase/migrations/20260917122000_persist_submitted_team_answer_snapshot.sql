-- Keep the autosaved team draft separate from the version explicitly submitted for grading.

alter table public.team_responses
  add column if not exists submitted_answer jsonb null,
  add column if not exists submitted_at timestamptz null;

-- Before this feature every saved team response was treated as submitted. Preserve
-- that historical meaning for existing sessions and evaluations.
update public.team_responses
set submitted_answer = answer,
    submitted_at = updated_at
where submitted_answer is null
  and jsonb_typeof(answer) = 'object'
  and nullif(btrim(answer->>'text'), '') is not null;

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

  if not found or v_response.submitted_at is null then
    return false;
  end if;

  if jsonb_typeof(v_response.submitted_answer) <> 'object'
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

  if v_block is null or v_block->>'type' <> 'team_task' then
    return false;
  end if;

  if jsonb_typeof(v_block->'points') <> 'number'
     or coalesce(v_block->>'points', '') !~ '^[0-9]+$' then
    return false;
  end if;

  v_points := (v_block->>'points')::integer;
  if v_points < 1 or v_points > 20 then
    return false;
  end if;

  v_rubric := v_block->'gradingRubric';
  if jsonb_typeof(v_rubric) <> 'array'
     or jsonb_array_length(v_rubric) < 1
     or jsonb_array_length(v_rubric) > 6 then
    return false;
  end if;

  if exists (
    select 1
    from jsonb_array_elements(v_rubric) c
    where jsonb_typeof(c) <> 'object'
       or nullif(btrim(c->>'id'), '') is null
       or nullif(btrim(c->>'title'), '') is null
       or nullif(btrim(c->>'description'), '') is null
       or coalesce(c->>'maxPoints', '') !~ '^[0-9]+$'
       or (c->>'maxPoints')::integer not between 1 and 20
  ) then
    return false;
  end if;

  if (
    select count(*) from jsonb_array_elements(v_rubric)
  ) <> (
    select count(distinct c->>'id') from jsonb_array_elements(v_rubric) c
  ) then
    return false;
  end if;

  select coalesce(sum((c->>'maxPoints')::integer), 0)
  into v_sum
  from jsonb_array_elements(v_rubric) c;

  if v_sum <> v_points then
    return false;
  end if;

  -- Re-submitting the exact same submitted version does not create another paid call.
  if exists (
    select 1
    from public.response_evaluations e
    where e.team_response_id = v_response.id
      and e.answer_snapshot is not distinct from v_response.submitted_answer
      and e.status in ('pending', 'grading', 'graded', 'needs_review')
  ) then
    return false;
  end if;

  insert into public.response_evaluations (
    session_id,
    block_id,
    participant_id,
    team_id,
    response_id,
    team_response_id,
    source_updated_at,
    status,
    max_points,
    rubric,
    answer_snapshot,
    criterion_scores,
    ai_score,
    teacher_score,
    rationale,
    confidence,
    model,
    cost_usd,
    error,
    evaluated_at,
    teacher_confirmed,
    teacher_reviewed_at,
    teacher_note,
    grader_version,
    updated_at
  ) values (
    v_response.session_id,
    v_response.block_id,
    null,
    v_response.team_id,
    null,
    v_response.id,
    v_response.submitted_at,
    'pending',
    v_points,
    v_rubric,
    v_response.submitted_answer,
    '[]'::jsonb,
    null,
    null,
    null,
    null,
    null,
    null,
    null,
    null,
    false,
    null,
    null,
    'b7-v3-submitted-snapshot',
    now()
  )
  on conflict (team_response_id) do update
  set session_id = excluded.session_id,
      block_id = excluded.block_id,
      participant_id = null,
      team_id = excluded.team_id,
      response_id = null,
      source_updated_at = excluded.source_updated_at,
      status = 'pending',
      max_points = excluded.max_points,
      rubric = excluded.rubric,
      answer_snapshot = excluded.answer_snapshot,
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
      grader_version = 'b7-v3-submitted-snapshot',
      updated_at = now();

  return true;
end;
$$;

revoke all on function public.queue_submitted_team_response_evaluation(uuid) from public, anon, authenticated;
grant execute on function public.queue_submitted_team_response_evaluation(uuid) to service_role;
