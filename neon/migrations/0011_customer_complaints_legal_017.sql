-- LEGAL-017: evidenced customer complaints (reklamace).
--
-- A complaint and its resolution are immutable legal records: when the right
-- was exercised, what the complaint says, which remedy was requested, and how
-- and when it was resolved (§ 19 zákona o ochraně spotřebitele). Only email
-- delivery state is mutable. No FK to user tables, so evidence survives
-- account deletion; retention follows the Privacy Notice.
--
-- Server-only: the app reaches these tables over the owner connection; Data
-- API roles get no privileges. Idempotent.

create table if not exists private.customer_complaints (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  submitted_at timestamptz not null default now(),
  resolution_due_at timestamptz not null,
  locale text not null check (locale in ('cs', 'en')),
  contact_email text not null check (length(contact_email) between 3 and 254 and position('@' in contact_email) > 1),
  customer_name text not null check (length(btrim(customer_name)) between 2 and 160),
  subject_area text not null check (subject_area in ('ai_generation', 'live_lesson', 'grading', 'billing', 'account', 'other')),
  description text not null check (length(btrim(description)) between 20 and 5000),
  requested_remedy text not null check (requested_remedy in ('bring_into_conformity', 'price_reduction', 'termination', 'other')),
  remedy_note text check (remedy_note is null or length(remedy_note) <= 1000),
  plan_context text check (plan_context is null or length(plan_context) <= 80),
  payload_sha256 text not null check (payload_sha256 ~ '^[0-9a-f]{64}$'),
  client_request_id uuid not null,
  constraint customer_complaints_due_after_submission check (resolution_due_at > submitted_at),
  constraint customer_complaints_client_request_unique unique (user_id, client_request_id)
);

create index if not exists customer_complaints_user_idx
  on private.customer_complaints (user_id, submitted_at desc);

create table if not exists private.customer_complaint_resolutions (
  complaint_id uuid primary key references private.customer_complaints (id) on delete restrict,
  resolved_at timestamptz not null default now(),
  outcome text not null check (outcome in ('accepted', 'partially_accepted', 'rejected')),
  remedy_applied text check (remedy_applied is null or length(btrim(remedy_applied)) between 2 and 1000),
  explanation text not null check (length(btrim(explanation)) between 10 and 5000),
  resolved_by uuid not null,
  payload_sha256 text not null check (payload_sha256 ~ '^[0-9a-f]{64}$'),
  constraint customer_complaint_resolutions_remedy_required
    check (outcome = 'rejected' or remedy_applied is not null)
);

create table if not exists private.customer_complaint_email_deliveries (
  complaint_id uuid not null references private.customer_complaints (id) on delete restrict,
  kind text not null check (kind in ('receipt', 'resolution')),
  status text not null default 'pending' check (status in ('pending', 'sent', 'failed')),
  attempts integer not null default 0 check (attempts >= 0),
  resend_email_id text,
  last_error_code text,
  sent_at timestamptz,
  updated_at timestamptz not null default now(),
  primary key (complaint_id, kind),
  constraint customer_complaint_email_sent_has_id
    check (status <> 'sent' or (resend_email_id is not null and sent_at is not null))
);

create or replace function private.reject_customer_complaint_evidence_mutation()
returns trigger
language plpgsql
set search_path = ''
as $function$
begin
  raise exception 'customer complaint evidence is append-only';
end;
$function$;

drop trigger if exists customer_complaints_append_only on private.customer_complaints;
create trigger customer_complaints_append_only
  before update or delete on private.customer_complaints
  for each row execute function private.reject_customer_complaint_evidence_mutation();

drop trigger if exists customer_complaint_resolutions_append_only on private.customer_complaint_resolutions;
create trigger customer_complaint_resolutions_append_only
  before update or delete on private.customer_complaint_resolutions
  for each row execute function private.reject_customer_complaint_evidence_mutation();

alter table private.customer_complaints enable row level security;
alter table private.customer_complaint_resolutions enable row level security;
alter table private.customer_complaint_email_deliveries enable row level security;

revoke all on table private.customer_complaints from public;
revoke all on table private.customer_complaint_resolutions from public;
revoke all on table private.customer_complaint_email_deliveries from public;
revoke execute on function private.reject_customer_complaint_evidence_mutation() from public;

do $grants$
declare
  v_role text;
begin
  foreach v_role in array array['anon', 'anonymous', 'authenticated', 'authenticator'] loop
    if exists (select 1 from pg_catalog.pg_roles where rolname = v_role) then
      execute format('revoke all on table private.customer_complaints from %I', v_role);
      execute format('revoke all on table private.customer_complaint_resolutions from %I', v_role);
      execute format('revoke all on table private.customer_complaint_email_deliveries from %I', v_role);
    end if;
  end loop;
end;
$grants$;

comment on table private.customer_complaints is
  'LEGAL-017 append-only complaint receipts: submission time, content, requested remedy and 30-day resolution deadline. No FK to user tables so evidence survives account deletion.';
comment on table private.customer_complaint_resolutions is
  'LEGAL-017 append-only complaint resolutions: outcome, applied remedy or written justification of rejection, time and resolving admin.';
comment on table private.customer_complaint_email_deliveries is
  'LEGAL-017 delivery state of the durable receipt and resolution confirmations; the only mutable complaint table.';
