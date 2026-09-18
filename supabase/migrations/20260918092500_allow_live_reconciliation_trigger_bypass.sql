-- Allow trusted Cloudflare live-control reconciliation to converge historical
-- fallback state without weakening ordinary SEC-005 live-write protections.
--
-- The public RPC becomes a narrow SECURITY DEFINER wrapper. After validating
-- the authenticated teacher/session relationship it acquires a transaction-
-- scoped shared advisory lock used only as an internal reconciliation marker.
-- The existing implementation remains unchanged behind an uncallable _impl
-- function. Ordinary API writes never hold this marker and therefore continue
-- through the full live-context/edit-lock triggers.

alter function public.reconcile_live_control_snapshot(uuid, jsonb)
  rename to reconcile_live_control_snapshot_impl;

revoke all on function public.reconcile_live_control_snapshot_impl(uuid, jsonb)
  from public, anon, authenticated, service_role;

create function public.reconcile_live_control_snapshot(
  p_session_id uuid,
  p_snapshot jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  v_user_id uuid := auth.uid();
begin
  if v_user_id is null then
    raise exception 'Authentication required.' using errcode = '42501';
  end if;

  if jsonb_typeof(p_snapshot) <> 'object'
     or p_snapshot->>'sessionId' is distinct from p_session_id::text then
    raise exception 'Invalid live snapshot.' using errcode = '22023';
  end if;

  perform 1
  from public.sessions s
  where s.id = p_session_id
    and s.teacher_id = v_user_id;

  if not found then
    raise exception 'Session not found.' using errcode = '42501';
  end if;

  -- Transaction-local marker. Shared mode allows multiple sessions to
  -- reconcile concurrently; the trigger also requires current_user=postgres.
  perform pg_catalog.pg_advisory_xact_lock_shared(1398365260, 1380270930);

  return public.reconcile_live_control_snapshot_impl(p_session_id, p_snapshot);
end;
$function$;

revoke all on function public.reconcile_live_control_snapshot(uuid, jsonb)
  from public, anon, service_role;
grant execute on function public.reconcile_live_control_snapshot(uuid, jsonb)
  to authenticated;

create or replace function public.enforce_response_live_context()
returns trigger
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_status text;
  v_active_block_id text;
  v_lesson_snapshot jsonb;
  v_revealed_block_ids text[];
  v_block_type text;
begin
  if current_user = 'postgres' and exists (
    select 1
    from pg_catalog.pg_locks l
    where l.pid = pg_catalog.pg_backend_pid()
      and l.locktype = 'advisory'
      and l.mode = 'ShareLock'
      and l.granted
      and l.classid::bigint = 1398365260
      and l.objid::bigint = 1380270930
      and l.objsubid = 2
  ) then
    return new;
  end if;

  select s.status, s.active_block_id, s.lesson_snapshot, s.revealed_block_ids
  into v_status, v_active_block_id, v_lesson_snapshot, v_revealed_block_ids
  from public.sessions s
  where s.id = new.session_id
  for share;

  if not found then
    raise exception using errcode = '23503', message = 'response_session_not_found';
  end if;

  if v_status <> 'live' then
    raise exception using errcode = 'P0001', message = 'response_session_not_live';
  end if;

  if v_active_block_id is distinct from new.block_id then
    raise exception using errcode = 'P0001', message = 'response_block_not_active';
  end if;

  select block->>'type'
  into v_block_type
  from jsonb_array_elements(
    case
      when jsonb_typeof(v_lesson_snapshot->'blocks') = 'array'
        then v_lesson_snapshot->'blocks'
      else '[]'::jsonb
    end
  ) as block
  where block->>'id' = new.block_id
  limit 1;

  if v_block_type is null then
    raise exception using errcode = 'P0001', message = 'response_block_not_found';
  end if;

  if v_block_type not in ('poll', 'quiz', 'open_text', 'exit_ticket', 'ranking') then
    raise exception using errcode = 'P0001', message = 'response_block_not_writable';
  end if;

  if v_block_type in ('poll', 'quiz')
     and new.block_id = any(coalesce(v_revealed_block_ids, '{}'::text[])) then
    raise exception using errcode = 'P0001', message = 'response_results_revealed';
  end if;

  return new;
end;
$$;

create or replace function public.enforce_team_response_edit_lock()
returns trigger
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_status text;
  v_active_block_id text;
  v_lesson_snapshot jsonb;
  v_block_type text;
begin
  if current_user = 'postgres' and exists (
    select 1
    from pg_catalog.pg_locks l
    where l.pid = pg_catalog.pg_backend_pid()
      and l.locktype = 'advisory'
      and l.mode = 'ShareLock'
      and l.granted
      and l.classid::bigint = 1398365260
      and l.objid::bigint = 1380270930
      and l.objsubid = 2
  ) then
    return new;
  end if;

  if new.updated_by_participant_id is null then
    raise exception using errcode = 'P0001', message = 'team_response_participant_required';
  end if;

  select s.status, s.active_block_id, s.lesson_snapshot
  into v_status, v_active_block_id, v_lesson_snapshot
  from public.sessions s
  where s.id = new.session_id
  for share;

  if not found then
    raise exception using errcode = '23503', message = 'team_response_session_not_found';
  end if;

  if v_status <> 'live' then
    raise exception using errcode = 'P0001', message = 'team_response_session_not_live';
  end if;

  if v_active_block_id is distinct from new.block_id then
    raise exception using errcode = 'P0001', message = 'team_response_block_not_active';
  end if;

  select block->>'type'
  into v_block_type
  from jsonb_array_elements(
    case
      when jsonb_typeof(v_lesson_snapshot->'blocks') = 'array'
        then v_lesson_snapshot->'blocks'
      else '[]'::jsonb
    end
  ) as block
  where block->>'id' = new.block_id
  limit 1;

  if v_block_type is distinct from 'team_task' then
    raise exception using errcode = 'P0001', message = 'team_response_block_not_team_task';
  end if;

  perform 1
  from public.teams t
  where t.id = new.team_id
    and t.session_id = new.session_id
  for key share;

  if not found then
    raise exception using errcode = 'P0001', message = 'team_response_team_not_in_session';
  end if;

  perform 1
  from public.participants p
  where p.id = new.updated_by_participant_id
    and p.session_id = new.session_id
    and p.team_id = new.team_id
  for share;

  if not found then
    raise exception using errcode = 'P0001', message = 'team_response_participant_not_in_team';
  end if;

  perform 1
  from public.team_edit_locks l
  where l.session_id = new.session_id
    and l.team_id = new.team_id
    and l.block_id = new.block_id
    and l.participant_id = new.updated_by_participant_id
    and l.expires_at > now()
  for share;

  if not found then
    raise exception using errcode = 'P0001', message = 'team_response_active_edit_lock_required';
  end if;

  return new;
end;
$$;

create or replace function public.enforce_participant_team_change()
returns trigger
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_status text;
begin
  if current_user = 'postgres' and exists (
    select 1
    from pg_catalog.pg_locks l
    where l.pid = pg_catalog.pg_backend_pid()
      and l.locktype = 'advisory'
      and l.mode = 'ShareLock'
      and l.granted
      and l.classid::bigint = 1398365260
      and l.objid::bigint = 1380270930
      and l.objsubid = 2
  ) then
    return new;
  end if;

  select s.status
  into v_status
  from public.sessions s
  where s.id = new.session_id
  for share;

  if not found then
    raise exception using errcode = '23503', message = 'participant_team_session_not_found';
  end if;

  if v_status = 'ended' then
    raise exception using errcode = 'P0001', message = 'participant_team_session_ended';
  end if;

  if new.team_id is not distinct from old.team_id then
    return new;
  end if;

  if v_status = 'live' and old.team_id is not null then
    raise exception using errcode = 'P0001', message = 'participant_team_change_locked';
  end if;

  if new.team_id is not null then
    perform 1
    from public.teams t
    where t.id = new.team_id
      and t.session_id = new.session_id
    for key share;

    if not found then
      raise exception using errcode = 'P0001', message = 'participant_team_not_in_session';
    end if;
  end if;

  return new;
end;
$$;

revoke all on function public.enforce_response_live_context()
  from public, anon, authenticated;
grant execute on function public.enforce_response_live_context()
  to service_role;

revoke all on function public.enforce_team_response_edit_lock()
  from public, anon, authenticated;
grant execute on function public.enforce_team_response_edit_lock()
  to service_role;

revoke all on function public.enforce_participant_team_change()
  from public, anon, authenticated;
grant execute on function public.enforce_participant_team_change()
  to service_role;

comment on function public.reconcile_live_control_snapshot(uuid, jsonb) is
  'Teacher-owned Cloudflare snapshot convergence wrapper. Uses a transaction-scoped advisory marker so historical fallback writes can pass SEC-005 live-write triggers without weakening ordinary writes.';

comment on function public.reconcile_live_control_snapshot_impl(uuid, jsonb) is
  'Internal implementation for live-control snapshot convergence. Not executable by API roles; invoke only through reconcile_live_control_snapshot().';

comment on function public.enforce_response_live_context() is
  'SEC-005: atomically rechecks live response context; bypass is limited to the postgres-owned live reconciliation transaction marker.';

comment on function public.enforce_team_response_edit_lock() is
  'SEC-005: atomically rechecks live team-task context, membership, and edit lock; bypass is limited to the postgres-owned live reconciliation transaction marker.';

comment on function public.enforce_participant_team_change() is
  'SEC-005: serializes participant team changes; bypass is limited to the postgres-owned live reconciliation transaction marker.';
