alter table public.billing_plans
  add column if not exists organization_library_enabled boolean not null default false;

update public.billing_plans
set organization_library_enabled = case
  when code in ('school', 'campus') then true
  else false
end
where audience = 'organization';

create table public.organization_lesson_library (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  source_lesson_id uuid references public.lessons(id) on delete set null,
  published_by uuid references auth.users(id) on delete set null,
  title text not null check (char_length(trim(title)) between 1 and 200),
  snapshot jsonb not null,
  created_at timestamptz not null default now()
);

create unique index organization_lesson_library_source_unique_idx
  on public.organization_lesson_library (organization_id, source_lesson_id)
  where source_lesson_id is not null;

create index organization_lesson_library_org_created_idx
  on public.organization_lesson_library (organization_id, created_at desc);

alter table public.organization_lesson_library enable row level security;
revoke all on table public.organization_lesson_library from public, anon, authenticated;

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
     or new.snapshot is distinct from old.snapshot
     or new.created_at is distinct from old.created_at then
    raise exception 'Organization library snapshots are immutable.' using errcode = '23514';
  end if;
  return new;
end;
$$;

revoke all on function private.enforce_organization_library_immutability() from public;

create trigger enforce_organization_library_immutability
before update on public.organization_lesson_library
for each row
execute function private.enforce_organization_library_immutability();

alter table public.lessons
  add column if not exists source_organization_library_id uuid
  references public.organization_lesson_library(id) on delete set null;

create unique index lessons_owner_org_library_source_unique_idx
  on public.lessons(owner_id, source_organization_library_id)
  where source_organization_library_id is not null;

create policy lesson_clients_cannot_forge_organization_library_provenance
  on public.lessons
  as restrictive
  for insert
  to authenticated
  with check (source_organization_library_id is null);

create or replace function private.enforce_organization_library_provenance_immutability()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.source_organization_library_id is distinct from old.source_organization_library_id then
    if not (
      old.source_organization_library_id is not null
      and new.source_organization_library_id is null
      and not exists (
        select 1
        from public.organization_lesson_library l
        where l.id = old.source_organization_library_id
      )
    ) then
      raise exception 'Organization library lesson provenance is immutable.' using errcode = '23514';
    end if;
  end if;
  return new;
end;
$$;

revoke all on function private.enforce_organization_library_provenance_immutability() from public;

create trigger enforce_organization_library_provenance_immutability
before update of source_organization_library_id
on public.lessons
for each row
execute function private.enforce_organization_library_provenance_immutability();

create or replace function public.transfer_organization_ownership(
  p_organization_id uuid,
  p_current_owner uuid,
  p_new_owner uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_current_owner = p_new_owner then
    raise exception 'new_owner_must_differ';
  end if;

  if not exists (
    select 1
    from public.organization_memberships om
    where om.organization_id = p_organization_id
      and om.user_id = p_current_owner
      and om.status = 'active'
      and om.role = 'owner'
  ) then
    raise exception 'current_owner_required';
  end if;

  if not exists (
    select 1
    from public.organization_memberships om
    where om.organization_id = p_organization_id
      and om.user_id = p_new_owner
      and om.status = 'active'
      and om.role in ('admin', 'teacher')
  ) then
    raise exception 'new_owner_must_be_active_member';
  end if;

  update public.organization_memberships
  set role = 'admin',
      updated_at = now()
  where organization_id = p_organization_id
    and user_id = p_current_owner
    and status = 'active';

  update public.organization_memberships
  set role = 'owner',
      updated_at = now()
  where organization_id = p_organization_id
    and user_id = p_new_owner
    and status = 'active';

  update public.organizations
  set owner_user_id = p_new_owner,
      updated_at = now()
  where id = p_organization_id;

  if not found then
    raise exception 'organization_not_found';
  end if;
end;
$$;

revoke all on function public.transfer_organization_ownership(uuid, uuid, uuid)
  from public, anon, authenticated;
grant execute on function public.transfer_organization_ownership(uuid, uuid, uuid)
  to service_role;

comment on table public.organization_lesson_library is
  'Immutable lesson snapshots explicitly published into a School/Campus organization library.';
