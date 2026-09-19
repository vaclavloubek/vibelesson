create table public.lesson_shares (
  id uuid primary key default gen_random_uuid(),
  lesson_id uuid not null references public.lessons(id) on delete cascade,
  owner_id uuid not null references auth.users(id) on delete cascade,
  token text not null unique,
  snapshot jsonb not null,
  status text not null default 'active' check (status in ('active', 'revoked')),
  created_at timestamptz not null default now(),
  revoked_at timestamptz null,
  constraint lesson_shares_token_format check (token ~ '^[0-9a-f]{48}$'),
  constraint lesson_shares_revocation_state check (
    (status = 'active' and revoked_at is null)
    or (status = 'revoked' and revoked_at is not null)
  )
);

create unique index lesson_shares_one_active_per_lesson_idx
  on public.lesson_shares(lesson_id)
  where status = 'active';

create index lesson_shares_owner_created_idx
  on public.lesson_shares(owner_id, created_at desc);

alter table public.lesson_shares enable row level security;

revoke all on table public.lesson_shares from anon, authenticated;
grant select, insert on table public.lesson_shares to authenticated;
grant update (status, revoked_at) on table public.lesson_shares to authenticated;

create policy lesson_share_owners_can_view
  on public.lesson_shares
  for select
  to authenticated
  using (
    (select auth.uid()) is not null
    and (select auth.uid()) = owner_id
  );

create policy lesson_owners_can_create_shares
  on public.lesson_shares
  for insert
  to authenticated
  with check (
    (select auth.uid()) is not null
    and (select auth.uid()) = owner_id
    and status = 'active'
    and revoked_at is null
    and exists (
      select 1
      from public.lessons l
      where l.id = lesson_id
        and l.owner_id = (select auth.uid())
        and l.lesson = snapshot
    )
  );

create policy lesson_share_owners_can_revoke
  on public.lesson_shares
  for update
  to authenticated
  using (
    (select auth.uid()) is not null
    and (select auth.uid()) = owner_id
    and status = 'active'
  )
  with check (
    (select auth.uid()) = owner_id
    and status = 'revoked'
    and revoked_at is not null
  );

create or replace function private.enforce_lesson_share_immutability()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.id is distinct from old.id
     or new.lesson_id is distinct from old.lesson_id
     or new.owner_id is distinct from old.owner_id
     or new.token is distinct from old.token
     or new.snapshot is distinct from old.snapshot
     or new.created_at is distinct from old.created_at then
    raise exception 'Shared lesson identity and snapshot are immutable.' using errcode = '23514';
  end if;

  if old.status = 'revoked' then
    raise exception 'A revoked lesson share cannot be changed.' using errcode = '23514';
  end if;

  return new;
end;
$$;

revoke all on function private.enforce_lesson_share_immutability() from public;

create trigger enforce_lesson_share_immutability
before update on public.lesson_shares
for each row
execute function private.enforce_lesson_share_immutability();

alter table public.lessons
  add column if not exists source_share_id uuid null
  references public.lesson_shares(id) on delete set null;

alter table public.lessons
  add column if not exists source_lesson_id uuid null
  references public.lessons(id) on delete set null;

create unique index lessons_owner_source_share_unique_idx
  on public.lessons(owner_id, source_share_id)
  where source_share_id is not null;

create index lessons_source_lesson_id_idx
  on public.lessons(source_lesson_id)
  where source_lesson_id is not null;

create policy lesson_clients_cannot_forge_share_provenance
  on public.lessons
  as restrictive
  for insert
  to authenticated
  with check (
    source_share_id is null
    and source_lesson_id is null
  );

create or replace function private.enforce_lesson_share_provenance_immutability()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.source_share_id is distinct from old.source_share_id
     or new.source_lesson_id is distinct from old.source_lesson_id then
    raise exception 'Shared lesson provenance is immutable.' using errcode = '23514';
  end if;

  return new;
end;
$$;

revoke all on function private.enforce_lesson_share_provenance_immutability() from public;

create trigger enforce_lesson_share_provenance_immutability
before update of source_share_id, source_lesson_id on public.lessons
for each row
execute function private.enforce_lesson_share_provenance_immutability();

create or replace function public.get_lesson_share(p_token text)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_snapshot jsonb;
begin
  if p_token is null or p_token !~ '^[0-9a-f]{48}$' then
    return null;
  end if;

  select s.snapshot
  into v_snapshot
  from public.lesson_shares s
  where s.token = p_token
    and s.status = 'active';

  return v_snapshot;
end;
$$;

revoke all on function public.get_lesson_share(text) from public;
grant execute on function public.get_lesson_share(text) to anon, authenticated;

create or replace function public.import_lesson_share(p_token text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_share public.lesson_shares%rowtype;
  v_lesson_id uuid;
begin
  if v_user_id is null then
    raise exception 'Authentication required.' using errcode = '42501';
  end if;

  if p_token is null or p_token !~ '^[0-9a-f]{48}$' then
    raise exception 'Shared lesson not found.' using errcode = 'P0002';
  end if;

  select s.*
  into v_share
  from public.lesson_shares s
  where s.token = p_token
    and s.status = 'active';

  if not found then
    raise exception 'Shared lesson not found.' using errcode = 'P0002';
  end if;

  select l.id
  into v_lesson_id
  from public.lessons l
  where l.owner_id = v_user_id
    and l.source_share_id = v_share.id;

  if found then
    return v_lesson_id;
  end if;

  insert into public.lessons (
    owner_id,
    title,
    source_prompt,
    lesson,
    source_share_id,
    source_lesson_id
  )
  values (
    v_user_id,
    left(coalesce(v_share.snapshot ->> 'title', 'Shared lesson'), 200),
    'Imported from a shared lesson.',
    v_share.snapshot,
    v_share.id,
    v_share.lesson_id
  )
  on conflict (owner_id, source_share_id) where source_share_id is not null
  do nothing
  returning id into v_lesson_id;

  if v_lesson_id is null then
    select l.id
    into v_lesson_id
    from public.lessons l
    where l.owner_id = v_user_id
      and l.source_share_id = v_share.id;
  end if;

  return v_lesson_id;
end;
$$;

revoke all on function public.import_lesson_share(text) from public, anon;
grant execute on function public.import_lesson_share(text) to authenticated;

do $$
begin
  if exists (
    select 1
    from public.sessions
    where status in ('lobby', 'live')
    group by teacher_id
    having count(*) > 1
  ) then
    raise exception 'Cannot enforce one active live session: duplicate active teacher sessions exist.';
  end if;
end;
$$;

create unique index sessions_one_active_per_teacher_idx
  on public.sessions(teacher_id)
  where status in ('lobby', 'live');
