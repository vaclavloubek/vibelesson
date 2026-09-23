-- Replace database-originated HTTP grading dispatch with a private durable outbox.
-- The Vercel worker claims one row over the server-only Neon connection. A
-- one-time capability is returned to that worker but only its hash is stored.

create table if not exists private.grading_dispatch_outbox (
  evaluation_id uuid primary key references public.response_evaluations(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'processing', 'failed')),
  attempt_count integer not null default 0 check (attempt_count >= 0),
  available_at timestamptz not null default now(),
  lease_expires_at timestamptz,
  worker_id text,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists grading_dispatch_outbox_claim_idx
  on private.grading_dispatch_outbox (available_at, created_at)
  where status in ('pending', 'processing');

revoke all on table private.grading_dispatch_outbox
  from public, anon, authenticated, service_role;

create or replace function private.dispatch_response_evaluation_job(p_evaluation_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_user_id uuid;
begin
  select s.teacher_id
  into v_user_id
  from public.response_evaluations e
  join public.sessions s on s.id = e.session_id
  where e.id = p_evaluation_id;

  if v_user_id is not null
     and private.effective_ai_billing_paused(v_user_id) then
    update public.response_evaluations
    set status = 'needs_review',
        grader_version = 'manual-payment-v1',
        error = null,
        updated_at = now()
    where id = p_evaluation_id
      and (
        status = 'pending'
        or (status = 'grading' and updated_at < now() - interval '5 minutes')
      );

    delete from private.grading_jobs where evaluation_id = p_evaluation_id;
    delete from private.grading_dispatch_outbox where evaluation_id = p_evaluation_id;
    return false;
  end if;

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

  -- Invalidate a stale in-flight capability before making the latest snapshot
  -- available to the worker again.
  delete from private.grading_jobs where evaluation_id = p_evaluation_id;

  insert into private.grading_dispatch_outbox (
    evaluation_id, status, available_at, lease_expires_at, worker_id, last_error, updated_at
  ) values (
    p_evaluation_id, 'pending', now(), null, null, null, now()
  )
  on conflict (evaluation_id) do update
  set status = 'pending',
      available_at = now(),
      lease_expires_at = null,
      worker_id = null,
      last_error = null,
      updated_at = now();

  return true;
end;
$function$;

revoke all on function private.dispatch_response_evaluation_job(uuid)
  from public, anon, authenticated, service_role;

create or replace function private.claim_next_grading_outbox_job(
  p_worker_id text,
  p_lease_seconds integer default 90
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $function$
declare
  v_evaluation_id uuid;
  v_token text;
  v_hash text;
  v_result jsonb;
begin
  if p_worker_id is null
     or char_length(btrim(p_worker_id)) not between 1 and 120
     or p_lease_seconds not between 30 and 300 then
    raise exception 'Invalid grading worker claim parameters' using errcode = '22023';
  end if;

  select o.evaluation_id
  into v_evaluation_id
  from private.grading_dispatch_outbox o
  where o.available_at <= now()
    and (
      o.status = 'pending'
      or (o.status = 'processing' and o.lease_expires_at <= now())
    )
  order by o.available_at, o.created_at
  for update skip locked
  limit 1;

  if v_evaluation_id is null then return null; end if;

  delete from private.grading_jobs where evaluation_id = v_evaluation_id;
  v_token := encode(extensions.gen_random_bytes(32), 'hex');
  v_hash := encode(extensions.digest(v_token, 'sha256'), 'hex');

  insert into private.grading_jobs (
    evaluation_id, token_hash, status, attempt_count, created_at, expires_at, claimed_at
  ) values (
    v_evaluation_id, v_hash, 'pending', 1, now(), now() + interval '15 minutes', null
  );

  v_result := public.claim_grading_job(v_token);
  if v_result is null then
    delete from private.grading_dispatch_outbox where evaluation_id = v_evaluation_id;
    return null;
  end if;

  update private.grading_dispatch_outbox
  set status = 'processing',
      attempt_count = attempt_count + 1,
      lease_expires_at = now() + make_interval(secs => p_lease_seconds),
      worker_id = btrim(p_worker_id),
      last_error = null,
      updated_at = now()
  where evaluation_id = v_evaluation_id;

  return v_result || jsonb_build_object('worker_token', v_token);
end;
$function$;

revoke all on function private.claim_next_grading_outbox_job(text, integer)
  from public, anon, authenticated, service_role;

create or replace function private.complete_grading_outbox_job(
  p_evaluation_id uuid,
  p_worker_id text
)
returns boolean
language sql
security invoker
set search_path = ''
as $function$
  delete from private.grading_dispatch_outbox
  where evaluation_id = p_evaluation_id
    and status = 'processing'
    and worker_id = p_worker_id
  returning true;
$function$;

revoke all on function private.complete_grading_outbox_job(uuid, text)
  from public, anon, authenticated, service_role;

create or replace function private.fail_grading_outbox_job(
  p_evaluation_id uuid,
  p_worker_id text,
  p_error text
)
returns boolean
language sql
security invoker
set search_path = ''
as $function$
  update private.grading_dispatch_outbox
  set status = 'failed',
      lease_expires_at = null,
      last_error = left(coalesce(nullif(btrim(p_error), ''), 'AI grading failed'), 1000),
      updated_at = now()
  where evaluation_id = p_evaluation_id
    and status = 'processing'
    and worker_id = p_worker_id
  returning true;
$function$;

revoke all on function private.fail_grading_outbox_job(uuid, text, text)
  from public, anon, authenticated, service_role;

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

  delete from private.grading_dispatch_outbox o
  using public.response_evaluations e
  where e.id = o.evaluation_id
    and e.status not in ('pending', 'grading');

  for v_evaluation_id in
    select e.id
    from public.response_evaluations e
    join public.sessions s on s.id = e.session_id
    join public.profiles p on p.id = s.teacher_id
    left join private.grading_dispatch_outbox o on o.evaluation_id = e.id
    where (coalesce(p.ai_grading_enabled, false) or p.role = 'admin')
      and (
        (
          e.status = 'pending'
          and e.source_updated_at <= now() - interval '2.5 seconds'
          and (o.evaluation_id is null or o.status = 'failed')
        )
        or (
          e.status = 'grading'
          and e.updated_at < now() - interval '5 minutes'
          and (o.evaluation_id is null or o.lease_expires_at <= now())
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

-- The retry loop now belongs to the Vercel worker. Remove the old database
-- scheduler when pg_cron happens to be present in the restored source schema.
do $block$
begin
  if to_regnamespace('cron') is not null then
    begin
      execute $sql$select cron.unschedule('syllonaut-server-grading-retry')$sql$;
    exception when others then null;
    end;
  end if;
end
$block$;

select private.redispatch_server_grading_jobs();
