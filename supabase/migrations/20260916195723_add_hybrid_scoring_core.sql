alter table public.sessions
  add column if not exists scoreboard_revealed boolean not null default false;

grant update (scoreboard_revealed) on public.sessions to authenticated;

create table if not exists public.response_evaluations (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.sessions(id) on delete cascade,
  block_id text not null,
  subject_key text not null,
  participant_id uuid references public.participants(id) on delete cascade,
  team_id uuid references public.teams(id) on delete cascade,
  source_updated_at timestamptz not null,
  status text not null default 'pending',
  max_score integer not null,
  rubric jsonb not null default '[]'::jsonb,
  ai_score integer,
  ai_confidence text,
  ai_rationale text,
  ai_breakdown jsonb,
  teacher_score integer,
  teacher_confirmed boolean not null default false,
  model text,
  cost_usd numeric(12,8),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint response_evaluations_subject_check check ((participant_id is not null) <> (team_id is not null)),
  constraint response_evaluations_status_check check (status in ('pending','completed','failed')),
  constraint response_evaluations_max_score_check check (max_score between 1 and 20),
  constraint response_evaluations_ai_score_check check (ai_score is null or (ai_score >= 0 and ai_score <= max_score)),
  constraint response_evaluations_teacher_score_check check (teacher_score is null or (teacher_score >= 0 and teacher_score <= max_score)),
  constraint response_evaluations_confidence_check check (ai_confidence is null or ai_confidence in ('low','medium','high')),
  constraint response_evaluations_subject_unique unique (session_id, block_id, subject_key)
);

create index if not exists response_evaluations_session_idx
  on public.response_evaluations(session_id);

alter table public.response_evaluations enable row level security;

revoke all on public.response_evaluations from anon;
grant select, insert, update on public.response_evaluations to authenticated;

drop policy if exists response_evaluations_teacher_select on public.response_evaluations;
create policy response_evaluations_teacher_select
on public.response_evaluations for select
to authenticated
using (exists (
  select 1 from public.sessions s
  where s.id = response_evaluations.session_id
    and s.teacher_id = auth.uid()
));

drop policy if exists response_evaluations_teacher_insert on public.response_evaluations;
create policy response_evaluations_teacher_insert
on public.response_evaluations for insert
to authenticated
with check (exists (
  select 1 from public.sessions s
  where s.id = response_evaluations.session_id
    and s.teacher_id = auth.uid()
));

drop policy if exists response_evaluations_teacher_update on public.response_evaluations;
create policy response_evaluations_teacher_update
on public.response_evaluations for update
to authenticated
using (exists (
  select 1 from public.sessions s
  where s.id = response_evaluations.session_id
    and s.teacher_id = auth.uid()
))
with check (exists (
  select 1 from public.sessions s
  where s.id = response_evaluations.session_id
    and s.teacher_id = auth.uid()
));
