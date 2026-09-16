alter table public.sessions
  add column revealed_block_ids text[] not null default '{}'::text[];

update public.sessions
set revealed_block_ids = array[active_block_id]
where results_revealed = true and active_block_id is not null;

alter table public.sessions drop column results_revealed;

grant update (revealed_block_ids) on public.sessions to authenticated;
