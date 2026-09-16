create or replace function public.finish_response_evaluation(
  p_evaluation_id uuid,
  p_ai_score integer,
  p_rationale text,
  p_confidence double precision,
  p_criterion_scores jsonb,
  p_model text,
  p_cost_usd numeric
)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user_id uuid := auth.uid();
  v_rubric jsonb;
  v_max_points integer;
  v_sum integer;
  v_count integer := 0;
begin
  if v_user_id is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;

  select e.rubric, e.max_points
  into v_rubric, v_max_points
  from public.response_evaluations e
  where e.id = p_evaluation_id
    and e.status = 'grading'
    and exists (
      select 1 from public.sessions s
      where s.id = e.session_id
        and s.teacher_id = v_user_id
    );

  if not found then
    return false;
  end if;

  if p_ai_score < 0 or p_ai_score > v_max_points then
    raise exception 'AI score out of range' using errcode = '22023';
  end if;

  if p_confidence < 0 or p_confidence > 1 then
    raise exception 'Confidence out of range' using errcode = '22023';
  end if;

  if p_rationale is null or char_length(btrim(p_rationale)) < 1 or char_length(p_rationale) > 2000 then
    raise exception 'Invalid rationale' using errcode = '22023';
  end if;

  if jsonb_typeof(p_criterion_scores) <> 'array'
     or jsonb_array_length(p_criterion_scores) <> jsonb_array_length(v_rubric) then
    raise exception 'Invalid criterion scores' using errcode = '22023';
  end if;

  if exists (
    select 1
    from jsonb_array_elements(v_rubric) r
    where not exists (
      select 1
      from jsonb_array_elements(p_criterion_scores) c
      where c->>'criterionId' = r->>'id'
        and jsonb_typeof(c->'points') = 'number'
        and (c->>'points')::integer between 0 and (r->>'maxPoints')::integer
        and jsonb_typeof(c->'rationale') = 'string'
        and char_length(btrim(c->>'rationale')) between 1 and 500
    )
  ) then
    raise exception 'Criterion score does not match rubric' using errcode = '22023';
  end if;

  if (
    select count(*)
    from jsonb_array_elements(p_criterion_scores)
  ) <> (
    select count(distinct c->>'criterionId')
    from jsonb_array_elements(p_criterion_scores) c
  ) then
    raise exception 'Duplicate criterion score' using errcode = '22023';
  end if;

  select coalesce(sum((c->>'points')::integer), 0)
  into v_sum
  from jsonb_array_elements(p_criterion_scores) c;

  if v_sum <> p_ai_score then
    raise exception 'Criterion score sum mismatch' using errcode = '22023';
  end if;

  update public.response_evaluations e
  set status = case when p_confidence < 0.70 then 'needs_review' else 'graded' end,
      ai_score = p_ai_score,
      rationale = btrim(p_rationale),
      confidence = p_confidence,
      criterion_scores = p_criterion_scores,
      model = nullif(btrim(p_model), ''),
      cost_usd = p_cost_usd,
      error = null,
      evaluated_at = now(),
      teacher_confirmed = false,
      teacher_reviewed_at = null,
      teacher_note = null,
      updated_at = now()
  where e.id = p_evaluation_id
    and e.status = 'grading'
    and exists (
      select 1 from public.sessions s
      where s.id = e.session_id
        and s.teacher_id = v_user_id
    );

  get diagnostics v_count = row_count;
  return v_count > 0;
end;
$$;

create or replace function public.fail_response_evaluation(
  p_evaluation_id uuid,
  p_error text
)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user_id uuid := auth.uid();
  v_count integer := 0;
begin
  if v_user_id is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;

  update public.response_evaluations e
  set status = 'failed',
      error = left(coalesce(nullif(btrim(p_error), ''), 'AI grading failed'), 1000),
      updated_at = now()
  where e.id = p_evaluation_id
    and e.status = 'grading'
    and exists (
      select 1 from public.sessions s
      where s.id = e.session_id
        and s.teacher_id = v_user_id
    );

  get diagnostics v_count = row_count;
  return v_count > 0;
end;
$$;
