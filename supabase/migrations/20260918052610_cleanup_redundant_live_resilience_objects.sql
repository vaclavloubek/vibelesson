-- Remove post-merge P2 prototype objects that are not used by the merged
-- event-based Live Control reconciliation path. Deliberately no CASCADE:
-- an unexpected dependency must stop this migration rather than be removed.

drop function if exists public.reconcile_live_control_snapshot(uuid, jsonb);
drop function if exists public.get_server_secret(text);

drop table if exists private.server_secrets;

alter table public.sessions
  drop column if exists live_updated_at;

alter table public.participants
  drop column if exists team_updated_at;
