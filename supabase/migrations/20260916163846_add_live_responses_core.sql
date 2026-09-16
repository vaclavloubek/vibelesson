alter table public.participants
  add constraint participants_session_id_id_key unique (session_id, id);

create table public.responses (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.sessions(id) on delete cascade,
  participant_id uuid not null,
  block_id text not null,
  answer jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint responses_block_id_nonempty check (char_length(btrim(block_id)) >= 1),
  constraint responses_participant_session_fkey foreign key (session_id, participant_id)
    references public.participants(session_id, id) on delete cascade,
  constraint responses_one_per_participant_block unique (session_id, participant_id, block_id)
);

create index responses_session_block_idx
  on public.responses (session_id, block_id, updated_at asc);

alter table public.responses enable row level security;

create policy "teachers_can_view_responses_of_own_sessions"
on public.responses for select to authenticated
using (
  exists (
    select 1 from public.sessions s
    where s.id = session_id
      and s.teacher_id = (select auth.uid())
  )
);

revoke all on table public.responses from anon;
revoke all on table public.responses from authenticated;
grant select on table public.responses to authenticated;
