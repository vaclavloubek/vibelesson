alter table public.organization_lesson_library
  add column if not exists subject text;

alter table public.organization_lesson_library
  drop constraint if exists organization_lesson_library_subject_check;

alter table public.organization_lesson_library
  add constraint organization_lesson_library_subject_check
  check (subject is null or char_length(trim(subject)) between 1 and 80);

update public.organization_lesson_library
set subject = nullif(trim(snapshot->>'subject'), '')
where subject is null
  and snapshot ? 'subject';

create index if not exists organization_lesson_library_org_subject_idx
  on public.organization_lesson_library (organization_id, subject);

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
     or new.created_at is distinct from old.created_at then
    raise exception 'Organization library snapshots are immutable.' using errcode = '23514';
  end if;
  return new;
end;
$$;

revoke all on function private.enforce_organization_library_immutability() from public;

comment on column public.organization_lesson_library.subject is
  'Broad school-subject label copied from immutable lesson snapshot for filtering.';
