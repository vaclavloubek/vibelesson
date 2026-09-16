alter table public.sessions
  add column if not exists scoreboard_revealed boolean not null default false;

grant update (scoreboard_revealed) on public.sessions to authenticated;

create table if not exists public.response_evaluations (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.sessions(id) on delete cascade,
  block_id text not null check (char_length(block_id) between 1 and 200),
  participant_id uuid references public.participants(id) on delete cascade,
  team_id uuid references public.teams(id) on delete cascade,
  response_id uuid unique references public.responses(id) on delete cascade,
  team_response_id uuid unique references public.team_responses(id) on delete cascade,
  source_updated_at timestamptz not null,
  status text not null default 'grading' check (status in ('grading', 'graded', 'needs_review', 'failed')),
  max_points integer not null check (max_points between 1 and 20),
  ai_score integer,
  teacher_score integer,
  rationale text,
  confidence double precision,
  rubric text not null check (char_length(rubric) between 1 and 4000),
  model text,
  cost_usd numeric(12, 6),
  error text,
  evaluated_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint response_evaluations_source_check check (
    (response_id is not null and participant_id is not null and team_response_id is null and team_id is null)
    or
    (team_response_id is not null and team_id is not null and response_id is null and participant_id is null)
  ),
  constraint response_evaluations_ai_score_check check (ai_score is null or (ai_score >= 0 and ai_score <= max_points)),
  constraint response_evaluations_teacher_score_check check (teacher_score is null or (teacher_score >= 0 and teacher_score <= max_points)),
  constraint response_evaluations_confidence_check check (confidence is null or (confidence >= 0 and confidence <= 1)),
  constraint response_evaluations_cost_check check (cost_usd is null or cost_usd >= 0),
  constraint response_evaluations_rationale_check check (rationale is null or char_length(rationale) <= 2000),
  constraint response_evaluations_error_check check (error is null or char_length(error) <= 1000)
);

create index if not exists response_evaluations_session_block_idx
  on public.response_evaluations(session_id, block_id);
create index if not exists response_evaluations_participant_idx
  on public.response_evaluations(session_id, participant_id)
  where participant_id is not null;
create index if not exists response_evaluations_team_idx
  on public.response_evaluations(session_id, team_id)
  where team_id is not null;
create index if not exists response_evaluations_status_idx
  on public.response_evaluations(session_id, status);

alter table public.response_evaluations enable row level security;

revoke all on public.response_evaluations from anon;
grant select, insert, update on public.response_evaluations to authenticated;

create policy "teachers can read own response evaluations"
  on public.response_evaluations
  for select
  to authenticated
  using (
    exists (
      select 1 from public.sessions s
      where s.id = response_evaluations.session_id
        and s.teacher_id = auth.uid()
    )
  );

create policy "teachers can insert own response evaluations"
  on public.response_evaluations
  for insert
  to authenticated
  with check (
    exists (
      select 1 from public.sessions s
      where s.id = response_evaluations.session_id
        and s.teacher_id = auth.uid()
    )
  );

create policy "teachers can update own response evaluations"
  on public.response_evaluations
  for update
  to authenticated
  using (
    exists (
      select 1 from public.sessions s
      where s.id = response_evaluations.session_id
        and s.teacher_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from public.sessions s
      where s.id = response_evaluations.session_id
        and s.teacher_id = auth.uid()
    )
  );
