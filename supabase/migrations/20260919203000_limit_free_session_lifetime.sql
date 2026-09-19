-- Bound a Free live session to one realistic teaching window.
--
-- Product rule:
--   * first real participant join starts the Free session clock
--   * new participants may join for 120 minutes
--   * all live writes stop after 6 hours
--   * paid/admin/active-organization sessions are exempt
--   * ended sessions can never be reopened
--
-- The clock is derived from the earliest participant row, so users cannot reset it
-- by changing session timestamps or starting/stopping the teacher UI.

create or replace function private.enforce_free_session_join_window()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_status text;
  v_teacher_id uuid;
  v_first_joined_at timestamptz;
begin
  select s.status, s.teacher_id
  into v_status, v_teacher_id
  from public.sessions s
  where s.id = new.session_id
  for update;

  if not found then
    raise exception 'participant_session_not_found' using errcode = '23503';
  end if;

  if v_status = 'ended' then
    raise exception 'participant_session_ended' using errcode = 'P0001';
  end if;

  if private.lesson_reuse_enabled(v_teacher_id) then
    return new;
  end if;

  select min(p.joined_at)
  into v_first_joined_at
  from public.participants p
  where p.session_id = new.session_id;

  -- No participant yet: this insert becomes the first real use and starts the clock.
  if v_first_joined_at is null then
    return new;
  end if;

  if now() >= v_first_joined_at + interval '6 hours' then
    raise exception 'free_session_expired' using errcode = 'P0001';
  end if;

  if now() >= v_first_joined_at + interval '120 minutes' then
    raise exception 'free_session_join_window_closed' using errcode = 'P0001';
  end if;

  return new;
end;
$function$;

revoke all on function private.enforce_free_session_join_window()
  from public, anon, authenticated, service_role;

drop trigger if exists participants_enforce_free_session_join_window on public.participants;
create trigger participants_enforce_free_session_join_window
before insert on public.participants
for each row
execute function private.enforce_free_session_join_window();

create or replace function private.enforce_free_session_hard_lifetime()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_teacher_id uuid;
  v_first_joined_at timestamptz;
begin
  select s.teacher_id
  into v_teacher_id
  from public.sessions s
  where s.id = new.session_id;

  if not found then
    return new;
  end if;

  if private.lesson_reuse_enabled(v_teacher_id) then
    return new;
  end if;

  select min(p.joined_at)
  into v_first_joined_at
  from public.participants p
  where p.session_id = new.session_id;

  if v_first_joined_at is not null
     and now() >= v_first_joined_at + interval '6 hours' then
    raise exception 'free_session_expired' using errcode = 'P0001';
  end if;

  return new;
end;
$function$;

revoke all on function private.enforce_free_session_hard_lifetime()
  from public, anon, authenticated, service_role;

drop trigger if exists responses_enforce_free_session_lifetime on public.responses;
create trigger responses_enforce_free_session_lifetime
before insert or update on public.responses
for each row
execute function private.enforce_free_session_hard_lifetime();

drop trigger if exists team_responses_enforce_free_session_lifetime on public.team_responses;
create trigger team_responses_enforce_free_session_lifetime
before insert or update on public.team_responses
for each row
execute function private.enforce_free_session_hard_lifetime();

drop trigger if exists team_edit_locks_enforce_free_session_lifetime on public.team_edit_locks;
create trigger team_edit_locks_enforce_free_session_lifetime
before insert or update on public.team_edit_locks
for each row
execute function private.enforce_free_session_hard_lifetime();

drop trigger if exists participants_enforce_free_session_lifetime on public.participants;
create trigger participants_enforce_free_session_lifetime
before update of team_id on public.participants
for each row
execute function private.enforce_free_session_hard_lifetime();

create or replace function private.enforce_session_lifecycle()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_first_joined_at timestamptz;
begin
  -- Ended means terminal. This also prevents a direct Data API update from
  -- reviving a session after the expiry cron has closed it.
  if old.status = 'ended' and new.status <> 'ended' then
    raise exception 'session_reopen_forbidden' using errcode = 'P0001';
  end if;

  -- Explicitly ending the session must always remain possible.
  if new.status = 'ended' then
    return new;
  end if;

  if old.status not in ('lobby', 'live') then
    return new;
  end if;

  if private.lesson_reuse_enabled(old.teacher_id) then
    return new;
  end if;

  select min(p.joined_at)
  into v_first_joined_at
  from public.participants p
  where p.session_id = old.id;

  if v_first_joined_at is not null
     and now() >= v_first_joined_at + interval '6 hours' then
    raise exception 'free_session_expired' using errcode = 'P0001';
  end if;

  return new;
end;
$function$;

revoke all on function private.enforce_session_lifecycle()
  from public, anon, authenticated, service_role;

drop trigger if exists sessions_enforce_lifecycle on public.sessions;
create trigger sessions_enforce_lifecycle
before update on public.sessions
for each row
execute function private.enforce_session_lifecycle();

create or replace function private.expire_free_sessions(
  p_now timestamptz default now()
)
returns bigint
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_count bigint := 0;
begin
  update public.sessions s
  set status = 'ended',
      ended_at = coalesce(s.ended_at, p_now),
      timer_status = 'idle',
      timer_started_at = null
  where s.status in ('lobby', 'live')
    and not private.lesson_reuse_enabled(s.teacher_id)
    and (
      select min(p.joined_at)
      from public.participants p
      where p.session_id = s.id
    ) <= p_now - interval '6 hours';

  get diagnostics v_count = row_count;
  return v_count;
end;
$function$;

revoke all on function private.expire_free_sessions(timestamptz)
  from public, anon, authenticated, service_role;

do $do$
begin
  begin
    perform cron.unschedule('syllonaut-free-session-expiry');
  exception
    when others then null;
  end;

  perform cron.schedule(
    'syllonaut-free-session-expiry',
    '*/5 * * * *',
    $cron$select private.expire_free_sessions();$cron$
  );
end;
$do$;

comment on function private.enforce_free_session_join_window() is
  'Free only: first participant starts the session clock; new participant inserts close after 120 minutes and all joins stop after 6 hours.';
comment on function private.enforce_free_session_hard_lifetime() is
  'Free only: blocks response/team live writes 6 hours after the first participant joined.';
comment on function private.enforce_session_lifecycle() is
  'Prevents reopening ended sessions and blocks teacher live-control updates after a Free session hard expiry.';
comment on function private.expire_free_sessions(timestamptz) is
  'Ends open Free sessions whose first participant joined at least 6 hours ago. Scheduled every 5 minutes; write-boundary triggers enforce the exact 6-hour cutoff.';
