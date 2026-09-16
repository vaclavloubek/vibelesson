create table public.teams (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.sessions(id) on delete cascade,
  name text not null,
  sort_order integer not null,
  created_at timestamptz not null default now(),
  constraint teams_name_length check (char_length(trim(name)) between 1 and 60),
  constraint teams_sort_order_nonnegative check (sort_order >= 0),
  constraint teams_session_name_unique unique (session_id, name),
  constraint teams_session_sort_unique unique (session_id, sort_order)
);

alter table public.participants
  add column team_id uuid null references public.teams(id) on delete set null;

create index participants_team_id_idx on public.participants(team_id);
create index teams_session_id_idx on public.teams(session_id, sort_order);

create table public.team_responses (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.sessions(id) on delete cascade,
  team_id uuid not null references public.teams(id) on delete cascade,
  block_id text not null,
  answer jsonb not null,
  updated_by_participant_id uuid null references public.participants(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint team_responses_block_id_length check (char_length(block_id) between 1 and 200),
  constraint team_responses_session_team_block_unique unique (session_id, team_id, block_id)
);

create index team_responses_session_block_idx on public.team_responses(session_id, block_id);

alter table public.teams enable row level security;
alter table public.team_responses enable row level security;

revoke all on public.teams from anon, authenticated;
revoke all on public.team_responses from anon, authenticated;

grant select, insert, update, delete on public.teams to authenticated;
grant select on public.team_responses to authenticated;
grant all on public.teams to service_role;
grant all on public.team_responses to service_role;

grant update(team_id) on public.participants to service_role;

create policy teachers_select_own_session_teams
on public.teams for select to authenticated
using (exists (
  select 1 from public.sessions s
  where s.id = teams.session_id and s.teacher_id = auth.uid()
));

create policy teachers_insert_own_session_teams
on public.teams for insert to authenticated
with check (exists (
  select 1 from public.sessions s
  where s.id = teams.session_id and s.teacher_id = auth.uid() and s.status = 'lobby'
));

create policy teachers_update_own_lobby_teams
on public.teams for update to authenticated
using (exists (
  select 1 from public.sessions s
  where s.id = teams.session_id and s.teacher_id = auth.uid() and s.status = 'lobby'
))
with check (exists (
  select 1 from public.sessions s
  where s.id = teams.session_id and s.teacher_id = auth.uid() and s.status = 'lobby'
));

create policy teachers_delete_own_lobby_teams
on public.teams for delete to authenticated
using (exists (
  select 1 from public.sessions s
  where s.id = teams.session_id and s.teacher_id = auth.uid() and s.status = 'lobby'
));

create policy teachers_select_own_team_responses
on public.team_responses for select to authenticated
using (exists (
  select 1 from public.sessions s
  where s.id = team_responses.session_id and s.teacher_id = auth.uid()
));
