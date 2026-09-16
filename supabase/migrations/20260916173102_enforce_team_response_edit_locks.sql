create or replace function public.enforce_team_response_edit_lock()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.updated_by_participant_id is null then
    raise exception 'team response edit requires participant identity';
  end if;

  if not exists (
    select 1
    from public.team_edit_locks l
    where l.session_id = new.session_id
      and l.team_id = new.team_id
      and l.block_id = new.block_id
      and l.participant_id = new.updated_by_participant_id
      and l.expires_at > now()
  ) then
    raise exception 'team response edit requires an active edit lock';
  end if;

  return new;
end;
$$;

drop trigger if exists team_responses_require_edit_lock on public.team_responses;
create trigger team_responses_require_edit_lock
before insert or update on public.team_responses
for each row execute function public.enforce_team_response_edit_lock();

revoke all on function public.enforce_team_response_edit_lock() from public, anon, authenticated;
