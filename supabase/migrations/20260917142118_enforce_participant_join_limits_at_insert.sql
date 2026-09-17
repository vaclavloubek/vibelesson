drop function if exists public.join_session_participant(uuid, text, text, text);
drop table if exists public.participant_join_rate_limits;

create index if not exists participants_session_joined_at_idx
  on public.participants (session_id, joined_at desc);

create or replace function public.enforce_participant_join_limits()
returns trigger
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_status text;
  v_participant_count integer;
  v_recent_join_count integer;
begin
  select s.status
  into v_status
  from public.sessions s
  where s.id = new.session_id
  for update;

  if not found then
    raise exception using errcode = '23503', message = 'participant_session_not_found';
  end if;

  if v_status = 'ended' then
    raise exception using errcode = 'P0001', message = 'participant_session_ended';
  end if;

  select count(*)::integer
  into v_participant_count
  from public.participants p
  where p.session_id = new.session_id;

  if v_participant_count >= 200 then
    raise exception using errcode = 'P0001', message = 'participant_limit_reached';
  end if;

  select count(*)::integer
  into v_recent_join_count
  from public.participants p
  where p.session_id = new.session_id
    and p.joined_at >= now() - interval '1 minute';

  if v_recent_join_count >= 150 then
    raise exception using errcode = 'P0001', message = 'participant_join_rate_limited';
  end if;

  return new;
end;
$$;

drop trigger if exists enforce_participant_join_limits on public.participants;
create trigger enforce_participant_join_limits
before insert on public.participants
for each row execute function public.enforce_participant_join_limits();

revoke all on function public.enforce_participant_join_limits() from public, anon, authenticated;
grant execute on function public.enforce_participant_join_limits() to service_role;

comment on function public.enforce_participant_join_limits() is
  'Serializes participant creation per session, caps sessions at 200 participants, and limits joins to 150 per minute.';
