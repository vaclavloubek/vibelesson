create table private.individual_withdrawal_requests (
  id uuid primary key default gen_random_uuid(),
  provider text not null default 'stripe' check (provider = 'stripe'),
  livemode boolean not null,
  user_id uuid not null,
  snapshot_id uuid not null references private.individual_contract_snapshots(id),
  external_subscription_id text not null,
  external_payment_intent_id text not null,
  plan_code text not null check (plan_code in ('teacher', 'teacher_pro')),
  billing_period text not null check (billing_period in ('monthly', 'annual')),
  currency text not null check (currency in ('czk', 'eur', 'usd')),
  contract_amount_minor bigint not null check (contract_amount_minor > 0),
  payment_amount_minor bigint not null check (payment_amount_minor > 0),
  prior_refunded_minor bigint not null check (prior_refunded_minor >= 0 and prior_refunded_minor <= payment_amount_minor),
  retained_amount_minor bigint not null check (retained_amount_minor >= 0 and retained_amount_minor <= payment_amount_minor),
  target_total_refund_minor bigint not null check (target_total_refund_minor >= 0 and target_total_refund_minor <= payment_amount_minor),
  refund_amount_minor bigint not null check (refund_amount_minor >= 0 and refund_amount_minor <= payment_amount_minor),
  immediate_performance_requested boolean not null,
  contract_concluded_at timestamptz not null,
  service_period_start timestamptz not null,
  service_started_at timestamptz not null,
  service_period_end timestamptz not null,
  withdrawal_received_at timestamptz not null,
  withdrawal_deadline timestamptz not null,
  calculation_method text not null default 'pro_rata_temporis_v1'
    check (calculation_method = 'pro_rata_temporis_v1'),
  status text not null default 'processing'
    check (status in ('processing', 'refund_succeeded', 'completed', 'needs_attention')),
  external_refund_id text,
  refund_status text,
  refunded_at timestamptz,
  subscription_cancelled_at timestamptz,
  failure_stage text check (failure_stage is null or failure_stage in ('refund', 'cancellation', 'finalize')),
  failure_code text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (provider, livemode, external_subscription_id),
  constraint individual_withdrawal_subscription_format
    check (external_subscription_id ~ '^sub_[A-Za-z0-9_]+$'),
  constraint individual_withdrawal_payment_intent_format
    check (external_payment_intent_id ~ '^pi_[A-Za-z0-9_]+$'),
  constraint individual_withdrawal_refund_format
    check (external_refund_id is null or external_refund_id ~ '^re_[A-Za-z0-9_]+$'),
  constraint individual_withdrawal_period_order
    check (service_period_end > service_period_start),
  constraint individual_withdrawal_service_start
    check (service_started_at >= service_period_start and service_started_at < service_period_end),
  constraint individual_withdrawal_deadline_check
    check (withdrawal_deadline = contract_concluded_at + interval '14 days'),
  constraint individual_withdrawal_within_window
    check (withdrawal_received_at <= withdrawal_deadline),
  constraint individual_withdrawal_target_math
    check (target_total_refund_minor = payment_amount_minor - retained_amount_minor),
  constraint individual_withdrawal_refund_math
    check (refund_amount_minor = greatest(target_total_refund_minor - prior_refunded_minor, 0))
);

alter table private.individual_withdrawal_requests enable row level security;
revoke all on table private.individual_withdrawal_requests
  from public, anon, authenticated, service_role;

create index individual_withdrawal_requests_user_created_idx
  on private.individual_withdrawal_requests (user_id, created_at desc);

create or replace function private.guard_individual_withdrawal_legal_fields()
returns trigger
language plpgsql
set search_path = ''
as $function$
begin
  if row(
    new.provider, new.livemode, new.user_id, new.snapshot_id,
    new.external_subscription_id, new.external_payment_intent_id,
    new.plan_code, new.billing_period, new.currency,
    new.contract_amount_minor, new.payment_amount_minor, new.prior_refunded_minor,
    new.retained_amount_minor, new.target_total_refund_minor, new.refund_amount_minor,
    new.immediate_performance_requested, new.contract_concluded_at,
    new.service_period_start, new.service_started_at, new.service_period_end,
    new.withdrawal_received_at, new.withdrawal_deadline, new.calculation_method, new.created_at
  ) is distinct from row(
    old.provider, old.livemode, old.user_id, old.snapshot_id,
    old.external_subscription_id, old.external_payment_intent_id,
    old.plan_code, old.billing_period, old.currency,
    old.contract_amount_minor, old.payment_amount_minor, old.prior_refunded_minor,
    old.retained_amount_minor, old.target_total_refund_minor, old.refund_amount_minor,
    old.immediate_performance_requested, old.contract_concluded_at,
    old.service_period_start, old.service_started_at, old.service_period_end,
    old.withdrawal_received_at, old.withdrawal_deadline, old.calculation_method, old.created_at
  ) then
    raise exception 'individual_withdrawal_legal_fields_immutable';
  end if;
  return new;
end;
$function$;

revoke all on function private.guard_individual_withdrawal_legal_fields()
  from public, anon, authenticated, service_role;

create trigger individual_withdrawal_legal_fields_immutable
before update on private.individual_withdrawal_requests
for each row execute function private.guard_individual_withdrawal_legal_fields();

create or replace function public.get_individual_withdrawal_context_for_service(
  p_user_id uuid,
  p_subscription_id text,
  p_snapshot_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare
  v_snapshot private.individual_contract_snapshots%rowtype;
  v_payment private.stripe_subscription_payments%rowtype;
  v_payment_count integer := 0;
  v_prior_refunded bigint := 0;
  v_existing private.individual_withdrawal_requests%rowtype;
begin
  if p_user_id is null or p_subscription_id !~ '^sub_[A-Za-z0-9_]+$' or p_snapshot_id is null then
    raise exception 'invalid_individual_withdrawal_context' using errcode = '22023';
  end if;

  select * into v_snapshot
  from private.individual_contract_snapshots s
  where s.id = p_snapshot_id and s.user_id = p_user_id
    and s.provider = 'stripe' and s.livemode = true;
  if not found then
    return jsonb_build_object('status', 'manual_review', 'reason', 'contract_snapshot_missing');
  end if;

  select count(*) into v_payment_count
  from private.stripe_subscription_payments p
  where p.provider = 'stripe' and p.livemode = true and p.user_id = p_user_id
    and p.external_subscription_id = p_subscription_id
    and p.billing_reason = 'subscription_create';
  if v_payment_count <> 1 then
    return jsonb_build_object('status', 'manual_review', 'reason', 'initial_payment_ambiguous');
  end if;

  select * into v_payment
  from private.stripe_subscription_payments p
  where p.provider = 'stripe' and p.livemode = true and p.user_id = p_user_id
    and p.external_subscription_id = p_subscription_id
    and p.billing_reason = 'subscription_create'
  order by p.paid_at asc limit 1;

  select coalesce(sum(r.amount_refunded), 0)::bigint into v_prior_refunded
  from private.individual_billing_refunds r
  where r.provider = 'stripe' and r.livemode = true and r.user_id = p_user_id
    and r.external_subscription_id = p_subscription_id
    and r.external_payment_intent_id = v_payment.external_payment_intent_id;

  select * into v_existing
  from private.individual_withdrawal_requests w
  where w.provider = 'stripe' and w.livemode = true
    and w.external_subscription_id = p_subscription_id;

  return jsonb_build_object(
    'status', 'ok',
    'snapshot', jsonb_build_object(
      'id', v_snapshot.id, 'planCode', v_snapshot.plan_code,
      'billingPeriod', v_snapshot.billing_period, 'currency', v_snapshot.currency,
      'amountMinor', v_snapshot.amount_minor,
      'immediatePerformanceRequested', v_snapshot.immediate_performance_requested,
      'acceptedAt', v_snapshot.accepted_at, 'termsVersion', v_snapshot.terms_version,
      'termsAcceptanceKey', v_snapshot.terms_acceptance_key
    ),
    'payment', jsonb_build_object(
      'paymentIntentId', v_payment.external_payment_intent_id,
      'amountPaid', v_payment.amount_paid, 'currency', v_payment.currency,
      'paidAt', v_payment.paid_at
    ),
    'priorRefundedMinor', v_prior_refunded,
    'existingWithdrawal', case when v_existing.id is null then null else jsonb_build_object(
      'id', v_existing.id, 'status', v_existing.status,
      'retainedAmountMinor', v_existing.retained_amount_minor,
      'targetTotalRefundMinor', v_existing.target_total_refund_minor,
      'refundAmountMinor', v_existing.refund_amount_minor,
      'externalRefundId', v_existing.external_refund_id,
      'refundStatus', v_existing.refund_status,
      'withdrawalReceivedAt', v_existing.withdrawal_received_at,
      'subscriptionCancelledAt', v_existing.subscription_cancelled_at,
      'failureStage', v_existing.failure_stage, 'failureCode', v_existing.failure_code
    ) end
  );
end;
$function$;

revoke execute on function public.get_individual_withdrawal_context_for_service(uuid, text, uuid)
  from public, anon, authenticated;
grant execute on function public.get_individual_withdrawal_context_for_service(uuid, text, uuid)
  to service_role;

create or replace function public.reserve_individual_withdrawal_for_service(
  p_user_id uuid, p_snapshot_id uuid, p_subscription_id text,
  p_contract_concluded_at timestamptz, p_service_period_start timestamptz,
  p_service_started_at timestamptz, p_service_period_end timestamptz,
  p_withdrawal_received_at timestamptz, p_retained_amount_minor bigint,
  p_target_total_refund_minor bigint, p_refund_amount_minor bigint
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_snapshot private.individual_contract_snapshots%rowtype;
  v_payment private.stripe_subscription_payments%rowtype;
  v_prior_refunded bigint := 0;
  v_request private.individual_withdrawal_requests%rowtype;
begin
  if p_user_id is null or p_snapshot_id is null or p_subscription_id !~ '^sub_[A-Za-z0-9_]+$'
     or p_contract_concluded_at is null or p_service_period_start is null
     or p_service_started_at is null or p_service_period_end is null
     or p_withdrawal_received_at is null or p_service_period_end <= p_service_period_start
     or p_service_started_at < p_service_period_start or p_service_started_at >= p_service_period_end
     or p_withdrawal_received_at > p_contract_concluded_at + interval '14 days'
     or p_retained_amount_minor < 0 or p_target_total_refund_minor < 0 or p_refund_amount_minor < 0 then
    raise exception 'invalid_individual_withdrawal_reservation' using errcode = '22023';
  end if;

  select * into v_snapshot
  from private.individual_contract_snapshots s
  where s.id = p_snapshot_id and s.user_id = p_user_id
    and s.provider = 'stripe' and s.livemode = true;
  if not found then
    raise exception 'individual_withdrawal_snapshot_mismatch' using errcode = 'P0001';
  end if;

  select * into v_payment
  from private.stripe_subscription_payments p
  where p.provider = 'stripe' and p.livemode = true and p.user_id = p_user_id
    and p.external_subscription_id = p_subscription_id
    and p.billing_reason = 'subscription_create'
  order by p.paid_at asc limit 1;
  if not found then
    raise exception 'individual_withdrawal_payment_missing' using errcode = 'P0001';
  end if;

  select coalesce(sum(r.amount_refunded), 0)::bigint into v_prior_refunded
  from private.individual_billing_refunds r
  where r.provider = 'stripe' and r.livemode = true and r.user_id = p_user_id
    and r.external_subscription_id = p_subscription_id
    and r.external_payment_intent_id = v_payment.external_payment_intent_id;

  if v_snapshot.amount_minor <> v_payment.amount_paid
     or v_snapshot.currency <> v_payment.currency
     or p_retained_amount_minor > v_payment.amount_paid
     or p_target_total_refund_minor <> v_payment.amount_paid - p_retained_amount_minor
     or p_refund_amount_minor <> greatest(p_target_total_refund_minor - v_prior_refunded, 0) then
    raise exception 'individual_withdrawal_amount_mismatch' using errcode = 'P0001';
  end if;

  insert into private.individual_withdrawal_requests (
    provider, livemode, user_id, snapshot_id, external_subscription_id,
    external_payment_intent_id, plan_code, billing_period, currency,
    contract_amount_minor, payment_amount_minor, prior_refunded_minor,
    retained_amount_minor, target_total_refund_minor, refund_amount_minor,
    immediate_performance_requested, contract_concluded_at, service_period_start,
    service_started_at, service_period_end, withdrawal_received_at, withdrawal_deadline,
    calculation_method
  ) values (
    'stripe', true, p_user_id, p_snapshot_id, p_subscription_id,
    v_payment.external_payment_intent_id, v_snapshot.plan_code, v_snapshot.billing_period,
    v_snapshot.currency, v_snapshot.amount_minor, v_payment.amount_paid, v_prior_refunded,
    p_retained_amount_minor, p_target_total_refund_minor, p_refund_amount_minor,
    v_snapshot.immediate_performance_requested, p_contract_concluded_at, p_service_period_start,
    p_service_started_at, p_service_period_end, p_withdrawal_received_at,
    p_contract_concluded_at + interval '14 days', 'pro_rata_temporis_v1'
  )
  on conflict (provider, livemode, external_subscription_id) do nothing;

  select * into v_request
  from private.individual_withdrawal_requests w
  where w.provider = 'stripe' and w.livemode = true
    and w.external_subscription_id = p_subscription_id;

  return jsonb_build_object(
    'id', v_request.id, 'status', v_request.status,
    'paymentIntentId', v_request.external_payment_intent_id,
    'refundAmountMinor', v_request.refund_amount_minor,
    'targetTotalRefundMinor', v_request.target_total_refund_minor,
    'retainedAmountMinor', v_request.retained_amount_minor,
    'externalRefundId', v_request.external_refund_id,
    'refundStatus', v_request.refund_status,
    'withdrawalReceivedAt', v_request.withdrawal_received_at,
    'subscriptionCancelledAt', v_request.subscription_cancelled_at,
    'failureStage', v_request.failure_stage, 'failureCode', v_request.failure_code
  );
end;
$function$;

revoke execute on function public.reserve_individual_withdrawal_for_service(
  uuid, uuid, text, timestamptz, timestamptz, timestamptz, timestamptz, timestamptz, bigint, bigint, bigint
) from public, anon, authenticated;
grant execute on function public.reserve_individual_withdrawal_for_service(
  uuid, uuid, text, timestamptz, timestamptz, timestamptz, timestamptz, timestamptz, bigint, bigint, bigint
) to service_role;

create or replace function public.record_individual_withdrawal_refund_for_service(
  p_request_id uuid, p_refund_id text, p_refund_status text, p_refunded_at timestamptz
)
returns void language plpgsql security definer set search_path = ''
as $function$
begin
  if p_request_id is null or p_refund_id !~ '^re_[A-Za-z0-9_]+$' or p_refunded_at is null then
    raise exception 'invalid_individual_withdrawal_refund_result' using errcode = '22023';
  end if;
  update private.individual_withdrawal_requests
  set status='refund_succeeded', external_refund_id=p_refund_id,
      refund_status=nullif(left(coalesce(p_refund_status,''),80),''),
      refunded_at=p_refunded_at, failure_stage=null, failure_code=null, updated_at=now()
  where id=p_request_id and status <> 'completed';
  if not found then raise exception 'individual_withdrawal_request_not_found' using errcode='P0001'; end if;
end;
$function$;
revoke execute on function public.record_individual_withdrawal_refund_for_service(uuid,text,text,timestamptz)
  from public, anon, authenticated;
grant execute on function public.record_individual_withdrawal_refund_for_service(uuid,text,text,timestamptz)
  to service_role;

create or replace function public.complete_individual_withdrawal_for_service(
  p_request_id uuid, p_subscription_cancelled_at timestamptz
)
returns void language plpgsql security definer set search_path = ''
as $function$
begin
  if p_request_id is null or p_subscription_cancelled_at is null then
    raise exception 'invalid_individual_withdrawal_completion' using errcode='22023';
  end if;
  update private.individual_withdrawal_requests
  set status='completed', subscription_cancelled_at=p_subscription_cancelled_at,
      failure_stage=null, failure_code=null, updated_at=now()
  where id=p_request_id;
  if not found then raise exception 'individual_withdrawal_request_not_found' using errcode='P0001'; end if;
end;
$function$;
revoke execute on function public.complete_individual_withdrawal_for_service(uuid,timestamptz)
  from public, anon, authenticated;
grant execute on function public.complete_individual_withdrawal_for_service(uuid,timestamptz)
  to service_role;

create or replace function public.fail_individual_withdrawal_for_service(
  p_request_id uuid, p_failure_stage text, p_failure_code text
)
returns void language plpgsql security definer set search_path = ''
as $function$
begin
  if p_request_id is null or p_failure_stage not in ('refund','cancellation','finalize')
     or nullif(btrim(coalesce(p_failure_code,'')),'') is null then
    raise exception 'invalid_individual_withdrawal_failure' using errcode='22023';
  end if;
  update private.individual_withdrawal_requests
  set status='needs_attention', failure_stage=p_failure_stage,
      failure_code=left(p_failure_code,120), updated_at=now()
  where id=p_request_id and status <> 'completed';
  if not found then raise exception 'individual_withdrawal_request_not_found' using errcode='P0001'; end if;
end;
$function$;
revoke execute on function public.fail_individual_withdrawal_for_service(uuid,text,text)
  from public, anon, authenticated;
grant execute on function public.fail_individual_withdrawal_for_service(uuid,text,text)
  to service_role;

create or replace function private.handle_new_user()
returns trigger language plpgsql security definer set search_path = ''
as $function$
declare
  requested_marketing_consent boolean := lower(coalesce(new.raw_user_meta_data ->> 'marketing_email_consent','false'))='true';
  requested_ui_locale text := case lower(coalesce(new.raw_user_meta_data ->> 'ui_locale',''))
    when 'cs' then 'cs' when 'en' then 'en' else null end;
  requested_terms_acceptance boolean := lower(coalesce(new.raw_user_meta_data ->> 'terms_accepted','false'))='true';
  requested_terms_acceptance_key text := nullif(btrim(coalesce(new.raw_user_meta_data ->> 'terms_acceptance_version','')),'');
  requested_terms_version text := case requested_terms_acceptance_key
    when '2026-09-21-v1' then '1.0'
    when '2026-09-21-v2' then '1.1'
    when '2026-09-21-v3' then '1.2'
    else null end;
  marketing_consent_version constant text := '2026-09-18-v1';
begin
  insert into public.profiles(id,marketing_email_consent,marketing_email_consent_at,marketing_email_consent_version,ui_locale)
  values(new.id,requested_marketing_consent,
    case when requested_marketing_consent then now() else null end,
    case when requested_marketing_consent then marketing_consent_version else null end,
    requested_ui_locale);
  if requested_marketing_consent then
    insert into private.marketing_consent_events(user_id,granted,consent_version,source)
    values(new.id,true,marketing_consent_version,'signup');
  end if;
  if requested_terms_acceptance and requested_terms_version is not null then
    insert into private.terms_acceptance_events(user_id,terms_version,acceptance_key,source)
    values(new.id,requested_terms_version,requested_terms_acceptance_key,'signup')
    on conflict(user_id,acceptance_key,source) do nothing;
  end if;
  return new;
end;
$function$;

create or replace function public.has_terms_acceptance_for_service(p_user_id uuid,p_acceptance_key text)
returns boolean language sql stable security definer set search_path = ''
as $function$
  select p_acceptance_key in ('2026-09-21-v1','2026-09-21-v2','2026-09-21-v3')
    and exists(select 1 from private.terms_acceptance_events tae
      where tae.user_id=p_user_id and tae.acceptance_key=p_acceptance_key);
$function$;
revoke execute on function public.has_terms_acceptance_for_service(uuid,text) from public,anon,authenticated;
grant execute on function public.has_terms_acceptance_for_service(uuid,text) to service_role;

create or replace function public.record_terms_reconsent_for_service(p_user_id uuid,p_acceptance_key text)
returns timestamptz language plpgsql security definer set search_path = ''
as $function$
declare
  accepted timestamptz;
  resolved_terms_version text := case p_acceptance_key
    when '2026-09-21-v1' then '1.0'
    when '2026-09-21-v2' then '1.1'
    when '2026-09-21-v3' then '1.2'
    else null end;
begin
  if resolved_terms_version is null then raise exception 'unsupported_terms_acceptance_key'; end if;
  if not exists(select 1 from auth.users u where u.id=p_user_id) then raise exception 'terms_reconsent_user_not_found'; end if;
  insert into private.terms_acceptance_events(user_id,terms_version,acceptance_key,source)
  values(p_user_id,resolved_terms_version,p_acceptance_key,'reconsent')
  on conflict(user_id,acceptance_key,source) do nothing;
  select tae.accepted_at into accepted from private.terms_acceptance_events tae
  where tae.user_id=p_user_id and tae.acceptance_key=p_acceptance_key and tae.source='reconsent'
  order by tae.accepted_at asc limit 1;
  return accepted;
end;
$function$;
revoke execute on function public.record_terms_reconsent_for_service(uuid,text) from public,anon,authenticated;
grant execute on function public.record_terms_reconsent_for_service(uuid,text) to service_role;
