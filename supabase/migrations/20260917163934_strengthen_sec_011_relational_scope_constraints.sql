alter table public.teams
  add constraint teams_session_id_id_key unique (session_id, id);

alter table public.participants
  add constraint participants_session_team_id_key unique (session_id, team_id, id);

create index participants_session_team_idx
  on public.participants (session_id, team_id);

create index team_responses_updater_scope_idx
  on public.team_responses (session_id, team_id, updated_by_participant_id);

create index team_edit_locks_participant_scope_idx
  on public.team_edit_locks (session_id, team_id, participant_id);

alter table public.participants
  add constraint participants_team_scope_fkey
  foreign key (session_id, team_id)
  references public.teams (session_id, id)
  on delete set null (team_id)
  not valid;

alter table public.team_responses
  add constraint team_responses_team_scope_fkey
  foreign key (session_id, team_id)
  references public.teams (session_id, id)
  on delete cascade
  not valid,
  add constraint team_responses_updater_scope_fkey
  foreign key (session_id, team_id, updated_by_participant_id)
  references public.participants (session_id, team_id, id)
  on delete set null (updated_by_participant_id)
  not valid;

alter table public.team_edit_locks
  add constraint team_edit_locks_team_scope_fkey
  foreign key (session_id, team_id)
  references public.teams (session_id, id)
  on delete cascade
  not valid,
  add constraint team_edit_locks_participant_scope_fkey
  foreign key (session_id, team_id, participant_id)
  references public.participants (session_id, team_id, id)
  on delete cascade
  not valid;

alter table public.participants
  validate constraint participants_team_scope_fkey;

alter table public.team_responses
  validate constraint team_responses_team_scope_fkey,
  validate constraint team_responses_updater_scope_fkey;

alter table public.team_edit_locks
  validate constraint team_edit_locks_team_scope_fkey,
  validate constraint team_edit_locks_participant_scope_fkey;

alter table public.participants
  drop constraint participants_team_id_fkey;

alter table public.team_responses
  drop constraint team_responses_team_id_fkey,
  drop constraint team_responses_updated_by_participant_id_fkey;

alter table public.team_edit_locks
  drop constraint team_edit_locks_team_id_fkey,
  drop constraint team_edit_locks_participant_id_fkey;
