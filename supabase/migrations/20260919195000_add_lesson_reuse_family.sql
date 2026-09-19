-- Make live-use entitlement follow the logical lesson family rather than a single lesson row.
-- Copies, shared imports and school-library imports inherit the same immutable reuse_family_id.
-- Free may use a family live once per user, regardless of how many derived lesson rows exist.

alter table public.lessons
  add column if not exists reuse_family_id uuid;

-- Seed every existing lesson as its own family first, then collapse known derivation
-- chains onto their oldest reachable source lesson. Cycles, if any historical data
-- contains them, safely keep their initially assigned family instead of recursing forever.
update public.lessons
set reuse_family_id = id
where reuse_family_id is null;

with recursive lineage as (
  select
    l.id,
    l.id as root_id,
    array[l.id]::uuid[] as path
  from public.lessons l
  where l.source_lesson_id is null

  union all

  select
    child.id,
    parent.root_id,
    parent.path || child.id
  from public.lessons child
  join lineage parent on child.source_lesson_id = parent.id
  where not child.id = any(parent.path)
)
update public.lessons l
set reuse_family_id = lineage.root_id
from lineage
where l.id = lineage.id
  and l.reuse_family_id is distinct from lineage.root_id;

alter table public.lessons
  alter column reuse_family_id set default gen_random_uuid(),
  alter column reuse_family_id set not null;

create index if not exists lessons_owner_reuse_family_idx
  on public.lessons (owner_id, reuse_family_id);

comment on column public.lessons.reuse_family_id is
  'Immutable logical lesson lineage. Copies and imports inherit the source family; a genuinely new lesson starts a new family.';

-- Persist lineage on share snapshots so an imported lesson keeps its family even if
-- provenance links change later.
alter table public.lesson_shares
  add column if not exists reuse_family_id uuid;

-- Revoked shares are intentionally immutable. Temporarily remove the old trigger
-- only inside this migration so the new system lineage column can be backfilled;
-- the stricter trigger is recreated below before the transaction commits.
drop trigger if exists enforce_lesson_share_immutability on public.lesson_shares;

update public.lesson_shares s
set reuse_family_id = l.reuse_family_id
from public.lessons l
where l.id = s.lesson_id
  and s.reuse_family_id is null;

alter table public.lesson_shares
  alter column reuse_family_id set not null;

create index if not exists lesson_shares_reuse_family_idx
  on public.lesson_shares (reuse_family_id);

comment on column public.lesson_shares.reuse_family_id is
  'Immutable lesson family captured when the share is created.';

create or replace function private.assign_lesson_share_reuse_family()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_owner_id uuid;
  v_family_id uuid;
begin
  select l.owner_id, l.reuse_family_id
  into v_owner_id, v_family_id
  from public.lessons l
  where l.id = new.lesson_id;

  if not found then
    raise exception 'Shared lesson source is missing.' using errcode = '23503';
  end if;

  if v_owner_id is distinct from new.owner_id then
    raise exception 'Shared lesson owner must match the source lesson owner.' using errcode = '23514';
  end if;

  new.reuse_family_id := v_family_id;
  return new;
end;
$$;

revoke all on function private.assign_lesson_share_reuse_family() from public, anon, authenticated;

drop trigger if exists assign_lesson_share_reuse_family on public.lesson_shares;
create trigger assign_lesson_share_reuse_family
before insert on public.lesson_shares
for each row
execute function private.assign_lesson_share_reuse_family();

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
     or new.reuse_family_id is distinct from old.reuse_family_id
     or new.created_at is distinct from old.created_at then
    raise exception 'Shared lesson identity, lineage and snapshot are immutable.' using errcode = '23514';
  end if;

  if old.status = 'revoked' then
    raise exception 'A revoked lesson share cannot be changed.' using errcode = '23514';
  end if;

  return new;
end;
$$;

revoke all on function private.enforce_lesson_share_immutability() from public, anon, authenticated;

drop trigger if exists enforce_lesson_share_immutability on public.lesson_shares;
create trigger enforce_lesson_share_immutability
before update on public.lesson_shares
for each row
execute function private.enforce_lesson_share_immutability();

-- Persist lineage on school-library snapshots too. Historical orphaned library
-- entries get a fresh stable family because their deleted source can no longer be recovered.
alter table public.organization_lesson_library
  add column if not exists reuse_family_id uuid;

update public.organization_lesson_library lib
set reuse_family_id = l.reuse_family_id
from public.lessons l
where l.id = lib.source_lesson_id
  and lib.reuse_family_id is null;

update public.organization_lesson_library
set reuse_family_id = gen_random_uuid()
where reuse_family_id is null;

alter table public.organization_lesson_library
  alter column reuse_family_id set not null;

create index if not exists organization_lesson_library_reuse_family_idx
  on public.organization_lesson_library (reuse_family_id);

comment on column public.organization_lesson_library.reuse_family_id is
  'Immutable lesson family captured when the lesson is published to the organization library.';

create or replace function private.assign_organization_library_reuse_family()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_family_id uuid;
begin
  if new.source_lesson_id is not null then
    select l.reuse_family_id
    into v_family_id
    from public.lessons l
    where l.id = new.source_lesson_id;

    if not found then
      raise exception 'Organization library source lesson is missing.' using errcode = '23503';
    end if;
  end if;

  new.reuse_family_id := coalesce(v_family_id, new.reuse_family_id, gen_random_uuid());
  return new;
end;
$$;

revoke all on function private.assign_organization_library_reuse_family() from public, anon, authenticated;

drop trigger if exists assign_organization_library_reuse_family on public.organization_lesson_library;
create trigger assign_organization_library_reuse_family
before insert on public.organization_lesson_library
for each row
execute function private.assign_organization_library_reuse_family();

create or replace function private.enforce_organization_library_immutability()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.id is distinct from old.id
     or new.organization_id is distinct from old.organization_id
     or new.source_lesson_id is distinct from old.source_lesson_id
     or new.published_by is distinct from old.published_by
     or new.title is distinct from old.title
     or new.subject is distinct from old.subject
     or new.snapshot is distinct from old.snapshot
     or new.reuse_family_id is distinct from old.reuse_family_id
     or new.created_at is distinct from old.created_at then
    raise exception 'Organization library lineage and snapshots are immutable.' using errcode = '23514';
  end if;
  return new;
end;
$$;

revoke all on function private.enforce_organization_library_immutability() from public, anon, authenticated;

-- Every new lesson row gets a family at the database boundary. Derived lessons
-- inherit it from all available provenance sources, and inconsistent provenance
-- is rejected rather than silently minting a fresh Free live-use entitlement.
create or replace function private.assign_lesson_reuse_family()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_family_id uuid;
  v_candidate uuid;
begin
  if tg_op = 'UPDATE' then
    if new.reuse_family_id is distinct from old.reuse_family_id then
      raise exception 'Lesson reuse family is immutable.' using errcode = '23514';
    end if;
    return new;
  end if;

  if new.source_lesson_id is not null then
    select l.reuse_family_id
    into v_candidate
    from public.lessons l
    where l.id = new.source_lesson_id;

    if not found then
      raise exception 'Source lesson is missing.' using errcode = '23503';
    end if;
    v_family_id := v_candidate;
  end if;

  if new.source_share_id is not null then
    select s.reuse_family_id
    into v_candidate
    from public.lesson_shares s
    where s.id = new.source_share_id;

    if not found then
      raise exception 'Source lesson share is missing.' using errcode = '23503';
    end if;

    if v_family_id is not null and v_family_id is distinct from v_candidate then
      raise exception 'Lesson provenance points to conflicting reuse families.' using errcode = '23514';
    end if;
    v_family_id := v_candidate;
  end if;

  if new.source_organization_library_id is not null then
    select lib.reuse_family_id
    into v_candidate
    from public.organization_lesson_library lib
    where lib.id = new.source_organization_library_id;

    if not found then
      raise exception 'Source organization library entry is missing.' using errcode = '23503';
    end if;

    if v_family_id is not null and v_family_id is distinct from v_candidate then
      raise exception 'Lesson provenance points to conflicting reuse families.' using errcode = '23514';
    end if;
    v_family_id := v_candidate;
  end if;

  new.reuse_family_id := coalesce(v_family_id, new.reuse_family_id, gen_random_uuid());
  return new;
end;
$$;

revoke all on function private.assign_lesson_reuse_family() from public, anon, authenticated;

drop trigger if exists assign_lesson_reuse_family on public.lessons;
create trigger assign_lesson_reuse_family
before insert or update of reuse_family_id on public.lessons
for each row
execute function private.assign_lesson_reuse_family();

-- Canonical first-use ledger: one row per user + logical lesson family.
create table if not exists public.lesson_reuse_usage (
  owner_id uuid not null references auth.users(id) on delete cascade,
  reuse_family_id uuid not null,
  first_lesson_id uuid references public.lessons(id) on delete set null,
  first_session_id uuid references public.sessions(id) on delete set null,
  first_used_at timestamptz not null,
  created_at timestamptz not null default now(),
  primary key (owner_id, reuse_family_id)
);

alter table public.lesson_reuse_usage enable row level security;

revoke all on table public.lesson_reuse_usage from public, anon, authenticated;
grant select on table public.lesson_reuse_usage to authenticated;
grant select, insert, update, delete on table public.lesson_reuse_usage to service_role;

drop policy if exists users_can_view_own_lesson_reuse_usage on public.lesson_reuse_usage;
create policy users_can_view_own_lesson_reuse_usage
on public.lesson_reuse_usage
for select
to authenticated
using ((select auth.uid()) = owner_id);

create index if not exists lesson_reuse_usage_first_lesson_idx
  on public.lesson_reuse_usage (first_lesson_id)
  where first_lesson_id is not null;

create index if not exists lesson_reuse_usage_first_session_idx
  on public.lesson_reuse_usage (first_session_id)
  where first_session_id is not null;

insert into public.lesson_reuse_usage (
  owner_id,
  reuse_family_id,
  first_lesson_id,
  first_session_id,
  first_used_at
)
select distinct on (l.owner_id, l.reuse_family_id)
  l.owner_id,
  l.reuse_family_id,
  u.lesson_id,
  u.first_session_id,
  u.first_used_at
from public.lesson_live_usage u
join public.lessons l on l.id = u.lesson_id
order by
  l.owner_id,
  l.reuse_family_id,
  u.first_used_at asc,
  u.created_at asc
on conflict (owner_id, reuse_family_id) do nothing;

-- Keep the old per-lesson table as a denormalized compatibility projection for
-- the current UI. Every lesson row in an already-used family appears archived.
insert into public.lesson_live_usage (
  lesson_id,
  owner_id,
  first_session_id,
  first_used_at
)
select
  l.id,
  l.owner_id,
  family.first_session_id,
  family.first_used_at
from public.lessons l
join public.lesson_reuse_usage family
  on family.owner_id = l.owner_id
 and family.reuse_family_id = l.reuse_family_id
on conflict (lesson_id) do nothing;

create or replace function private.record_lesson_live_usage()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_lesson_id uuid;
  v_owner_id uuid;
  v_family_id uuid;
  v_first_session_id uuid;
  v_first_used_at timestamptz;
  v_new_family_usage boolean := false;
begin
  select s.lesson_id, s.teacher_id, l.reuse_family_id
  into v_lesson_id, v_owner_id, v_family_id
  from public.sessions s
  join public.lessons l on l.id = s.lesson_id
  where s.id = new.session_id;

  if v_lesson_id is null or v_owner_id is null or v_family_id is null then
    return new;
  end if;

  insert into public.lesson_reuse_usage (
    owner_id,
    reuse_family_id,
    first_lesson_id,
    first_session_id,
    first_used_at
  )
  values (
    v_owner_id,
    v_family_id,
    v_lesson_id,
    new.session_id,
    new.joined_at
  )
  on conflict (owner_id, reuse_family_id) do nothing;

  v_new_family_usage := found;

  select u.first_session_id, u.first_used_at
  into v_first_session_id, v_first_used_at
  from public.lesson_reuse_usage u
  where u.owner_id = v_owner_id
    and u.reuse_family_id = v_family_id;

  if v_new_family_usage then
    insert into public.lesson_live_usage (
      lesson_id,
      owner_id,
      first_session_id,
      first_used_at
    )
    select
      l.id,
      l.owner_id,
      v_first_session_id,
      v_first_used_at
    from public.lessons l
    where l.owner_id = v_owner_id
      and l.reuse_family_id = v_family_id
    on conflict (lesson_id) do nothing;
  else
    insert into public.lesson_live_usage (
      lesson_id,
      owner_id,
      first_session_id,
      first_used_at
    )
    values (
      v_lesson_id,
      v_owner_id,
      v_first_session_id,
      v_first_used_at
    )
    on conflict (lesson_id) do nothing;
  end if;

  return new;
end;
$$;

revoke all on function private.record_lesson_live_usage() from public, anon, authenticated;

-- If a copy/import is created after its family was already used, make the legacy
-- UI projection show it as archived immediately.
create or replace function private.project_used_family_to_new_lesson()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_first_session_id uuid;
  v_first_used_at timestamptz;
begin
  select u.first_session_id, u.first_used_at
  into v_first_session_id, v_first_used_at
  from public.lesson_reuse_usage u
  where u.owner_id = new.owner_id
    and u.reuse_family_id = new.reuse_family_id;

  if not found then
    return new;
  end if;

  insert into public.lesson_live_usage (
    lesson_id,
    owner_id,
    first_session_id,
    first_used_at
  )
  values (
    new.id,
    new.owner_id,
    v_first_session_id,
    v_first_used_at
  )
  on conflict (lesson_id) do nothing;

  return new;
end;
$$;

revoke all on function private.project_used_family_to_new_lesson() from public, anon, authenticated;

drop trigger if exists lessons_project_used_family_to_legacy_usage on public.lessons;
create trigger lessons_project_used_family_to_legacy_usage
after insert on public.lessons
for each row
execute function private.project_used_family_to_new_lesson();

create or replace function private.enforce_free_lesson_reuse()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_family_id uuid;
begin
  if new.lesson_id is null then
    return new;
  end if;

  if private.lesson_reuse_enabled(new.teacher_id) then
    return new;
  end if;

  select l.reuse_family_id
  into v_family_id
  from public.lessons l
  where l.id = new.lesson_id
    and l.owner_id = new.teacher_id;

  if not found then
    return new;
  end if;

  if exists (
    select 1
    from public.lesson_reuse_usage u
    where u.owner_id = new.teacher_id
      and u.reuse_family_id = v_family_id
  ) then
    raise exception 'free_lesson_replay_locked' using errcode = 'P0001';
  end if;

  return new;
end;
$$;

revoke all on function private.enforce_free_lesson_reuse() from public, anon, authenticated;

comment on table public.lesson_reuse_usage is
  'Canonical immutable first-real-use ledger per user and logical lesson family. Free replay checks use this table.';
comment on table public.lesson_live_usage is
  'Per-lesson compatibility projection of family live-use history for UI/archive display. Canonical replay history lives in lesson_reuse_usage.';
