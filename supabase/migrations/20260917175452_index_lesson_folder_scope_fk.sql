drop index if exists public.lessons_folder_id_idx;

create index if not exists lessons_owner_folder_idx
  on public.lessons(owner_id, folder_id);
