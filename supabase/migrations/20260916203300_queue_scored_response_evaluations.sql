-- Queue AI evaluation work when a scored open/team answer is actually saved.
-- This trigger only creates/resets a lightweight pending row. It never calls AI,
-- so the student request is not coupled to grading latency.

create or replace function public.sync_scored_response_evaluation()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_block jsonb;
  v_rubric jsonb;
  v_points integer;
  v_sum integer;
begin
  -- Re-saving byte-for-byte identical content must not invalidate a completed
  -- grade. Keep only the source timestamp aligned with the response row.
  if tg_op = 'UPDATE' and new.answer is not distinct from old.answer then
    if tg_table_name = 'responses' then
      update public.response_evaluations
      set source_updated_at = new.updated_at
      where response_id = new.id;
    elsif tg_table_name = 'team_responses' then
      update public.response_evaluations
      set source_updated_at = new.updated_at
      where team_response_id = new.id;
    end if;
    return new;
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
  where s.id = new.session_id
    and block->>'id' = new.block_id
  limit 1;

  if v_block is null then
    return new;
  end if;

  if tg_table_name = 'responses' then
    if v_block->>'type' not in ('open_text', 'exit_ticket') then
      return new;
    end if;
  elsif tg_table_name = 'team_responses' then
    if v_block->>'type' <> 'team_task' then
      return new;
    end if;
  else
    return new;
  end if;

  if jsonb_typeof(v_block->'points') <> 'number'
     or coalesce(v_block->>'points', '') !~ '^[0-9]+$' then
    return new;
  end if;

  v_points := (v_block->>'points')::integer;
  if v_points < 1 or v_points > 20 then
    return new;
  end if;

  v_rubric := v_block->'gradingRubric';
  if jsonb_typeof(v_rubric) <> 'array'
     or jsonb_array_length(v_rubric) < 1
     or jsonb_array_length(v_rubric) > 6 then
    return new;
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
    return new;
  end if;

  if (
    select count(*)
    from jsonb_array_elements(v_rubric)
  ) <> (
    select count(distinct c->>'id')
    from jsonb_array_elements(v_rubric) c
  ) then
    return new;
  end if;

  select coalesce(sum((c->>'maxPoints')::integer), 0)
  into v_sum
  from jsonb_array_elements(v_rubric) c;

  if v_sum <> v_points then
    return new;
  end if;

  if tg_table_name = 'responses' then
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
      new.session_id,
      new.block_id,
      new.participant_id,
      null,
      new.id,
      null,
      new.updated_at,
      'pending',
      v_points,
      v_rubric,
      new.answer,
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
      'b7-v1',
      now()
    )
    on conflict (response_id) do update
    set session_id = excluded.session_id,
        block_id = excluded.block_id,
        participant_id = excluded.participant_id,
        team_id = null,
        team_response_id = null,
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
        grader_version = 'b7-v1',
        updated_at = now();
  else
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
      new.session_id,
      new.block_id,
      null,
      new.team_id,
      null,
      new.id,
      new.updated_at,
      'pending',
      v_points,
      v_rubric,
      new.answer,
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
      'b7-v1',
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
        grader_version = 'b7-v1',
        updated_at = now();
  end if;

  return new;
end;
$$;

revoke all on function public.sync_scored_response_evaluation() from public, anon, authenticated;

drop trigger if exists queue_scored_individual_response_evaluation on public.responses;
create trigger queue_scored_individual_response_evaluation
after insert or update of answer on public.responses
for each row execute function public.sync_scored_response_evaluation();

drop trigger if exists queue_scored_team_response_evaluation on public.team_responses;
create trigger queue_scored_team_response_evaluation
after insert or update of answer on public.team_responses
for each row execute function public.sync_scored_response_evaluation();
