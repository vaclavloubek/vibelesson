-- Cover the foreign keys introduced by lesson_live_usage so ownership
-- and session lookups remain efficient as the usage ledger grows.

create index if not exists lesson_live_usage_owner_id_idx
  on public.lesson_live_usage (owner_id);

create index if not exists lesson_live_usage_first_session_id_idx
  on public.lesson_live_usage (first_session_id)
  where first_session_id is not null;
