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

create trigger individual_contract_checkout_links_append_only
before update or delete on private.individual_contract_checkout_links
for each row execute function private.reject_individual_contract_evidence_mutation();

alter table public.billing_email_deliveries
  add column contract_snapshot_id uuid references private.individual_contract_snapshots(id) on delete restrict;

create or replace function public.create_and_link_individual_contract_snapshot(
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
  p_content_sha256 text,
  p_checkout_session_id text
)
returns table(snapshot_id uuid, accepted_at timestamptz, checkout_session_id text)
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
  if p_checkout_session_id !~ '^cs_(test|live)_[A-Za-z0-9_]+$' then raise exception 'contract_checkout_id_invalid'; end if;
  if p_livemode and p_checkout_session_id !~ '^cs_live_' then raise exception 'contract_checkout_mode_mismatch'; end if;
  if not p_livemode and p_checkout_session_id !~ '^cs_test_' then raise exception 'contract_checkout_mode_mismatch'; end if;

  insert into private.individual_contract_snapshots (
    id,user_id,provider,livemode,plan_code,billing_period,currency,amount_minor,
    terms_version,terms_acceptance_key,locale,immediate_performance_requested,
    contract_html,withdrawal_form_html,content_sha256
  ) values (
    p_snapshot_id,p_user_id,'stripe',p_livemode,p_plan_code,p_billing_period,p_currency,p_amount_minor,
    p_terms_version,p_terms_acceptance_key,p_locale,p_immediate_performance_requested,
    p_contract_html,p_withdrawal_form_html,p_content_sha256
  );

  insert into private.individual_contract_checkout_links(
    snapshot_id,provider,livemode,external_checkout_session_id
  ) values (p_snapshot_id,'stripe',p_livemode,p_checkout_session_id);

  return query
  select s.id, s.accepted_at, l.external_checkout_session_id
  from private.individual_contract_snapshots s
  join private.individual_contract_checkout_links l on l.snapshot_id=s.id
  where s.id=p_snapshot_id;
end;
$function$;

revoke all on function public.create_and_link_individual_contract_snapshot(
  uuid,uuid,boolean,text,text,text,bigint,text,text,text,boolean,text,text,text,text
) from public, anon, authenticated;
grant execute on function public.create_and_link_individual_contract_snapshot(
  uuid,uuid,boolean,text,text,text,bigint,text,text,text,boolean,text,text,text,text
) to service_role;

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
