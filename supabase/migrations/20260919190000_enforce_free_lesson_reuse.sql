-- Free-plan lesson reuse and creation hardening.
-- A lesson becomes archived for Free after the first real participant joins.
-- Any newly inserted Free lesson must consume the same monthly lesson quota,
-- including shared imports and direct Data API inserts.

create table public.lesson_live_usage (
  lesson_id uuid primary key references public.lessons(id) on delete cascade,
  owner_id uuid not null references auth.users(id) on delete cascade,
  first_session_id uuid references public.sessions(id) on delete set null,
  first_used_at timestamptz not null,
  created_at timestamptz not null default now()
);

alter table public.lesson_live_usage enable row level security;

revoke all on table public.lesson_live_usage from public, anon, authenticated;
grant select on table public.lesson_live_usage to authenticated;
grant select, insert, update, delete on table public.lesson_live_usage to service_role;

create policy users_can_view_own_lesson_live_usage
on public.lesson_live_usage
for select
to authenticated
using ((select auth.uid()) = owner_id);

create or replace function private.lesson_reuse_enabled(p_user_id uuid)
returns boolean
language sql
security definer
set search_path = ''
as $$
  select coalesce((
    select
      p.role = 'admin'
      or coalesce(p.active_plan_code, 'free') <> 'free'
      or exists (
        select 1
        from private.current_active_organization(p_user_id) cao
      )
    from public.profiles p
    where p.id = p_user_id
  ), false);
$$;

create or replace function public.lesson_reuse_enabled()
returns boolean
language sql
security definer
set search_path = ''
as $$
  select case
    when auth.uid() is null then false
    else private.lesson_reuse_enabled(auth.uid())
  end;
$$;

revoke all on function public.lesson_reuse_enabled() from public, anon;
grant execute on function public.lesson_reuse_enabled() to authenticated, service_role;

insert into public.lesson_live_usage (lesson_id, owner_id, first_session_id, first_used_at)
select distinct on (s.lesson_id)
  s.lesson_id,
  s.teacher_id,
  s.id,
  p.joined_at
from public.sessions s
join public.participants p on p.session_id = s.id
join public.lessons l on l.id = s.lesson_id
where s.lesson_id is not null
order by s.lesson_id, p.joined_at asc, s.created_at asc
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
begin
  select s.lesson_id, s.teacher_id
  into v_lesson_id, v_owner_id
  from public.sessions s
  where s.id = new.session_id;

  if v_lesson_id is null or v_owner_id is null then
    return new;
  end if;

  insert into public.lesson_live_usage (
    lesson_id,
    owner_id,
    first_session_id,
    first_used_at
  )
  values (
    v_lesson_id,
    v_owner_id,
    new.session_id,
    new.joined_at
  )
  on conflict (lesson_id) do nothing;

  return new;
end;
$$;

drop trigger if exists participants_record_lesson_live_usage on public.participants;
create trigger participants_record_lesson_live_usage
after insert on public.participants
for each row
execute function private.record_lesson_live_usage();

create or replace function private.enforce_free_lesson_reuse()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.lesson_id is null then
    return new;
  end if;

  if private.lesson_reuse_enabled(new.teacher_id) then
    return new;
  end if;

  if exists (
    select 1
    from public.lesson_live_usage u
    where u.lesson_id = new.lesson_id
  ) then
    raise exception 'free_lesson_replay_locked' using errcode = 'P0001';
  end if;

  return new;
end;
$$;

drop trigger if exists sessions_enforce_free_lesson_reuse on public.sessions;
create trigger sessions_enforce_free_lesson_reuse
before insert on public.sessions
for each row
execute function private.enforce_free_lesson_reuse();

create or replace function private.enforce_free_lesson_creation_quota()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_request_id uuid;
  v_allowed boolean;
begin
  -- Server-side service-role imports have no end-user auth.uid() and keep their
  -- own organization entitlement checks.
  if v_user_id is null or new.owner_id <> v_user_id then
    return new;
  end if;

  if private.lesson_reuse_enabled(v_user_id) then
    return new;
  end if;

  select g.id
  into v_request_id
  from public.generation_requests g
  where g.user_id = v_user_id
    and g.organization_id is null
    and g.action = 'generate_lesson'
    and g.status = 'pending'
    and g.lesson_id is null
    and g.created_at >= now() - interval '10 minutes'
  order by g.created_at desc
  for update skip locked
  limit 1;

  if v_request_id is null then
    select r.request_id, r.allowed
    into v_request_id, v_allowed
    from public.reserve_lesson_generation() r;

    if not coalesce(v_allowed, false) or v_request_id is null then
      raise exception 'free_lesson_quota_exhausted' using errcode = 'P0001';
    end if;
  end if;

  update public.generation_requests
  set status = 'succeeded',
      lesson_id = new.id,
      cost_usd = coalesce(cost_usd, 0),
      completed_at = now()
  where id = v_request_id
    and user_id = v_user_id
    and status = 'pending';

  if not found then
    raise exception 'free_lesson_quota_reservation_required' using errcode = 'P0001';
  end if;

  return new;
end;
$$;

drop trigger if exists lessons_enforce_free_creation_quota on public.lessons;
create trigger lessons_enforce_free_creation_quota
before insert on public.lessons
for each row
execute function private.enforce_free_lesson_creation_quota();

comment on table public.lesson_live_usage is
  'Immutable first-real-use ledger for lesson replay entitlement. A row is created when the first participant joins a session for the lesson.';

comment on function public.lesson_reuse_enabled() is
  'Returns whether the current authenticated user may reuse previously taught lessons live without the Free replay lock.';
