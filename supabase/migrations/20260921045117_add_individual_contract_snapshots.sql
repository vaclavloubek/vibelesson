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

create table private.individual_contract_checkout_links (
  snapshot_id uuid primary key references private.individual_contract_snapshots(id) on delete restrict,
  provider text not null check (provider = 'stripe'),
  livemode boolean not null,
  external_checkout_session_id text not null unique
    check (external_checkout_session_id ~ '^cs_(test|live)_[A-Za-z0-9_]+$'),
  created_at timestamptz not null default now()
);

alter table private.individual_contract_checkout_links enable row level security;
revoke all on table private.individual_contract_checkout_links from public, anon, authenticated;

create or replace function private.reject_individual_contract_evidence_mutation()
returns trigger
language plpgsql
set search_path = ''
as $function$
begin
  raise exception 'individual contract evidence is append-only';
end;
$function$;

revoke all on function private.reject_individual_contract_evidence_mutation() from public, anon, authenticated;

create trigger individual_contract_snapshots_append_only
before update or delete on private.individual_contract_snapshots
for each row execute function private.reject_individual_contract_evidence_mutation();

create trigger individual_contract_checkout_links_append_only
before update or delete on private.individual_contract_checkout_links
for each row execute function private.reject_individual_contract_evidence_mutation();

create or replace function public.create_individual_contract_snapshot(
  p_snapshot_id uuid,
  p_user_id uuid,
  p_livemode boolean,
  p_plan_code text,
  p_billing_period text,
  p_currency text,
  p_amount_minor bigint,
  p_terms_version text,
  p_terms_acceptance_key text,
  p_locale text,
  p_immediate_performance_requested boolean,
  p_contract_html text,
  p_withdrawal_form_html text,
  p_content_sha256 text
)
returns table(snapshot_id uuid, accepted_at timestamptz)
language plpgsql
security definer
set search_path = ''
as $function$
begin
  if p_snapshot_id is null or p_user_id is null then raise exception 'contract_snapshot_identity_missing'; end if;
  if p_plan_code not in ('teacher','teacher_pro') then raise exception 'contract_snapshot_plan_invalid'; end if;
  if p_billing_period not in ('monthly','annual') then raise exception 'contract_snapshot_period_invalid'; end if;
  if p_currency not in ('czk','eur','usd') then raise exception 'contract_snapshot_currency_invalid'; end if;
  if p_locale not in ('cs','en') then raise exception 'contract_snapshot_locale_invalid'; end if;
  if not coalesce(p_immediate_performance_requested,false) then raise exception 'contract_snapshot_immediate_service_required'; end if;

  insert into private.individual_contract_snapshots (
    id,user_id,provider,livemode,plan_code,billing_period,currency,amount_minor,
    terms_version,terms_acceptance_key,locale,immediate_performance_requested,
    contract_html,withdrawal_form_html,content_sha256
  ) values (
    p_snapshot_id,p_user_id,'stripe',p_livemode,p_plan_code,p_billing_period,p_currency,p_amount_minor,
    p_terms_version,p_terms_acceptance_key,p_locale,p_immediate_performance_requested,
    p_contract_html,p_withdrawal_form_html,p_content_sha256
  );

  return query
  select s.id, s.accepted_at
  from private.individual_contract_snapshots s
  where s.id = p_snapshot_id;
end;
$function$;

revoke all on function public.create_individual_contract_snapshot(
  uuid,uuid,boolean,text,text,text,bigint,text,text,text,boolean,text,text,text
) from public, anon, authenticated;
grant execute on function public.create_individual_contract_snapshot(
  uuid,uuid,boolean,text,text,text,bigint,text,text,text,boolean,text,text,text
) to service_role;

create or replace function public.link_individual_contract_snapshot_checkout(
  p_snapshot_id uuid,
  p_user_id uuid,
  p_livemode boolean,
  p_checkout_session_id text
)
returns void
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_exists boolean;
begin
  select exists(
    select 1
    from private.individual_contract_snapshots s
    where s.id=p_snapshot_id and s.user_id=p_user_id and s.livemode=p_livemode and s.provider='stripe'
  ) into v_exists;
  if not v_exists then raise exception 'contract_snapshot_not_found'; end if;
  if p_checkout_session_id !~ '^cs_(test|live)_[A-Za-z0-9_]+$' then raise exception 'contract_checkout_id_invalid'; end if;
  if p_livemode and p_checkout_session_id !~ '^cs_live_' then raise exception 'contract_checkout_mode_mismatch'; end if;
  if not p_livemode and p_checkout_session_id !~ '^cs_test_' then raise exception 'contract_checkout_mode_mismatch'; end if;

  insert into private.individual_contract_checkout_links(
    snapshot_id,provider,livemode,external_checkout_session_id
  ) values (p_snapshot_id,'stripe',p_livemode,p_checkout_session_id);
end;
$function$;

revoke all on function public.link_individual_contract_snapshot_checkout(uuid,uuid,boolean,text)
  from public, anon, authenticated;
grant execute on function public.link_individual_contract_snapshot_checkout(uuid,uuid,boolean,text)
  to service_role;

create or replace function public.get_individual_contract_snapshot_for_delivery(
  p_snapshot_id uuid,
  p_user_id uuid,
  p_livemode boolean
)
returns table(
  snapshot_id uuid,
  plan_code text,
  billing_period text,
  currency text,
  amount_minor bigint,
  terms_version text,
  terms_acceptance_key text,
  locale text,
  immediate_performance_requested boolean,
  contract_html text,
  withdrawal_form_html text,
  content_sha256 text,
  accepted_at timestamptz,
  external_checkout_session_id text
)
language sql
security definer
set search_path = ''
as $function$
  select
    s.id,s.plan_code,s.billing_period,s.currency,s.amount_minor,s.terms_version,
    s.terms_acceptance_key,s.locale,s.immediate_performance_requested,
    s.contract_html,s.withdrawal_form_html,s.content_sha256,s.accepted_at,
    l.external_checkout_session_id
  from private.individual_contract_snapshots s
  join private.individual_contract_checkout_links l on l.snapshot_id=s.id
  where s.id=p_snapshot_id
    and s.user_id=p_user_id
    and s.livemode=p_livemode
    and s.provider='stripe'
    and l.provider='stripe'
    and l.livemode=p_livemode;
$function$;

revoke all on function public.get_individual_contract_snapshot_for_delivery(uuid,uuid,boolean)
  from public, anon, authenticated;
grant execute on function public.get_individual_contract_snapshot_for_delivery(uuid,uuid,boolean)
  to service_role;

alter table public.billing_email_deliveries
  add column contract_snapshot_id uuid null
  references private.individual_contract_snapshots(id) on delete restrict;

create index billing_email_deliveries_contract_snapshot_idx
  on public.billing_email_deliveries(contract_snapshot_id)
  where contract_snapshot_id is not null;
