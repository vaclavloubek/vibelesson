-- Move AI response grading out of the teacher browser.
--
-- Pending evaluations are dispatched asynchronously with pg_net to a Vercel
-- worker endpoint. The endpoint never receives a database secret: it gets a
-- short-lived one-time 256-bit capability. Only the SHA-256 hash is persisted.
-- SECURITY DEFINER RPCs expose only claim/finish/fail operations scoped by that
-- capability. Browser users never receive the raw capability.

create extension if not exists pg_net;

create table if not exists private.grading_jobs (
  evaluation_id uuid primary key
    references public.response_evaluations(id) on delete cascade,
  token_hash text not null unique
    check (char_length(token_hash) = 64),
  status text not null default 'pending'
    check (status in ('pending', 'claimed')),
  attempt_count integer not null default 1
    check (attempt_count >= 1),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  claimed_at timestamptz
);

alter table private.grading_jobs enable row level security;
revoke all on table private.grading_jobs from public, anon, authenticated, service_role;

create or replace function private.dispatch_response_evaluation_job(
  p_evaluation_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_token text;
  v_hash text;
begin
  if not exists (
    select 1
    from public.response_evaluations e
    join public.sessions s on s.id = e.session_id
    join public.profiles p on p.id = s.teacher_id
    where e.id = p_evaluation_id
      and (coalesce(p.ai_grading_enabled, false) or p.role = 'admin')
      and (
        e.status = 'pending'
        or (e.status = 'grading' and e.updated_at < now() - interval '5 minutes')
      )
  ) then
    return false;
  end if;

  v_token := encode(extensions.gen_random_bytes(32), 'hex');
  v_hash := encode(extensions.digest(v_token, 'sha256'), 'hex');

  insert into private.grading_jobs (
    evaluation_id,
    token_hash,
    status,
    attempt_count,
    created_at,
    expires_at,
    claimed_at
  )
  values (
    p_evaluation_id,
    v_hash,
    'pending',
    1,
    now(),
    now() + interval '15 minutes',
    null
  )
  on conflict (evaluation_id) do update
  set token_hash = excluded.token_hash,
      status = 'pending',
      attempt_count = private.grading_jobs.attempt_count + 1,
      created_at = now(),
      expires_at = now() + interval '15 minutes',
      claimed_at = null;

  perform net.http_post(
    url := 'https://www.syllonaut.com/api/internal/grading/jobs',
    body := jsonb_build_object('token', v_token),
    headers := '{"Content-Type":"application/json"}'::jsonb,
    timeout_milliseconds := 5000
  );

  return true;
end;
$function$;

revoke all on function private.dispatch_response_evaluation_job(uuid)
  from public, anon, authenticated, service_role;

create or replace function private.enqueue_server_grading_job()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
begin
  if new.status <> 'pending' then
    return new;
  end if;

  if tg_op = 'UPDATE'
     and old.status = 'pending'
     and old.source_updated_at is not distinct from new.source_updated_at then
    return new;
  end if;

  perform private.dispatch_response_evaluation_job(new.id);
  return new;
end;
$function$;

revoke all on function private.enqueue_server_grading_job()
  from public, anon, authenticated, service_role;

drop trigger if exists enqueue_server_grading_job on public.response_evaluations;
create trigger enqueue_server_grading_job
after insert or update of status, source_updated_at
on public.response_evaluations
for each row
execute function private.enqueue_server_grading_job();

create or replace function public.claim_grading_job(
  p_token text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_hash text;
  v_evaluation_id uuid;
  v_count integer := 0;
  v_result jsonb;
begin
  if p_token is null or p_token !~ '^[0-9a-fA-F]{64}$' then
    return null;
  end if;

  v_hash := encode(extensions.digest(lower(p_token), 'sha256'), 'hex');

  select j.evaluation_id
  into v_evaluation_id
  from private.grading_jobs j
  where j.token_hash = v_hash
    and j.status = 'pending'
    and j.expires_at > now()
  for update;

  if v_evaluation_id is null then
    return null;
  end if;

  update public.response_evaluations e
  set status = 'grading',
      error = null,
      updated_at = now()
  where e.id = v_evaluation_id
    and (
      e.status = 'pending'
      or (e.status = 'grading' and e.updated_at < now() - interval '5 minutes')
    )
    and exists (
      select 1
      from public.sessions s
      join public.profiles p on p.id = s.teacher_id
      where s.id = e.session_id
        and (coalesce(p.ai_grading_enabled, false) or p.role = 'admin')
    );

  get diagnostics v_count = row_count;
  if v_count = 0 then
    delete from private.grading_jobs where evaluation_id = v_evaluation_id;
    return null;
  end if;

  update private.grading_jobs
  set status = 'claimed',
      claimed_at = now()
  where evaluation_id = v_evaluation_id
    and token_hash = v_hash;

  select jsonb_build_object(
    'id', e.id,
    'session_id', e.session_id,
    'block_id', e.block_id,
    'answer_snapshot', e.answer_snapshot,
    'rubric', e.rubric,
    'max_points', e.max_points,
    'source_updated_at', e.source_updated_at,
    'grader_version', e.grader_version,
    'lesson_snapshot', s.lesson_snapshot
  )
  into v_result
  from public.response_evaluations e
  join public.sessions s on s.id = e.session_id
  where e.id = v_evaluation_id;

  return v_result;
end;
$function$;

revoke all on function public.claim_grading_job(text)
  from public, authenticated, service_role;
grant execute on function public.claim_grading_job(text) to anon;

create or replace function public.finish_grading_job(
  p_token text,
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
  if p_token is null or p_token !~ '^[0-9a-fA-F]{64}$' then
    return false;
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

  select e.rubric, e.max_points
  into v_rubric, v_max_points
  from public.response_evaluations e
  where e.id = v_evaluation_id
    and e.status = 'grading';

  if not found then
    delete from private.grading_jobs where evaluation_id = v_evaluation_id;
    return false;
  end if;

  if p_ai_score < 0 or p_ai_score > v_max_points then
    raise exception 'AI score out of range' using errcode = '22023';
  end if;

  if p_confidence < 0 or p_confidence > 1 then
    raise exception 'Confidence out of range' using errcode = '22023';
  end if;

  if p_rationale is null
     or char_length(btrim(p_rationale)) < 1
     or char_length(p_rationale) > 2000 then
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
  where e.id = v_evaluation_id
    and e.status = 'grading';

  get diagnostics v_count = row_count;
  if v_count = 0 then
    return false;
  end if;

  delete from private.grading_jobs
  where evaluation_id = v_evaluation_id
    and token_hash = v_hash;

  return true;
end;
$function$;

revoke all on function public.finish_grading_job(
  text, integer, text, double precision, jsonb, text, numeric
) from public, authenticated, service_role;
grant execute on function public.finish_grading_job(
  text, integer, text, double precision, jsonb, text, numeric
) to anon;

create or replace function public.fail_grading_job(
  p_token text,
  p_error text
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

  v_hash := encode(extensions.digest(lower(p_token), 'sha256'), 'hex');

  select j.evaluation_id
  into v_evaluation_id
  from private.grading_jobs j
  where j.token_hash = v_hash
    and j.status = 'claimed'
  for update;

  if v_evaluation_id is null then
    return false;
  end if;

  update public.response_evaluations e
  set status = 'failed',
      error = left(coalesce(nullif(btrim(p_error), ''), 'AI grading failed'), 1000),
      updated_at = now()
  where e.id = v_evaluation_id
    and e.status = 'grading';

  get diagnostics v_count = row_count;

  delete from private.grading_jobs
  where evaluation_id = v_evaluation_id
    and token_hash = v_hash;

  return v_count > 0;
end;
$function$;

revoke all on function public.fail_grading_job(text, text)
  from public, authenticated, service_role;
grant execute on function public.fail_grading_job(text, text) to anon;

create or replace function private.redispatch_server_grading_jobs()
returns integer
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_evaluation_id uuid;
  v_dispatched integer := 0;
begin
  delete from private.grading_jobs j
  using public.response_evaluations e
  where e.id = j.evaluation_id
    and e.status not in ('pending', 'grading');

  for v_evaluation_id in
    select e.id
    from public.response_evaluations e
    join public.sessions s on s.id = e.session_id
    join public.profiles p on p.id = s.teacher_id
    left join private.grading_jobs j on j.evaluation_id = e.id
    where (coalesce(p.ai_grading_enabled, false) or p.role = 'admin')
      and (
        (
          e.status = 'pending'
          and e.source_updated_at <= now() - interval '2.5 seconds'
          and (
            j.evaluation_id is null
            or j.expires_at <= now()
            or (j.status = 'pending' and j.created_at < now() - interval '45 seconds')
          )
        )
        or (
          e.status = 'grading'
          and e.updated_at < now() - interval '5 minutes'
        )
      )
    order by coalesce(e.source_updated_at, e.created_at)
    limit 20
  loop
    if private.dispatch_response_evaluation_job(v_evaluation_id) then
      v_dispatched := v_dispatched + 1;
    end if;
  end loop;

  return v_dispatched;
end;
$function$;

revoke all on function private.redispatch_server_grading_jobs()
  from public, anon, authenticated, service_role;

do $do$
begin
  begin
    perform cron.unschedule('syllonaut-server-grading-retry');
  exception
    when others then null;
  end;

  perform cron.schedule(
    'syllonaut-server-grading-retry',
    '* * * * *',
    $cron$select private.redispatch_server_grading_jobs();$cron$
  );
end;
$do$;

select private.redispatch_server_grading_jobs();
