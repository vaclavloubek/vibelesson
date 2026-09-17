alter table public.profiles
  add column if not exists lesson_folders_enabled boolean not null default false;

create table if not exists public.lesson_folders (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  parent_id uuid null,
  name text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint lesson_folders_name_check check (
    name = btrim(name)
    and char_length(name) between 1 and 100
  ),
  constraint lesson_folders_owner_id_id_key unique (owner_id, id)
);

alter table public.lesson_folders
  add constraint lesson_folders_parent_same_owner_fk
  foreign key (owner_id, parent_id)
  references public.lesson_folders(owner_id, id)
  on delete restrict;

create unique index if not exists lesson_folders_root_name_unique
  on public.lesson_folders(owner_id, lower(name))
  where parent_id is null;

create unique index if not exists lesson_folders_child_name_unique
  on public.lesson_folders(owner_id, parent_id, lower(name))
  where parent_id is not null;

create index if not exists lesson_folders_owner_parent_idx
  on public.lesson_folders(owner_id, parent_id);

alter table public.lesson_folders enable row level security;

grant select, insert, update, delete on public.lesson_folders to authenticated;

create policy users_can_view_own_lesson_folders
  on public.lesson_folders
  for select
  to authenticated
  using (
    (select auth.uid()) is not null
    and (select auth.uid()) = owner_id
  );

create policy entitled_users_can_insert_own_lesson_folders
  on public.lesson_folders
  for insert
  to authenticated
  with check (
    (select auth.uid()) is not null
    and (select auth.uid()) = owner_id
    and exists (
      select 1
      from public.profiles p
      where p.id = (select auth.uid())
        and (p.role = 'admin' or p.lesson_folders_enabled)
    )
  );

create policy entitled_users_can_update_own_lesson_folders
  on public.lesson_folders
  for update
  to authenticated
  using (
    (select auth.uid()) is not null
    and (select auth.uid()) = owner_id
    and exists (
      select 1
      from public.profiles p
      where p.id = (select auth.uid())
        and (p.role = 'admin' or p.lesson_folders_enabled)
    )
  )
  with check (
    (select auth.uid()) is not null
    and (select auth.uid()) = owner_id
    and exists (
      select 1
      from public.profiles p
      where p.id = (select auth.uid())
        and (p.role = 'admin' or p.lesson_folders_enabled)
    )
  );

create policy entitled_users_can_delete_own_lesson_folders
  on public.lesson_folders
  for delete
  to authenticated
  using (
    (select auth.uid()) is not null
    and (select auth.uid()) = owner_id
    and exists (
      select 1
      from public.profiles p
      where p.id = (select auth.uid())
        and (p.role = 'admin' or p.lesson_folders_enabled)
    )
  );

create or replace function private.enforce_lesson_folder_hierarchy()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_parent_parent_id uuid;
begin
  if new.parent_id is null then
    return new;
  end if;

  if new.parent_id = new.id then
    raise exception 'A lesson folder cannot be its own parent.' using errcode = '23514';
  end if;

  select parent_id
  into v_parent_parent_id
  from public.lesson_folders
  where id = new.parent_id
    and owner_id = new.owner_id;

  if not found then
    raise exception 'Parent lesson folder must belong to the same owner.' using errcode = '23503';
  end if;

  if v_parent_parent_id is not null then
    raise exception 'Lesson folders support at most two levels.' using errcode = '23514';
  end if;

  if exists (
    select 1
    from public.lesson_folders child
    where child.parent_id = new.id
  ) then
    raise exception 'A folder with subfolders cannot be moved below another folder.' using errcode = '23514';
  end if;

  return new;
end;
$$;

revoke all on function private.enforce_lesson_folder_hierarchy() from public;

create trigger enforce_lesson_folder_hierarchy
before insert or update of owner_id, parent_id
on public.lesson_folders
for each row
execute function private.enforce_lesson_folder_hierarchy();

alter table public.lessons
  add column if not exists folder_id uuid null;

alter table public.lessons
  add constraint lessons_folder_same_owner_fk
  foreign key (owner_id, folder_id)
  references public.lesson_folders(owner_id, id)
  on delete set null (folder_id);

create index if not exists lessons_folder_id_idx
  on public.lessons(folder_id)
  where folder_id is not null;

create or replace function private.enforce_lesson_folder_assignment_entitlement()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_allowed boolean;
begin
  if new.folder_id is not null
     and (
       tg_op = 'INSERT'
       or new.folder_id is distinct from old.folder_id
     ) then
    select (p.role = 'admin' or p.lesson_folders_enabled)
    into v_allowed
    from public.profiles p
    where p.id = new.owner_id;

    if not coalesce(v_allowed, false) then
      raise exception 'Lesson folder entitlement is required.' using errcode = '42501';
    end if;
  end if;

  return new;
end;
$$;

revoke all on function private.enforce_lesson_folder_assignment_entitlement() from public;

create trigger enforce_lesson_folder_assignment_entitlement
before insert or update of owner_id, folder_id
on public.lessons
for each row
execute function private.enforce_lesson_folder_assignment_entitlement();