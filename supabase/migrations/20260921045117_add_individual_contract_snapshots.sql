create table private.individual_contract_snapshots (
  id uuid primary key,
  user_id uuid not null,
  provider text not null check (provider = 'stripe'),
  livemode boolean not null,
  plan_code text not null check (plan_code in ('teacher','teacher_pro')),
  billing_period text not null check (billing_period in ('monthly','annual')),
  currency text not null check (currency in ('czk','eur','usd')),
  amount_minor bigint not null check (amount_minor >= 0),
  terms_version text not null check (length(trim(terms_version)) > 0),
  terms_acceptance_key text not null check (length(trim(terms_acceptance_key)) > 0),
  locale text not null check (locale in ('cs','en')),
  immediate_performance_requested boolean not null check (immediate_performance_requested),
  contract_html text not null check (length(contract_html) > 1000),
  withdrawal_form_html text not null check (length(withdrawal_form_html) > 300),
  content_sha256 text not null check (content_sha256 ~ '^[0-9a-f]{64}$'),
  accepted_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

comment on table private.individual_contract_snapshots is
  'Immutable evidence of the individual paid contract and Terms accepted before Stripe Checkout. No email is duplicated; retention follows the Privacy Notice and legal-claims needs.';

alter table private.individual_contract_snapshots enable row level security;
revoke all on table private.individual_contract_snapshots from public, anon, authenticated;

create or replace function private.reject_individual_contract_evidence_mutation()
returns trigger
language plpgsql
set search_path = ''
as $function$
begin
  if tg_op = 'DELETE' and current_user = 'postgres' then
    return old;
  end if;
  raise exception 'individual contract evidence is append-only';
end;
$function$;

revoke all on function private.reject_individual_contract_evidence_mutation() from public, anon, authenticated;

create trigger individual_contract_snapshots_append_only
before update or delete on private.individual_contract_snapshots
for each row execute function private.reject_individual_contract_evidence_mutation();
