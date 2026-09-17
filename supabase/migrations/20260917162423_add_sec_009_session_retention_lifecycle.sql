create extension if not exists pg_cron with schema pg_catalog;

grant usage on schema cron to postgres;
grant all privileges on all tables in schema cron to postgres;

grant delete on table public.sessions to authenticated;

drop policy if exists "teachers_can_delete_own_ended_sessions" on public.sessions;
create policy "teachers_can_delete_own_ended_sessions"
on public.sessions
for delete
to authenticated
using (
  (select auth.uid()) = teacher_id
  and status = 'ended'
);

create index if not exists sessions_retention_ended_idx
  on public.sessions (ended_at)
  where status = 'ended' and ended_at is not null;

create index if not exists sessions_retention_open_created_idx
  on public.sessions (created_at)
  where status in ('lobby', 'live');

create or replace function private.purge_expired_session_data(p_now timestamptz default now())
returns table (
  ended_sessions_deleted bigint,
  abandoned_sessions_deleted bigint,
  expired_locks_deleted bigint
)
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_ended bigint := 0;
  v_abandoned bigint := 0;
  v_locks bigint := 0;
begin
  delete from public.sessions
  where status = 'ended'
    and ended_at is not null
    and ended_at < p_now - interval '12 months';
  get diagnostics v_ended = row_count;

  delete from public.sessions
  where status in ('lobby', 'live')
    and created_at < p_now - interval '30 days';
  get diagnostics v_abandoned = row_count;

  delete from public.team_edit_locks
  where expires_at < p_now - interval '24 hours';
  get diagnostics v_locks = row_count;

  return query select v_ended, v_abandoned, v_locks;
end;
$$;

revoke all on function private.purge_expired_session_data(timestamptz) from public, anon, authenticated;

select cron.schedule(
  'syllonaut-retention-cleanup',
  '17 3 * * *',
  $$select private.purge_expired_session_data();$$
);
