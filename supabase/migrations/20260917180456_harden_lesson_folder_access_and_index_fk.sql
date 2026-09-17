revoke all on table public.lesson_folders from anon;
revoke all on table public.lesson_folders from authenticated;
grant select, insert, update, delete on table public.lesson_folders to authenticated;

create index if not exists lessons_owner_folder_idx
  on public.lessons(owner_id, folder_id)
  where folder_id is not null;
