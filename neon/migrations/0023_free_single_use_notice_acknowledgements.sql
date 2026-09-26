-- Record that a Free teacher closed the "each lesson can be used live once"
-- notice (owner request, 2026-09-26).
--
-- The notice next to "Otevřít hodinu pro studenty" now has "OK, rozumím" and a
-- close button. Each click writes one append-only row here with the server
-- timestamp and the exact notice text shown, so a later complaint that the
-- teacher did not know about the single live use can be answered. The lesson
-- page hides the notice once the teacher acknowledged its current version.
--
-- Like private.terms_acceptance_events: no FK to the account or the lesson, so
-- the evidence is not cascade-deleted with them. Server-only: no grants for API
-- roles (the app writes through the owner connection). Idempotent.

create table if not exists private.free_single_use_notice_acknowledgements (
  id bigint generated always as identity primary key,
  user_id uuid not null,
  lesson_id uuid,
  notice_version text not null check (notice_version ~ '^[a-z0-9-]{1,32}$'),
  locale text not null check (locale in ('cs', 'en')),
  notice_text text not null check (btrim(notice_text) <> ''),
  dismissed_via text not null check (dismissed_via in ('ok', 'close')),
  acknowledged_at timestamptz not null default now()
);

create index if not exists free_single_use_notice_ack_user_version_idx
  on private.free_single_use_notice_acknowledgements (user_id, notice_version);

comment on table private.free_single_use_notice_acknowledgements is
  'Append-only evidence that a Free teacher closed the single live use notice ("OK, rozumím" or the close button). No FK so the evidence survives account or lesson deletion; retention is governed by the privacy notice.';

alter table private.free_single_use_notice_acknowledgements enable row level security;

revoke all on table private.free_single_use_notice_acknowledgements from public;
revoke all on table private.free_single_use_notice_acknowledgements from anon, anonymous, authenticated, authenticator;
revoke all on sequence private.free_single_use_notice_acknowledgements_id_seq from public;
revoke all on sequence private.free_single_use_notice_acknowledgements_id_seq from anon, anonymous, authenticated, authenticator;

create or replace function private.reject_free_single_use_notice_ack_mutation()
returns trigger
language plpgsql
set search_path = ''
as $function$
begin
  raise exception 'free single use notice acknowledgements are append-only';
end;
$function$;

revoke all on function private.reject_free_single_use_notice_ack_mutation() from public;

drop trigger if exists free_single_use_notice_ack_append_only
  on private.free_single_use_notice_acknowledgements;
create trigger free_single_use_notice_ack_append_only
  before update or delete on private.free_single_use_notice_acknowledgements
  for each row execute function private.reject_free_single_use_notice_ack_mutation();
