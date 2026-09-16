-- Reconcile the two initial hybrid-scoring migrations into one authoritative
-- runtime shape. The evaluation table is intentionally server-written: teachers
-- may read their own evaluations, while grading and review mutations go through
-- narrow server-side actions.

alter table public.response_evaluations
  drop constraint if exists response_evaluations_rubric_check;

alter table public.response_evaluations
  add column if not exists rubric_json jsonb;

update public.response_evaluations
set rubric_json = jsonb_build_array(
  jsonb_build_object(
    'id', 'legacy',
    'title', 'Hodnocení',
    'description', rubric,
    'maxPoints', max_points
  )
)
where rubric_json is null;

alter table public.response_evaluations
  alter column rubric_json set default '[]'::jsonb,
  alter column rubric_json set not null;

alter table public.response_evaluations
  drop column rubric;

alter table public.response_evaluations
  rename column rubric_json to rubric;

alter table public.response_evaluations
  add column if not exists answer_snapshot jsonb,
  add column if not exists criterion_scores jsonb not null default '[]'::jsonb,
  add column if not exists teacher_confirmed boolean not null default false,
  add column if not exists teacher_reviewed_at timestamptz,
  add column if not exists teacher_note text,
  add column if not exists grader_version text not null default 'b7-v1';

update public.response_evaluations e
set answer_snapshot = r.answer
from public.responses r
where e.response_id = r.id
  and e.answer_snapshot is null;

update public.response_evaluations e
set answer_snapshot = tr.answer
from public.team_responses tr
where e.team_response_id = tr.id
  and e.answer_snapshot is null;

update public.response_evaluations
set answer_snapshot = '{}'::jsonb
where answer_snapshot is null;

alter table public.response_evaluations
  alter column answer_snapshot set not null;

alter table public.response_evaluations
  drop constraint if exists response_evaluations_status_check;

alter table public.response_evaluations
  alter column status set default 'pending';

alter table public.response_evaluations
  add constraint response_evaluations_status_check
    check (status in ('pending', 'grading', 'graded', 'needs_review', 'failed')),
  add constraint response_evaluations_rubric_json_check
    check (jsonb_typeof(rubric) = 'array' and jsonb_array_length(rubric) between 1 and 6),
  add constraint response_evaluations_answer_snapshot_check
    check (jsonb_typeof(answer_snapshot) = 'object'),
  add constraint response_evaluations_criterion_scores_check
    check (jsonb_typeof(criterion_scores) = 'array'),
  add constraint response_evaluations_teacher_note_check
    check (teacher_note is null or char_length(teacher_note) <= 1000);

-- Bind an evaluation not just to an ID, but also to the exact session, block and
-- participant/team represented by that response.
alter table public.responses
  add constraint responses_id_session_block_participant_key
    unique (id, session_id, block_id, participant_id);

alter table public.team_responses
  add constraint team_responses_id_session_block_team_key
    unique (id, session_id, block_id, team_id);

alter table public.response_evaluations
  drop constraint if exists response_evaluations_response_id_fkey,
  drop constraint if exists response_evaluations_participant_id_fkey,
  drop constraint if exists response_evaluations_team_response_id_fkey,
  drop constraint if exists response_evaluations_team_id_fkey;

alter table public.response_evaluations
  add constraint response_evaluations_response_scope_fkey
    foreign key (response_id, session_id, block_id, participant_id)
    references public.responses(id, session_id, block_id, participant_id)
    on delete cascade,
  add constraint response_evaluations_team_response_scope_fkey
    foreign key (team_response_id, session_id, block_id, team_id)
    references public.team_responses(id, session_id, block_id, team_id)
    on delete cascade;

-- Remove the duplicate/broad policies created by the two initial migrations.
drop policy if exists "teachers can read own response evaluations" on public.response_evaluations;
drop policy if exists "teachers can insert own response evaluations" on public.response_evaluations;
drop policy if exists "teachers can update own response evaluations" on public.response_evaluations;
drop policy if exists response_evaluations_teacher_select on public.response_evaluations;
drop policy if exists response_evaluations_teacher_insert on public.response_evaluations;
drop policy if exists response_evaluations_teacher_update on public.response_evaluations;

revoke all on public.response_evaluations from anon, authenticated;
grant select on public.response_evaluations to authenticated;
grant all on public.response_evaluations to service_role;

create policy response_evaluations_teacher_select
on public.response_evaluations for select
to authenticated
using (exists (
  select 1 from public.sessions s
  where s.id = response_evaluations.session_id
    and s.teacher_id = (select auth.uid())
));
