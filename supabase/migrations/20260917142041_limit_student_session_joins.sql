create table if not exists public.participant_join_rate_limits (
  session_id uuid not null references public.sessions(id) on delete cascade,
  client_fingerprint text not null,
  window_start timestamptz not null,
  attempt_count integer not null default 0,
  constraint participant_join_rate_limits_pkey primary key (session_id, client_fingerprint, window_start),
  constraint participant_join_rate_limits_client_fingerprint_format check (client_fingerprint ~ '^[0-9a-f]{64}$'),
  constraint participant_join_rate_limits_attempt_count_nonnegative check (attempt_count >= 0)
);

alter table public.participant_join_rate_limits enable row level security;
revoke all on table public.participant_join_rate_limits from public, anon, authenticated;
grant select, insert, update, delete on table public.participant_join_rate_limits to service_role;

create or replace function public.join_session_participant(
  p_session_id uuid,
  p_display_name text,
  p_participant_token_hash text,
  p_client_fingerprint text
)
returns table(result text, participant_id uuid)
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_status text;
  v_attempt_count integer;
  v_participant_count integer;
  v_participant_id uuid;
  v_window_start timestamptz := date_trunc('minute', now());
begin
  if p_session_id is null
     or char_length(btrim(coalesce(p_display_name, ''))) not between 1 and 60
     or coalesce(p_participant_token_hash, '') !~ '^[0-9a-f]{64}$'
     or coalesce(p_client_fingerprint, '') !~ '^[0-9a-f]{64}$' then
    return query select 'invalid'::text, null::uuid;
    return;
  end if;

  select s.status
  into v_status
  from public.sessions s
  where s.id = p_session_id
  for update;

  if not found then
    return query select 'not_found'::text, null::uuid;
    return;
  end if;

  if v_status = 'ended' then
    return query select 'ended'::text, null::uuid;
    return;
  end if;

  delete from public.participant_join_rate_limits
  where session_id = p_session_id
    and window_start < now() - interval '15 minutes';

  insert into public.participant_join_rate_limits as limits (
    session_id,
    client_fingerprint,
    window_start,
    attempt_count
  )
  values (p_session_id, p_client_fingerprint, v_window_start, 1)
  on conflict (session_id, client_fingerprint, window_start)
  do update set attempt_count = limits.attempt_count + 1
  returning attempt_count into v_attempt_count;

  if v_attempt_count > 150 then
    return query select 'rate_limited'::text, null::uuid;
    return;
  end if;

  select count(*)::integer
  into v_participant_count
  from public.participants p
  where p.session_id = p_session_id;

  if v_participant_count >= 200 then
    return query select 'full'::text, null::uuid;
    return;
  end if;

  insert into public.participants (session_id, display_name, participant_token_hash)
  values (p_session_id, btrim(p_display_name), p_participant_token_hash)
  returning id into v_participant_id;

  return query select 'joined'::text, v_participant_id;
end;
$$;

revoke all on function public.join_session_participant(uuid, text, text, text) from public, anon, authenticated;
grant execute on function public.join_session_participant(uuid, text, text, text) to service_role;

comment on function public.join_session_participant(uuid, text, text, text) is
  'Atomically rate-limits student joins, caps sessions at 200 participants, and inserts a participant. Service-role only.';
