-- Harden the already-deployed pro-rata foundation without creating a parallel workflow.
create table private.individual_withdrawal_receipts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  snapshot_id uuid not null unique references private.individual_contract_snapshots(id),
  withdrawal_sent_at timestamptz not null,
  withdrawal_received_at timestamptz not null,
  notice_sha256 text not null check (notice_sha256 ~ '^[0-9a-f]{64}$'),
  actor_user_id uuid not null,
  request_id uuid unique references private.individual_withdrawal_requests(id),
  created_at timestamptz not null default now(),
  constraint individual_withdrawal_receipt_order check (withdrawal_sent_at <= withdrawal_received_at)
);
alter table private.individual_withdrawal_receipts enable row level security;
revoke all on private.individual_withdrawal_receipts from public,anon,authenticated,service_role;

create function private.guard_individual_withdrawal_receipt() returns trigger language plpgsql set search_path='' as $$
begin
  if tg_op='DELETE' then raise exception 'individual_withdrawal_receipt_immutable'; end if;
  if row(new.user_id,new.snapshot_id,new.withdrawal_sent_at,new.withdrawal_received_at,new.notice_sha256,new.actor_user_id,new.created_at)
    is distinct from row(old.user_id,old.snapshot_id,old.withdrawal_sent_at,old.withdrawal_received_at,old.notice_sha256,old.actor_user_id,old.created_at)
    or old.request_id is not null or new.request_id is null then raise exception 'individual_withdrawal_receipt_immutable'; end if;
  return new;
end $$;
revoke all on function private.guard_individual_withdrawal_receipt() from public,anon,authenticated;
create trigger individual_withdrawal_receipt_immutable before update or delete on private.individual_withdrawal_receipts
for each row execute function private.guard_individual_withdrawal_receipt();

alter table private.individual_withdrawal_requests
  drop constraint individual_withdrawal_within_window,
  drop constraint individual_withdrawal_requests_status_check,
  add column withdrawal_sent_at timestamptz,
  add column external_checkout_session_id text,
  add column external_invoice_id text,
  add column external_charge_id text,
  add column snapshot_sha256 text,
  add column terms_acceptance_key text,
  add column activation_evidence_event_id text,
  add column calculation_evidence jsonb,
  add column first_attempt_at timestamptz,
  add column lease_until timestamptz,
  add column lease_token uuid,
  add constraint individual_withdrawal_requests_status_check check (status in ('processing','refund_pending','refund_succeeded','completed','needs_attention')),
  add constraint individual_withdrawal_sent_within_window check (withdrawal_sent_at is null or withdrawal_sent_at <= withdrawal_deadline),
  add constraint individual_withdrawal_notice_order check (withdrawal_sent_at is null or withdrawal_sent_at <= withdrawal_received_at),
  add constraint individual_withdrawal_checkout_format check (external_checkout_session_id is null or external_checkout_session_id ~ '^cs_live_[A-Za-z0-9_]+$'),
  add constraint individual_withdrawal_invoice_format check (external_invoice_id is null or external_invoice_id ~ '^in_[A-Za-z0-9_]+$'),
  add constraint individual_withdrawal_charge_format check (external_charge_id is null or external_charge_id ~ '^ch_[A-Za-z0-9_]+$'),
  add constraint individual_withdrawal_snapshot_sha_format check (snapshot_sha256 is null or snapshot_sha256 ~ '^[0-9a-f]{64}$'),
  add constraint individual_withdrawal_calculation_evidence_object check (calculation_evidence is null or jsonb_typeof(calculation_evidence)='object');

create or replace function private.guard_individual_withdrawal_legal_fields() returns trigger language plpgsql set search_path='' as $$
begin
  if row(new.provider,new.livemode,new.user_id,new.snapshot_id,new.external_subscription_id,new.external_payment_intent_id,
    new.plan_code,new.billing_period,new.currency,new.contract_amount_minor,new.payment_amount_minor,new.prior_refunded_minor,
    new.retained_amount_minor,new.target_total_refund_minor,new.refund_amount_minor,new.immediate_performance_requested,
    new.contract_concluded_at,new.service_period_start,new.service_started_at,new.service_period_end,new.withdrawal_sent_at,
    new.withdrawal_received_at,new.withdrawal_deadline,new.calculation_method,new.external_checkout_session_id,
    new.external_invoice_id,new.external_charge_id,new.snapshot_sha256,new.terms_acceptance_key,
    new.activation_evidence_event_id,new.calculation_evidence,new.created_at)
  is distinct from row(old.provider,old.livemode,old.user_id,old.snapshot_id,old.external_subscription_id,old.external_payment_intent_id,
    old.plan_code,old.billing_period,old.currency,old.contract_amount_minor,old.payment_amount_minor,old.prior_refunded_minor,
    old.retained_amount_minor,old.target_total_refund_minor,old.refund_amount_minor,old.immediate_performance_requested,
    old.contract_concluded_at,old.service_period_start,old.service_started_at,old.service_period_end,old.withdrawal_sent_at,
    old.withdrawal_received_at,old.withdrawal_deadline,old.calculation_method,old.external_checkout_session_id,
    old.external_invoice_id,old.external_charge_id,old.snapshot_sha256,old.terms_acceptance_key,
    old.activation_evidence_event_id,old.calculation_evidence,old.created_at)
  then raise exception 'individual_withdrawal_legal_fields_immutable'; end if;
  return new;
end $$;

create function public.register_individual_withdrawal_receipt_for_service(
  p_user_id uuid,p_snapshot_id uuid,p_sent_at timestamptz,p_received_at timestamptz,p_notice_sha256 text,p_actor_user_id uuid
) returns uuid language plpgsql security definer set search_path='' as $$
declare v_id uuid; v_existing private.individual_withdrawal_receipts;
begin
  if p_actor_user_id is distinct from '5bbed66a-c125-4740-947c-946a364c6d3f'::uuid then raise exception 'superadmin_required'; end if;
  if p_sent_at is null or p_received_at is null or p_sent_at>p_received_at or p_received_at>now()
    or p_notice_sha256 !~ '^[0-9a-f]{64}$' then raise exception 'invalid_individual_withdrawal_receipt'; end if;
  if not exists(select 1 from private.individual_contract_snapshots s where s.id=p_snapshot_id and s.user_id=p_user_id and s.livemode) then raise exception 'individual_withdrawal_snapshot_mismatch'; end if;
  insert into private.individual_withdrawal_receipts(user_id,snapshot_id,withdrawal_sent_at,withdrawal_received_at,notice_sha256,actor_user_id)
  values(p_user_id,p_snapshot_id,p_sent_at,p_received_at,p_notice_sha256,p_actor_user_id)
  on conflict(snapshot_id) do nothing returning id into v_id;
  if v_id is null then
    select * into strict v_existing from private.individual_withdrawal_receipts where snapshot_id=p_snapshot_id;
    if row(v_existing.user_id,v_existing.withdrawal_sent_at,v_existing.withdrawal_received_at,v_existing.notice_sha256,v_existing.actor_user_id)
      is distinct from row(p_user_id,p_sent_at,p_received_at,p_notice_sha256,p_actor_user_id) then raise exception 'individual_withdrawal_receipt_conflict'; end if;
    v_id:=v_existing.id;
  end if;
  return v_id;
end $$;

create function public.get_individual_withdrawal_for_service(p_receipt_id uuid)
returns jsonb language sql stable security definer set search_path='' as $$
select jsonb_build_object('receipt',to_jsonb(r),'request',case when w.id is null then null else to_jsonb(w) end)
from private.individual_withdrawal_receipts r left join private.individual_withdrawal_requests w on w.id=r.request_id
where r.id=p_receipt_id;
$$;

create function public.reserve_individual_withdrawal_v2_for_service(
  p_receipt_id uuid,p_subscription_id text,p_contract_concluded_at timestamptz,
  p_service_period_start timestamptz,p_service_started_at timestamptz,p_service_period_end timestamptz,
  p_retained_amount_minor bigint,p_target_total_refund_minor bigint,p_refund_amount_minor bigint,
  p_checkout_session_id text,p_invoice_id text,p_charge_id text,p_snapshot_sha256 text,
  p_terms_acceptance_key text,p_activation_evidence_event_id text,p_calculation_evidence jsonb
) returns jsonb language plpgsql security definer set search_path='' as $$
declare v_receipt private.individual_withdrawal_receipts%rowtype; v_snapshot private.individual_contract_snapshots%rowtype;
v_payment private.stripe_subscription_payments%rowtype; v_count int; v_prior bigint:=0; v_request private.individual_withdrawal_requests%rowtype;
begin
  select * into v_receipt from private.individual_withdrawal_receipts where id=p_receipt_id for update;
  if not found then raise exception 'individual_withdrawal_receipt_missing'; end if;
  if v_receipt.request_id is not null then select * into strict v_request from private.individual_withdrawal_requests where id=v_receipt.request_id; return to_jsonb(v_request); end if;
  if p_subscription_id !~ '^sub_[A-Za-z0-9_]+$' or p_checkout_session_id !~ '^cs_live_[A-Za-z0-9_]+$'
    or p_invoice_id !~ '^in_[A-Za-z0-9_]+$' or p_charge_id !~ '^ch_[A-Za-z0-9_]+$'
    or p_snapshot_sha256 !~ '^[0-9a-f]{64}$' or jsonb_typeof(p_calculation_evidence)<>'object'
    or p_contract_concluded_at is null or v_receipt.withdrawal_sent_at>p_contract_concluded_at+interval '14 days'
    or p_service_period_end<=p_service_period_start or p_service_started_at<p_service_period_start
    or p_service_started_at>=p_service_period_end then raise exception 'invalid_individual_withdrawal_reservation'; end if;
  select * into strict v_snapshot from private.individual_contract_snapshots s where s.id=v_receipt.snapshot_id and s.user_id=v_receipt.user_id and s.livemode;
  select count(*) into v_count from private.stripe_subscription_payments p where p.provider='stripe' and p.livemode and p.user_id=v_receipt.user_id and p.external_subscription_id=p_subscription_id and p.billing_reason='subscription_create';
  if v_count<>1 then raise exception 'individual_withdrawal_payment_ambiguous'; end if;
  select * into strict v_payment from private.stripe_subscription_payments p where p.provider='stripe' and p.livemode and p.user_id=v_receipt.user_id and p.external_subscription_id=p_subscription_id and p.billing_reason='subscription_create';
  if v_payment.external_invoice_id<>p_invoice_id then raise exception 'individual_withdrawal_invoice_mismatch'; end if;
  select coalesce(sum(r.amount_refunded),0)::bigint into v_prior from private.individual_billing_refunds r where r.provider='stripe' and r.livemode and r.user_id=v_receipt.user_id and r.external_subscription_id=p_subscription_id and r.external_payment_intent_id=v_payment.external_payment_intent_id;
  if v_snapshot.amount_minor<>v_payment.amount_paid or v_snapshot.currency<>v_payment.currency
    or v_snapshot.content_sha256<>p_snapshot_sha256 or v_snapshot.terms_acceptance_key<>p_terms_acceptance_key
    or p_retained_amount_minor<0 or p_retained_amount_minor>v_payment.amount_paid
    or p_target_total_refund_minor<>v_payment.amount_paid-p_retained_amount_minor
    or p_refund_amount_minor<>greatest(p_target_total_refund_minor-v_prior,0) then raise exception 'individual_withdrawal_amount_mismatch'; end if;
  insert into private.individual_withdrawal_requests(provider,livemode,user_id,snapshot_id,external_subscription_id,
    external_payment_intent_id,plan_code,billing_period,currency,contract_amount_minor,payment_amount_minor,
    prior_refunded_minor,retained_amount_minor,target_total_refund_minor,refund_amount_minor,
    immediate_performance_requested,contract_concluded_at,service_period_start,service_started_at,service_period_end,
    withdrawal_sent_at,withdrawal_received_at,withdrawal_deadline,calculation_method,external_checkout_session_id,
    external_invoice_id,external_charge_id,snapshot_sha256,terms_acceptance_key,activation_evidence_event_id,calculation_evidence)
  values('stripe',true,v_receipt.user_id,v_receipt.snapshot_id,p_subscription_id,v_payment.external_payment_intent_id,
    v_snapshot.plan_code,v_snapshot.billing_period,v_snapshot.currency,v_snapshot.amount_minor,v_payment.amount_paid,
    v_prior,p_retained_amount_minor,p_target_total_refund_minor,p_refund_amount_minor,v_snapshot.immediate_performance_requested,
    p_contract_concluded_at,p_service_period_start,p_service_started_at,p_service_period_end,v_receipt.withdrawal_sent_at,
    v_receipt.withdrawal_received_at,p_contract_concluded_at+interval '14 days','pro_rata_temporis_v1',p_checkout_session_id,
    p_invoice_id,p_charge_id,p_snapshot_sha256,p_terms_acceptance_key,p_activation_evidence_event_id,p_calculation_evidence)
  returning * into v_request;
  update private.individual_withdrawal_receipts set request_id=v_request.id where id=v_receipt.id;
  return to_jsonb(v_request);
end $$;

create function public.claim_individual_withdrawal_for_service(p_request_id uuid)
returns uuid language plpgsql security definer set search_path='' as $$
declare v_token uuid:=gen_random_uuid();
begin
  update private.individual_withdrawal_requests set first_attempt_at=coalesce(first_attempt_at,now()),lease_until=now()+interval '2 minutes',lease_token=v_token,updated_at=now()
  where id=p_request_id and status in ('processing','refund_pending','refund_succeeded','needs_attention')
    and (lease_until is null or lease_until<now()) and (first_attempt_at is null or first_attempt_at>now()-interval '23 hours');
  if not found then return null; end if; return v_token;
end $$;

create function public.reconcile_individual_withdrawal_refund_for_service(
  p_request_id uuid,p_lease_token uuid,p_refund_id text,p_payment_intent_id text,p_amount bigint,p_currency text,p_status text
) returns void language plpgsql security definer set search_path='' as $$
begin
  if p_refund_id !~ '^re_[A-Za-z0-9_]+$' or p_status not in ('pending','requires_action','succeeded','failed','canceled') then raise exception 'invalid_individual_withdrawal_refund'; end if;
  update private.individual_withdrawal_requests set external_refund_id=p_refund_id,refund_status=p_status,
    refunded_at=case when p_status='succeeded' then coalesce(refunded_at,now()) else refunded_at end,
    status=case when p_status='succeeded' and subscription_cancelled_at is not null then 'completed'
      when p_status='succeeded' then 'refund_succeeded' when p_status='pending' then 'refund_pending' else 'needs_attention' end,
    failure_stage=case when p_status in ('failed','canceled','requires_action') then 'refund' else null end,
    failure_code=case when p_status in ('failed','canceled','requires_action') then 'stripe_refund_'||p_status else null end,
    updated_at=now()
  where id=p_request_id and (p_lease_token is null or lease_token=p_lease_token)
    and external_payment_intent_id=p_payment_intent_id and refund_amount_minor=p_amount and currency=p_currency
    and (external_refund_id is null or external_refund_id=p_refund_id);
  if not found then raise exception 'individual_withdrawal_refund_evidence_mismatch'; end if;
end $$;

create function public.record_individual_withdrawal_cancellation_for_service(p_request_id uuid,p_lease_token uuid,p_cancelled_at timestamptz)
returns void language plpgsql security definer set search_path='' as $$
begin
  update private.individual_withdrawal_requests set subscription_cancelled_at=coalesce(subscription_cancelled_at,p_cancelled_at),
    status=case when refund_amount_minor=0 or refund_status='succeeded' then 'completed' else status end,
    lease_until=null,lease_token=null,updated_at=now()
  where id=p_request_id and lease_token=p_lease_token and p_cancelled_at is not null;
  if not found then raise exception 'individual_withdrawal_cancellation_evidence_mismatch'; end if;
end $$;

create function public.fail_individual_withdrawal_execution_for_service(p_request_id uuid,p_lease_token uuid,p_failure_stage text,p_failure_code text)
returns void language plpgsql security definer set search_path='' as $$
begin
  update private.individual_withdrawal_requests set status='needs_attention',failure_stage=p_failure_stage,
    failure_code=left(p_failure_code,120),lease_until=null,lease_token=null,updated_at=now()
  where id=p_request_id and lease_token=p_lease_token and p_failure_stage in ('refund','cancellation','finalize');
  if not found then raise exception 'individual_withdrawal_failure_evidence_mismatch'; end if;
end $$;

revoke all on function public.register_individual_withdrawal_receipt_for_service(uuid,uuid,timestamptz,timestamptz,text,uuid),
  public.get_individual_withdrawal_for_service(uuid),
  public.reserve_individual_withdrawal_v2_for_service(uuid,text,timestamptz,timestamptz,timestamptz,timestamptz,bigint,bigint,bigint,text,text,text,text,text,text,jsonb),
  public.claim_individual_withdrawal_for_service(uuid),
  public.reconcile_individual_withdrawal_refund_for_service(uuid,uuid,text,text,bigint,text,text),
  public.record_individual_withdrawal_cancellation_for_service(uuid,uuid,timestamptz),
  public.fail_individual_withdrawal_execution_for_service(uuid,uuid,text,text)
from public,anon,authenticated;
grant execute on function public.register_individual_withdrawal_receipt_for_service(uuid,uuid,timestamptz,timestamptz,text,uuid),
  public.get_individual_withdrawal_for_service(uuid),
  public.reserve_individual_withdrawal_v2_for_service(uuid,text,timestamptz,timestamptz,timestamptz,timestamptz,bigint,bigint,bigint,text,text,text,text,text,text,jsonb),
  public.claim_individual_withdrawal_for_service(uuid),
  public.reconcile_individual_withdrawal_refund_for_service(uuid,uuid,text,text,bigint,text,text),
  public.record_individual_withdrawal_cancellation_for_service(uuid,uuid,timestamptz),
  public.fail_individual_withdrawal_execution_for_service(uuid,uuid,text,text)
to service_role;

-- Supersede the baseline mutation path: it did not preserve the notice hash,
-- dispatch timestamp, canonical Stripe references or an execution lease.
revoke all on function
  public.reserve_individual_withdrawal_for_service(uuid,uuid,text,timestamptz,timestamptz,timestamptz,timestamptz,timestamptz,bigint,bigint,bigint),
  public.record_individual_withdrawal_refund_for_service(uuid,text,text,timestamptz),
  public.complete_individual_withdrawal_for_service(uuid,timestamptz),
  public.fail_individual_withdrawal_for_service(uuid,text,text)
from public,anon,authenticated,service_role;
