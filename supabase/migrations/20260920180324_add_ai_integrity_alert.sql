alter table public.response_evaluations
  add column if not exists ai_use_suspicion text not null default 'none'
    check (ai_use_suspicion in ('none', 'low', 'high')),
  add column if not exists ai_use_signals jsonb not null default '[]'::jsonb
    check (jsonb_typeof(ai_use_signals) = 'array');

comment on column public.response_evaluations.ai_use_suspicion is
  'Independent AI-use integrity signal. Never changes the numeric score automatically.';
comment on column public.response_evaluations.ai_use_signals is
  'Up to three short text-pattern signals supporting a high AI-use suspicion alert.';

create or replace function public.finish_response_evaluation_v2(
  p_evaluation_id uuid,
  p_ai_score integer,
  p_rationale text,
  p_confidence double precision,
  p_criterion_scores jsonb,
  p_ai_use_suspicion text,
  p_ai_use_signals jsonb,
  p_model text,
  p_cost_usd numeric
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $function$
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

  if not found then return false; end if;

  if p_ai_score < 0 or p_ai_score > v_max_points then
    raise exception 'AI score out of range' using errcode = '22023';
  end if;
  if p_confidence < 0 or p_confidence > 1 then
    raise exception 'Confidence out of range' using errcode = '22023';
  end if;
  if p_cost_usd is not null and p_cost_usd < 0 then
    raise exception 'AI grading cost must be nonnegative' using errcode = '22023';
  end if;
  if p_rationale is null
     or char_length(btrim(p_rationale)) < 1
     or char_length(p_rationale) > 2000 then
    raise exception 'Invalid rationale' using errcode = '22023';
  end if;
  if p_ai_use_suspicion is null
     or p_ai_use_suspicion not in ('none', 'low', 'high') then
    raise exception 'Invalid AI-use suspicion' using errcode = '22023';
  end if;
  if p_ai_use_signals is null
     or jsonb_typeof(p_ai_use_signals) <> 'array'
     or jsonb_array_length(p_ai_use_signals) > 3 then
    raise exception 'Invalid AI-use signals' using errcode = '22023';
  end if;
  if exists (
    select 1
    from jsonb_array_elements(p_ai_use_signals) signal
    where jsonb_typeof(signal) <> 'string'
       or char_length(btrim(signal #>> '{}')) not between 1 and 240
  ) then
    raise exception 'Invalid AI-use signal item' using errcode = '22023';
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
    select count(*) from jsonb_array_elements(p_criterion_scores)
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
  set status = case
        when p_confidence < 0.70 or p_ai_use_suspicion = 'high' then 'needs_review'
        else 'graded'
      end,
      ai_score = p_ai_score,
      rationale = btrim(p_rationale),
      confidence = p_confidence,
      ai_use_suspicion = p_ai_use_suspicion,
      ai_use_signals = p_ai_use_signals,
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
  if v_count > 0 then
    perform private.complete_ai_grading_budget(p_evaluation_id, p_cost_usd, true);
  end if;
  return v_count > 0;
end;
$function$;

revoke all on function public.finish_response_evaluation_v2(
  uuid, integer, text, double precision, jsonb, text, jsonb, text, numeric
) from public, anon;
grant execute on function public.finish_response_evaluation_v2(
  uuid, integer, text, double precision, jsonb, text, jsonb, text, numeric
) to authenticated;

create or replace function public.finish_grading_job_v2(
  p_token text,
  p_ai_score integer,
  p_rationale text,
  p_confidence double precision,
  p_criterion_scores jsonb,
  p_ai_use_suspicion text,
  p_ai_use_signals jsonb,
  p_model text,
  p_cost_usd numeric
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_hash text;
  v_evaluation_id uuid;
  v_rubric jsonb;
  v_max_points integer;
  v_sum integer;
  v_count integer := 0;
begin
  if p_token is null or p_token !~ '^[0-9a-fA-F]{64}$' then return false; end if;

  v_hash := encode(extensions.digest(lower(p_token), 'sha256'), 'hex');

  select j.evaluation_id
  into v_evaluation_id
  from private.grading_jobs j
  where j.token_hash = v_hash
    and j.status = 'claimed'
    and j.expires_at > now()
  for update;

  if v_evaluation_id is null then return false; end if;

  select e.rubric, e.max_points
  into v_rubric, v_max_points
  from public.response_evaluations e
  where e.id = v_evaluation_id
    and e.status = 'grading';

  if not found then
    perform private.complete_ai_grading_budget(v_evaluation_id, null, false);
    delete from private.grading_jobs where evaluation_id = v_evaluation_id;
    return false;
  end if;

  if p_ai_score < 0 or p_ai_score > v_max_points then
    raise exception 'AI score out of range' using errcode = '22023';
  end if;
  if p_confidence < 0 or p_confidence > 1 then
    raise exception 'Confidence out of range' using errcode = '22023';
  end if;
  if p_cost_usd is not null and p_cost_usd < 0 then
    raise exception 'AI grading cost must be nonnegative' using errcode = '22023';
  end if;
  if p_rationale is null
     or char_length(btrim(p_rationale)) < 1
     or char_length(p_rationale) > 2000 then
    raise exception 'Invalid rationale' using errcode = '22023';
  end if;
  if p_ai_use_suspicion is null
     or p_ai_use_suspicion not in ('none', 'low', 'high') then
    raise exception 'Invalid AI-use suspicion' using errcode = '22023';
  end if;
  if p_ai_use_signals is null
     or jsonb_typeof(p_ai_use_signals) <> 'array'
     or jsonb_array_length(p_ai_use_signals) > 3 then
    raise exception 'Invalid AI-use signals' using errcode = '22023';
  end if;
  if exists (
    select 1
    from jsonb_array_elements(p_ai_use_signals) signal
    where jsonb_typeof(signal) <> 'string'
       or char_length(btrim(signal #>> '{}')) not between 1 and 240
  ) then
    raise exception 'Invalid AI-use signal item' using errcode = '22023';
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
    select count(*) from jsonb_array_elements(p_criterion_scores)
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
  set status = case
        when p_confidence < 0.70 or p_ai_use_suspicion = 'high' then 'needs_review'
        else 'graded'
      end,
      ai_score = p_ai_score,
      rationale = btrim(p_rationale),
      confidence = p_confidence,
      ai_use_suspicion = p_ai_use_suspicion,
      ai_use_signals = p_ai_use_signals,
      criterion_scores = p_criterion_scores,
      model = nullif(btrim(p_model), ''),
      cost_usd = p_cost_usd,
      error = null,
      evaluated_at = now(),
      teacher_confirmed = false,
      teacher_reviewed_at = null,
      teacher_note = null,
      updated_at = now()
  where e.id = v_evaluation_id
    and e.status = 'grading';

  get diagnostics v_count = row_count;
  if v_count = 0 then
    perform private.complete_ai_grading_budget(v_evaluation_id, null, false);
    return false;
  end if;

  perform private.complete_ai_grading_budget(v_evaluation_id, p_cost_usd, true);

  delete from private.grading_jobs
  where evaluation_id = v_evaluation_id
    and token_hash = v_hash;

  return true;
end;
$function$;

revoke all on function public.finish_grading_job_v2(
  text, integer, text, double precision, jsonb, text, jsonb, text, numeric
) from public, authenticated, service_role;
grant execute on function public.finish_grading_job_v2(
  text, integer, text, double precision, jsonb, text, jsonb, text, numeric
) to anon;
