grant insert on table public.sessions to authenticated;
grant update (status, active_block_id, started_at, ended_at) on table public.sessions to authenticated;
