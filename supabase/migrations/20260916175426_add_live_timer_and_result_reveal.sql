alter table public.sessions
  add column results_revealed boolean not null default false,
  add column timer_status text not null default 'idle',
  add column timer_started_at timestamptz,
  add column timer_remaining_seconds integer;

alter table public.sessions
  add constraint sessions_timer_status_check
    check (timer_status in ('idle', 'running', 'paused')),
  add constraint sessions_timer_remaining_seconds_check
    check (timer_remaining_seconds is null or (timer_remaining_seconds >= 0 and timer_remaining_seconds <= 3600));

grant update (results_revealed, timer_status, timer_started_at, timer_remaining_seconds)
  on public.sessions to authenticated;
