-- Preserve school-library provenance across all derived lesson rows and prevent
-- organization-origin content from being distributed through public lesson shares.
--
-- Publishing a personal lesson INTO a school library does not taint the author's
-- original personal lesson. The library snapshot itself becomes organization-origin,
-- and every lesson imported from that snapshot (plus all of its descendants) inherits
-- the immutable organization_origin_id.

alter table public.organization_lesson_library
  add column if not exists organization_origin_id uuid;

update public.organization_lesson_library
set organization_origin_id = organization_id
where organization_origin_id is null;

alter table public.organization_lesson_library
  alter column organization_origin_id set not null;

alter table public.organization_lesson_library
  drop constraint if exists organization_lesson_library_organization_origin_id_fkey;

alter table public.organization_lesson_library
  add constraint organization_lesson_library_organization_origin_id_fkey
  foreign key (organization_origin_id)
  references public.organizations(id)
  on delete restrict;

create index if not exists organization_lesson_library_origin_idx
  on public.organization_lesson_library (organization_origin_id);

comment on column public.organization_lesson_library.organization_origin_id is
  'Immutable school-content origin. Always equals the organization that owns this library snapshot.';

alter table public.lessons
  add column if not exists organization_origin_id uuid;

-- Direct school-library imports are the seed rows.
update public.lessons l
set organization_origin_id = lib.organization_origin_id
from public.organization_lesson_library lib
where l.source_organization_library_id = lib.id
  and l.organization_origin_id is null;

-- Propagate school origin through arbitrary copy/duplicate chains.
with recursive origin_tree as (
  select
    l.id,
    l.organization_origin_id,
    array[l.id]::uuid[] as path
  from public.lessons l
  where l.organization_origin_id is not null

  union all

  select
    child.id,
    parent.organization_origin_id,
    parent.path || child.id
  from public.lessons child
  join origin_tree parent on child.source_lesson_id = parent.id
  where child.organization_origin_id is null
    and not child.id = any(parent.path)
)
update public.lessons l
set organization_origin_id = tree.organization_origin_id
from origin_tree tree
where l.id = tree.id
  and l.organization_origin_id is null;

alter table public.lesson_shares
  add column if not exists organization_origin_id uuid;

-- Temporarily remove share immutability only for the migration backfill/revocation.
drop trigger if exists enforce_lesson_share_immutability on public.lesson_shares;

update public.lesson_shares s
set organization_origin_id = l.organization_origin_id
from public.lessons l
where l.id = s.lesson_id
  and s.organization_origin_id is null
  and l.organization_origin_id is not null;

-- Historical share imports keep their school origin even if their source lesson link
-- is later removed. This is defense in depth; new school-origin shares are blocked.
update public.lessons l
set organization_origin_id = s.organization_origin_id
from public.lesson_shares s
where l.source_share_id = s.id
  and l.organization_origin_id is null
  and s.organization_origin_id is not null;

-- Propagate again in case an old share import has descendants.
with recursive origin_tree as (
  select
    l.id,
    l.organization_origin_id,
    array[l.id]::uuid[] as path
  from public.lessons l
  where l.organization_origin_id is not null

  union all

  select
    child.id,
    parent.organization_origin_id,
    parent.path || child.id
  from public.lessons child
  join origin_tree parent on child.source_lesson_id = parent.id
  where child.organization_origin_id is null
    and not child.id = any(parent.path)
)
update public.lessons l
set organization_origin_id = tree.organization_origin_id
from origin_tree tree
where l.id = tree.id
  and l.organization_origin_id is null;

-- Fail the migration rather than silently accepting conflicting historical provenance.
do $origin_conflicts$
begin
  if exists (
    select 1
    from public.lessons l
    join public.lessons parent on parent.id = l.source_lesson_id
    where l.organization_origin_id is not null
      and parent.organization_origin_id is not null
      and l.organization_origin_id is distinct from parent.organization_origin_id
  ) then
    raise exception 'Conflicting organization origin through source_lesson_id.';
  end if;

  if exists (
    select 1
    from public.lessons l
    join public.lesson_shares s on s.id = l.source_share_id
    where l.organization_origin_id is not null
      and s.organization_origin_id is not null
      and l.organization_origin_id is distinct from s.organization_origin_id
  ) then
    raise exception 'Conflicting organization origin through source_share_id.';
  end if;

  if exists (
    select 1
    from public.lessons l
    join public.organization_lesson_library lib on lib.id = l.source_organization_library_id
    where l.organization_origin_id is not null
      and l.organization_origin_id is distinct from lib.organization_origin_id
  ) then
    raise exception 'Conflicting organization origin through school library.';
  end if;
end;
$origin_conflicts$;

-- Any legacy public links to school-origin content become invalid immediately.
update public.lesson_shares
set status = 'revoked',
    revoked_at = coalesce(revoked_at, now())
where organization_origin_id is not null
  and status = 'active';

alter table public.lessons
  drop constraint if exists lessons_organization_origin_id_fkey;

alter table public.lessons
  add constraint lessons_organization_origin_id_fkey
  foreign key (organization_origin_id)
  references public.organizations(id)
  on delete restrict;

create index if not exists lessons_organization_origin_idx
  on public.lessons (organization_origin_id)
  where organization_origin_id is not null;

comment on column public.lessons.organization_origin_id is
  'Immutable school-library content origin. Null for personal-origin content; inherited by every school-library import and descendant copy.';

alter table public.lesson_shares
  drop constraint if exists lesson_shares_organization_origin_id_fkey;

alter table public.lesson_shares
  add constraint lesson_shares_organization_origin_id_fkey
  foreign key (organization_origin_id)
  references public.organizations(id)
  on delete restrict;

create index if not exists lesson_shares_organization_origin_idx
  on public.lesson_shares (organization_origin_id)
  where organization_origin_id is not null;

comment on column public.lesson_shares.organization_origin_id is
  'Historical school-content origin captured by old shares. New public shares with a non-null origin are forbidden.';

create or replace function private.assign_organization_library_reuse_family()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_family_id uuid;
  v_source_origin uuid;
begin
  if new.source_lesson_id is not null then
    select l.reuse_family_id, l.organization_origin_id
    into v_family_id, v_source_origin
    from public.lessons l
    where l.id = new.source_lesson_id;

    if not found then
      raise exception 'Organization library source lesson is missing.' using errcode = '23503';
    end if;

    if v_source_origin is not null
       and v_source_origin is distinct from new.organization_id then
      raise exception 'organization_origin_mismatch' using errcode = 'P0001';
    end if;
  end if;

  new.reuse_family_id := coalesce(v_family_id, new.reuse_family_id, gen_random_uuid());
  new.organization_origin_id := new.organization_id;
  return new;
end;
$function$;

revoke all on function private.assign_organization_library_reuse_family()
  from public, anon, authenticated, service_role;

create or replace function private.enforce_organization_library_immutability()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
begin
  if new.id is distinct from old.id
     or new.organization_id is distinct from old.organization_id
     or new.organization_origin_id is distinct from old.organization_origin_id
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
$function$;

revoke all on function private.enforce_organization_library_immutability()
  from public, anon, authenticated, service_role;

create or replace function private.assign_lesson_share_reuse_family()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_owner_id uuid;
  v_family_id uuid;
  v_origin_id uuid;
begin
  select l.owner_id, l.reuse_family_id, l.organization_origin_id
  into v_owner_id, v_family_id, v_origin_id
  from public.lessons l
  where l.id = new.lesson_id;

  if not found then
    raise exception 'Shared lesson source is missing.' using errcode = '23503';
  end if;

  if v_owner_id is distinct from new.owner_id then
    raise exception 'Shared lesson owner must match the source lesson owner.' using errcode = '23514';
  end if;

  if v_origin_id is not null then
    raise exception 'organization_origin_share_forbidden' using errcode = 'P0001';
  end if;

  new.reuse_family_id := v_family_id;
  new.organization_origin_id := null;
  return new;
end;
$function$;

revoke all on function private.assign_lesson_share_reuse_family()
  from public, anon, authenticated, service_role;

create or replace function private.enforce_lesson_share_immutability()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
begin
  if new.id is distinct from old.id
     or new.lesson_id is distinct from old.lesson_id
     or new.owner_id is distinct from old.owner_id
     or new.token is distinct from old.token
     or new.snapshot is distinct from old.snapshot
     or new.reuse_family_id is distinct from old.reuse_family_id
     or new.organization_origin_id is distinct from old.organization_origin_id
     or new.created_at is distinct from old.created_at then
    raise exception 'Shared lesson identity, lineage and snapshot are immutable.' using errcode = '23514';
  end if;

  if old.status = 'revoked' then
    raise exception 'A revoked lesson share cannot be changed.' using errcode = '23514';
  end if;

  return new;
end;
$function$;

revoke all on function private.enforce_lesson_share_immutability()
  from public, anon, authenticated, service_role;

drop trigger if exists enforce_lesson_share_immutability on public.lesson_shares;
create trigger enforce_lesson_share_immutability
before update on public.lesson_shares
for each row
execute function private.enforce_lesson_share_immutability();

create or replace function private.assign_lesson_reuse_family()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_family_id uuid;
  v_family_candidate uuid;
  v_origin_id uuid;
  v_origin_candidate uuid;
begin
  if tg_op = 'UPDATE' then
    if new.reuse_family_id is distinct from old.reuse_family_id then
      raise exception 'Lesson reuse family is immutable.' using errcode = '23514';
    end if;
    if new.organization_origin_id is distinct from old.organization_origin_id then
      raise exception 'Lesson organization origin is immutable.' using errcode = '23514';
    end if;
    return new;
  end if;

  if new.source_lesson_id is not null then
    select l.reuse_family_id, l.organization_origin_id
    into v_family_candidate, v_origin_candidate
    from public.lessons l
    where l.id = new.source_lesson_id;

    if not found then
      raise exception 'Source lesson is missing.' using errcode = '23503';
    end if;

    v_family_id := v_family_candidate;
    v_origin_id := v_origin_candidate;
  end if;

  if new.source_share_id is not null then
    select s.reuse_family_id, s.organization_origin_id
    into v_family_candidate, v_origin_candidate
    from public.lesson_shares s
    where s.id = new.source_share_id;

    if not found then
      raise exception 'Source lesson share is missing.' using errcode = '23503';
    end if;

    if v_family_id is not null and v_family_id is distinct from v_family_candidate then
      raise exception 'Lesson provenance points to conflicting reuse families.' using errcode = '23514';
    end if;
    v_family_id := v_family_candidate;

    if v_origin_id is not null
       and v_origin_candidate is not null
       and v_origin_id is distinct from v_origin_candidate then
      raise exception 'Lesson provenance points to conflicting organization origins.' using errcode = '23514';
    end if;
    v_origin_id := coalesce(v_origin_id, v_origin_candidate);
  end if;

  if new.source_organization_library_id is not null then
    select lib.reuse_family_id, lib.organization_origin_id
    into v_family_candidate, v_origin_candidate
    from public.organization_lesson_library lib
    where lib.id = new.source_organization_library_id;

    if not found then
      raise exception 'Source organization library entry is missing.' using errcode = '23503';
    end if;

    if v_family_id is not null and v_family_id is distinct from v_family_candidate then
      raise exception 'Lesson provenance points to conflicting reuse families.' using errcode = '23514';
    end if;
    v_family_id := v_family_candidate;

    if v_origin_id is not null
       and v_origin_candidate is not null
       and v_origin_id is distinct from v_origin_candidate then
      raise exception 'Lesson provenance points to conflicting organization origins.' using errcode = '23514';
    end if;
    v_origin_id := coalesce(v_origin_id, v_origin_candidate);
  end if;

  new.reuse_family_id := coalesce(v_family_id, new.reuse_family_id, gen_random_uuid());
  new.organization_origin_id := v_origin_id;
  return new;
end;
$function$;

revoke all on function private.assign_lesson_reuse_family()
  from public, anon, authenticated, service_role;

drop trigger if exists assign_lesson_reuse_family on public.lessons;
create trigger assign_lesson_reuse_family
before insert or update of reuse_family_id, organization_origin_id on public.lessons
for each row
execute function private.assign_lesson_reuse_family();

create or replace function public.get_lesson_share(p_token text)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $function$
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
    and s.status = 'active'
    and s.organization_origin_id is null;

  return v_snapshot;
end;
$function$;

revoke all on function public.get_lesson_share(text) from public;
grant execute on function public.get_lesson_share(text) to anon, authenticated;

create or replace function public.import_lesson_share(p_token text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_user_id uuid := auth.uid();
  v_share public.lesson_shares%rowtype;
  v_lesson_id uuid;
  v_request_id uuid;
  v_allowed boolean;
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
    and s.status = 'active'
    and s.organization_origin_id is null;

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

  if not private.lesson_reuse_enabled(v_user_id) then
    select r.request_id, r.allowed
    into v_request_id, v_allowed
    from public.reserve_lesson_import() r;

    if not coalesce(v_allowed, false) or v_request_id is null then
      raise exception 'free_lesson_import_quota_exhausted' using errcode = 'P0001';
    end if;
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
    if v_request_id is not null then
      update public.generation_requests
      set status = 'failed', completed_at = now()
      where id = v_request_id
        and user_id = v_user_id
        and action = 'import_lesson'
        and status = 'pending';
    end if;

    select l.id
    into v_lesson_id
    from public.lessons l
    where l.owner_id = v_user_id
      and l.source_share_id = v_share.id;

    return v_lesson_id;
  end if;

  if v_request_id is not null then
    update public.generation_requests
    set status = 'succeeded',
        lesson_id = v_lesson_id,
        cost_usd = coalesce(cost_usd, 0),
        completed_at = now()
    where id = v_request_id
      and user_id = v_user_id
      and action = 'import_lesson'
      and status = 'pending';
  end if;

  return v_lesson_id;
end;
$function$;

revoke all on function public.import_lesson_share(text) from public, anon;
grant execute on function public.import_lesson_share(text) to authenticated, service_role;

comment on function private.assign_lesson_share_reuse_family() is
  'Copies immutable lesson lineage into a public share and blocks sharing any school-library-origin content.';
comment on function private.assign_lesson_reuse_family() is
  'Assigns immutable reuse lineage plus school-library origin to every new lesson at the database boundary.';
