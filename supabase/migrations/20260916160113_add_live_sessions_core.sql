create table public.sessions (
  id uuid primary key default gen_random_uuid(),
  lesson_id uuid null references public.lessons(id) on delete set null,
  teacher_id uuid not null references auth.users(id) on delete cascade,
  join_code text not null unique,
  status text not null default 'lobby' check (status in ('lobby', 'live', 'ended')),
  active_block_id text null,
  lesson_snapshot jsonb not null,
  realtime_key uuid not null default gen_random_uuid() unique,
  created_at timestamptz not null default now(),
  started_at timestamptz null,
  ended_at timestamptz null,
  constraint sessions_join_code_format check (join_code ~ '^[A-HJ-NP-Z2-9]{7}$')
);

create index sessions_teacher_created_idx on public.sessions (teacher_id, created_at desc);
alter table public.sessions enable row level security;

create policy "teachers_can_view_own_sessions"
on public.sessions for select to authenticated
using ((select auth.uid()) = teacher_id);

create policy "teachers_can_create_sessions_from_own_lessons"
on public.sessions for insert to authenticated
with check (
  (select auth.uid()) = teacher_id
  and lesson_id is not null
  and status = 'lobby'
  and active_block_id is null
  and started_at is null
  and ended_at is null
  and exists (
    select 1 from public.lessons l
    where l.id = lesson_id
      and l.owner_id = (select auth.uid())
      and l.lesson = lesson_snapshot
  )
);

create policy "teachers_can_update_own_sessions"
on public.sessions for update to authenticated
using ((select auth.uid()) = teacher_id)
with check ((select auth.uid()) = teacher_id);

revoke all on table public.sessions from anon;
revoke all on table public.sessions from authenticated;
grant select on table public.sessions to authenticated;
grant insert (lesson_id, teacher_id, join_code, status, active_block_id, lesson_snapshot, realtime_key, started_at, ended_at) on table public.sessions to authenticated;
grant update (status, active_block_id, started_at, ended_at) on table public.sessions to authenticated;

create table public.participants (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.sessions(id) on delete cascade,
  display_name text not null,
  participant_token_hash text not null unique,
  joined_at timestamptz not null default now(),
  last_seen_at timestamptz null,
  constraint participants_display_name_length check (char_length(btrim(display_name)) between 1 and 60),
  constraint participants_token_hash_format check (participant_token_hash ~ '^[0-9a-f]{64}$')
);

create index participants_session_joined_idx on public.participants (session_id, joined_at asc);
alter table public.participants enable row level security;

create policy "teachers_can_view_participants_of_own_sessions"
on public.participants for select to authenticated
using (
  exists (
    select 1 from public.sessions s
    where s.id = session_id
      and s.teacher_id = (select auth.uid())
  )
);

revoke all on table public.participants from anon;
revoke all on table public.participants from authenticated;
grant select on table public.participants to authenticated;
