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

drop function public.create_individual_contract_snapshot(
  uuid,uuid,boolean,text,text,text,bigint,text,text,text,boolean,text,text,text
);
drop function public.link_individual_contract_snapshot_checkout(uuid,uuid,boolean,text);
