-- Lock school-library-origin lessons when the owner no longer has an active
-- membership in the originating organization or the organization is not active.
--
-- The lesson remains visible and deletable. Mutating it, duplicating it, starting
-- a new live session from it, exporting it, or otherwise consuming licensed school
-- content requires an active origin license.
--
-- Individual paid plans never substitute for the originating organization's license.

create or replace function private.organization_origin_access_enabled(
  p_user_id uuid,
  p_organization_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $function$
  select
    exists (
      select 1
      from public.profiles p
      where p.id = p_user_id
        and p.role = 'admin'
    )
    or exists (
      select 1
      from public.organization_memberships m
      join public.organizations o on o.id = m.organization_id
      where m.user_id = p_user_id
        and m.organization_id = p_organization_id
        and m.status = 'active'
        and m.revoked_at is null
        and o.status = 'active'
    );
$function$;

revoke all on function private.organization_origin_access_enabled(uuid, uuid)
  from public, anon, authenticated, service_role;

comment on function private.organization_origin_access_enabled(uuid, uuid) is
  'Returns whether a user currently holds the originating organization license for school-library content. Individual personal plans do not satisfy this check; internal admins are exempt.';

create or replace function private.enforce_organization_origin_lesson_write_access()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_origin_id uuid;
begin
  v_origin_id := coalesce(old.organization_origin_id, new.organization_origin_id);

  if v_origin_id is null then
    return new;
  end if;

  if not private.organization_origin_access_enabled(new.owner_id, v_origin_id) then
    raise exception 'organization_origin_access_required' using errcode = 'P0001';
  end if;

  return new;
end;
$function$;

revoke all on function private.enforce_organization_origin_lesson_write_access()
  from public, anon, authenticated, service_role;

drop trigger if exists zz_lessons_enforce_organization_origin_access on public.lessons;
create trigger zz_lessons_enforce_organization_origin_access
before insert or update on public.lessons
for each row
execute function private.enforce_organization_origin_lesson_write_access();

alter table public.sessions
  add column if not exists organization_origin_id uuid;

update public.sessions s
set organization_origin_id = l.organization_origin_id
from public.lessons l
where s.lesson_id = l.id
  and s.organization_origin_id is null
  and l.organization_origin_id is not null;

alter table public.sessions
  drop constraint if exists sessions_organization_origin_id_fkey;

alter table public.sessions
  add constraint sessions_organization_origin_id_fkey
  foreign key (organization_origin_id)
  references public.organizations(id)
  on delete restrict;

create index if not exists sessions_organization_origin_idx
  on public.sessions (organization_origin_id)
  where organization_origin_id is not null;

comment on column public.sessions.organization_origin_id is
  'Immutable school-library origin captured when a live session is created, so access revocation also applies to already-open sessions.';

create or replace function private.enforce_organization_origin_session_access()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_origin_id uuid;
begin
  if new.lesson_id is null then
    return new;
  end if;

  select l.organization_origin_id
  into v_origin_id
  from public.lessons l
  where l.id = new.lesson_id
    and l.owner_id = new.teacher_id;

  if not found then
    return new;
  end if;

  new.organization_origin_id := v_origin_id;

  if v_origin_id is not null
     and not private.organization_origin_access_enabled(new.teacher_id, v_origin_id) then
    raise exception 'organization_origin_access_required' using errcode = 'P0001';
  end if;

  return new;
end;
$function$;

revoke all on function private.enforce_organization_origin_session_access()
  from public, anon, authenticated, service_role;

drop trigger if exists sessions_enforce_organization_origin_access on public.sessions;
create trigger sessions_enforce_organization_origin_access
before insert on public.sessions
for each row
execute function private.enforce_organization_origin_session_access();

create or replace function private.enforce_organization_origin_live_write()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_teacher_id uuid;
  v_origin_id uuid;
begin
  select s.teacher_id, s.organization_origin_id
  into v_teacher_id, v_origin_id
  from public.sessions s
  where s.id = new.session_id;

  if not found or v_origin_id is null then
    return new;
  end if;

  if not private.organization_origin_access_enabled(v_teacher_id, v_origin_id) then
    raise exception 'organization_origin_access_required' using errcode = 'P0001';
  end if;

  return new;
end;
$function$;

revoke all on function private.enforce_organization_origin_live_write()
  from public, anon, authenticated, service_role;

drop trigger if exists participants_enforce_organization_origin_access on public.participants;
create trigger participants_enforce_organization_origin_access
before insert or update of team_id on public.participants
for each row
execute function private.enforce_organization_origin_live_write();

drop trigger if exists responses_enforce_organization_origin_access on public.responses;
create trigger responses_enforce_organization_origin_access
before insert or update on public.responses
for each row
execute function private.enforce_organization_origin_live_write();

drop trigger if exists team_responses_enforce_organization_origin_access on public.team_responses;
create trigger team_responses_enforce_organization_origin_access
before insert or update on public.team_responses
for each row
execute function private.enforce_organization_origin_live_write();

drop trigger if exists team_edit_locks_enforce_organization_origin_access on public.team_edit_locks;
create trigger team_edit_locks_enforce_organization_origin_access
before insert or update on public.team_edit_locks
for each row
execute function private.enforce_organization_origin_live_write();

create or replace function private.enforce_organization_origin_session_update()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
begin
  if new.organization_origin_id is distinct from old.organization_origin_id then
    raise exception 'Session organization origin is immutable.' using errcode = '23514';
  end if;

  if old.organization_origin_id is null then
    return new;
  end if;

  -- Cleanup must remain possible after a license is revoked.
  if new.status = 'ended' then
    return new;
  end if;

  if not private.organization_origin_access_enabled(old.teacher_id, old.organization_origin_id) then
    raise exception 'organization_origin_access_required' using errcode = 'P0001';
  end if;

  return new;
end;
$function$;

revoke all on function private.enforce_organization_origin_session_update()
  from public, anon, authenticated, service_role;

drop trigger if exists sessions_enforce_organization_origin_access_update on public.sessions;
create trigger sessions_enforce_organization_origin_access_update
before update on public.sessions
for each row
execute function private.enforce_organization_origin_session_update();

comment on function private.enforce_organization_origin_lesson_write_access() is
  'Makes school-origin lessons read-only while their originating organization license is inactive. DELETE remains allowed.';
comment on function private.enforce_organization_origin_session_access() is
  'Captures immutable school origin and blocks new live sessions without an active originating organization license.';
comment on function private.enforce_organization_origin_live_write() is
  'Blocks student/team live writes on already-open school-origin sessions after the originating license becomes inactive.';
comment on function private.enforce_organization_origin_session_update() is
  'Blocks further teacher control of already-open school-origin sessions after license loss while always allowing the session to end.';
