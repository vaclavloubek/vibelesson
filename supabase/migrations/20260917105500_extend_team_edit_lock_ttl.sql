create or replace function public.claim_team_edit_lock(
  p_session_id uuid,
  p_team_id uuid,
  p_block_id text,
  p_participant_id uuid,
  p_ttl_seconds integer default 60
)
returns table(acquired boolean, holder_participant_id uuid, lock_expires_at timestamptz)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_expires timestamptz := now() + make_interval(secs => greatest(10, least(coalesce(p_ttl_seconds, 60), 120)));
begin
  if not exists (
    select 1
    from public.participants p
    where p.id = p_participant_id
      and p.session_id = p_session_id
      and p.team_id = p_team_id
  ) then
    raise exception 'participant is not a member of the requested team';
  end if;

  insert into public.team_edit_locks as l (
    session_id, team_id, block_id, participant_id, expires_at, updated_at
  ) values (
    p_session_id, p_team_id, p_block_id, p_participant_id, v_expires, now()
  )
  on conflict (session_id, team_id, block_id)
  do update set
    participant_id = excluded.participant_id,
    expires_at = excluded.expires_at,
    updated_at = now()
  where l.participant_id = excluded.participant_id
     or l.expires_at <= now();

  return query
  select
    l.participant_id = p_participant_id,
    l.participant_id,
    l.expires_at
  from public.team_edit_locks l
  where l.session_id = p_session_id
    and l.team_id = p_team_id
    and l.block_id = p_block_id;
end;
$$;

revoke all on function public.claim_team_edit_lock(uuid, uuid, text, uuid, integer) from public, anon, authenticated;
grant execute on function public.claim_team_edit_lock(uuid, uuid, text, uuid, integer) to service_role;
