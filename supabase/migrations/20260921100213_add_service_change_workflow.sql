-- LEGAL-010: versioned hybrid workflow for changes to a continuously supplied
-- digital service. Legal evidence is private; every callable RPC is service-only.

create table private.service_change_releases (
  id uuid primary key default gen_random_uuid(),
  change_key text not null unique check (change_key ~ '^[a-z0-9][a-z0-9._-]{2,79}$'),
  policy_version text not null check (policy_version = 'hybrid-v1'),
  terms_version text not null,
  terms_acceptance_key text not null,
  classification text not null check (classification in ('conformity_or_security','beneficial_or_minor','material_adverse')),
  strategy text not null check (strategy in ('apply','grandfather','durable_notice')),
  reason_code text not null check (reason_code in ('security','legal','compatibility','supplier','capacity','product_improvement')),
  reason_cs text not null check (char_length(btrim(reason_cs)) between 10 and 2000),
  reason_en text not null check (char_length(btrim(reason_en)) between 10 and 2000),
  impact_cs text not null check (char_length(btrim(impact_cs)) between 10 and 4000),
  impact_en text not null check (char_length(btrim(impact_en)) between 10 and 4000),
  effective_at timestamptz not null,
  legacy_available boolean not null,
  target_plan_codes text[] not null check (cardinality(target_plan_codes) between 1 and 5),
  additional_cost boolean not null default false check (not additional_cost),
  content_sha256 text not null check (content_sha256 ~ '^[0-9a-f]{64}$'),
  actor_user_id uuid not null,
  created_at timestamptz not null default now(),
  check (
    (classification = 'material_adverse' and strategy in ('grandfather','durable_notice'))
    or (classification <> 'material_adverse' and strategy = 'apply')
  ),
  check ((strategy = 'grandfather') = legacy_available),
  check (strategy <> 'durable_notice' or effective_at >= created_at + interval '30 days')
);

create table private.service_change_deliveries (
  id uuid primary key default gen_random_uuid(),
  release_id uuid not null references private.service_change_releases(id),
  recipient_kind text not null check (recipient_kind in ('individual','organization')),
  subject_id uuid not null,
  external_subscription_id text,
  plan_code text not null,
  billing_period text check (billing_period is null or billing_period in ('monthly','annual')),
  paid_period_start timestamptz,
  paid_period_end timestamptz,
  locale text not null check (locale in ('cs','en')),
  legacy_preserved_until timestamptz,
  status text not null default 'pending' check (status in ('pending','claimed','sent','failed')),
  attempt_count integer not null default 0 check (attempt_count between 0 and 10),
  lease_token uuid,
  lease_until timestamptz,
  recipient_email_sha256 text check (recipient_email_sha256 is null or recipient_email_sha256 ~ '^[0-9a-f]{64}$'),
  notice_sha256 text check (notice_sha256 is null or notice_sha256 ~ '^[0-9a-f]{64}$'),
  provider_message_id text,
  sent_at timestamptz,
  termination_deadline timestamptz,
  last_error_code text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (release_id, recipient_kind, subject_id),
  check ((recipient_kind = 'individual') = (external_subscription_id is not null)),
  check (external_subscription_id is null or external_subscription_id ~ '^sub_[A-Za-z0-9_]+$'),
  check (
    (paid_period_start is null and paid_period_end is null)
    or (paid_period_start is not null and paid_period_end > paid_period_start)
  ),
  check (status <> 'sent' or (sent_at is not null and notice_sha256 is not null and recipient_email_sha256 is not null)),
  check (termination_deadline is null or termination_deadline >= sent_at)
);

create index service_change_deliveries_queue_idx
  on private.service_change_deliveries (status, lease_until, created_at);
create index service_change_deliveries_subject_idx
  on private.service_change_deliveries (recipient_kind, subject_id, sent_at desc);

create table private.service_change_termination_requests (
  id uuid primary key default gen_random_uuid(),
  release_id uuid not null references private.service_change_releases(id),
  delivery_id uuid not null unique references private.service_change_deliveries(id),
  user_id uuid not null,
  external_subscription_id text not null check (external_subscription_id ~ '^sub_[A-Za-z0-9_]+$'),
  requested_at timestamptz not null,
  legal_deadline timestamptz not null,
  status text not null default 'requested' check (status in ('requested','processing','refund_pending','refund_succeeded','completed','needs_attention')),
  external_invoice_id text check (external_invoice_id is null or external_invoice_id ~ '^in_[A-Za-z0-9_]+$'),
  external_payment_intent_id text check (external_payment_intent_id is null or external_payment_intent_id ~ '^pi_[A-Za-z0-9_]+$'),
  external_charge_id text check (external_charge_id is null or external_charge_id ~ '^ch_[A-Za-z0-9_]+$'),
  external_refund_id text check (external_refund_id is null or external_refund_id ~ '^re_[A-Za-z0-9_]+$'),
  currency text check (currency is null or currency in ('czk','eur','usd')),
  payment_amount_minor bigint check (payment_amount_minor is null or payment_amount_minor >= 0),
  prior_refunded_minor bigint check (prior_refunded_minor is null or prior_refunded_minor >= 0),
  retained_amount_minor bigint check (retained_amount_minor is null or retained_amount_minor >= 0),
  target_total_refund_minor bigint check (target_total_refund_minor is null or target_total_refund_minor >= 0),
  refund_amount_minor bigint check (refund_amount_minor is null or refund_amount_minor >= 0),
  paid_period_start timestamptz,
  paid_period_end timestamptz,
  calculation_method text check (calculation_method is null or calculation_method = 'unused-period-v1'),
  calculation_evidence jsonb check (calculation_evidence is null or jsonb_typeof(calculation_evidence) = 'object'),
  refund_status text check (refund_status is null or refund_status in ('pending','requires_action','succeeded','failed','canceled')),
  subscription_cancelled_at timestamptz,
  lease_token uuid,
  lease_until timestamptz,
  first_attempt_at timestamptz,
  failure_stage text,
  failure_code text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (release_id, user_id),
  check (requested_at <= legal_deadline),
  check (
    paid_period_start is null
    or (paid_period_end > paid_period_start and payment_amount_minor is not null and currency is not null)
  )
);

create index service_change_terminations_status_idx
  on private.service_change_termination_requests (status, lease_until, created_at);

alter table private.service_change_releases enable row level security;
alter table private.service_change_deliveries enable row level security;
alter table private.service_change_termination_requests enable row level security;
revoke all on table private.service_change_releases, private.service_change_deliveries,
  private.service_change_termination_requests from public, anon, authenticated, service_role;

create function private.reject_service_change_release_mutation()
returns trigger language plpgsql set search_path = '' as $$
begin
  raise exception 'service_change_release_immutable';
end $$;
create trigger service_change_release_immutable
before update or delete on private.service_change_releases
for each row execute function private.reject_service_change_release_mutation();

create function private.guard_service_change_delivery_evidence()
returns trigger language plpgsql set search_path = '' as $$
begin
  if tg_op = 'DELETE' then raise exception 'service_change_delivery_immutable'; end if;
  if row(new.release_id,new.recipient_kind,new.subject_id,new.external_subscription_id,new.plan_code,
    new.billing_period,new.paid_period_start,new.paid_period_end,new.locale,new.legacy_preserved_until,new.created_at)
    is distinct from row(old.release_id,old.recipient_kind,old.subject_id,old.external_subscription_id,old.plan_code,
    old.billing_period,old.paid_period_start,old.paid_period_end,old.locale,old.legacy_preserved_until,old.created_at)
  then raise exception 'service_change_delivery_legal_fields_immutable'; end if;
  if old.sent_at is not null and row(new.recipient_email_sha256,new.notice_sha256,new.provider_message_id,new.sent_at,new.termination_deadline)
    is distinct from row(old.recipient_email_sha256,old.notice_sha256,old.provider_message_id,old.sent_at,old.termination_deadline)
  then raise exception 'service_change_delivery_sent_evidence_immutable'; end if;
  return new;
end $$;
create trigger service_change_delivery_evidence_guard
before update or delete on private.service_change_deliveries
for each row execute function private.guard_service_change_delivery_evidence();

create function private.guard_service_change_termination_evidence()
returns trigger language plpgsql set search_path = '' as $$
begin
  if tg_op = 'DELETE' then raise exception 'service_change_termination_immutable'; end if;
  if row(new.release_id,new.delivery_id,new.user_id,new.external_subscription_id,new.requested_at,new.legal_deadline,new.created_at)
    is distinct from row(old.release_id,old.delivery_id,old.user_id,old.external_subscription_id,old.requested_at,old.legal_deadline,old.created_at)
  then raise exception 'service_change_termination_legal_fields_immutable'; end if;
  if old.calculation_evidence is not null and row(new.external_invoice_id,new.external_payment_intent_id,new.external_charge_id,
    new.currency,new.payment_amount_minor,new.prior_refunded_minor,new.retained_amount_minor,new.target_total_refund_minor,
    new.refund_amount_minor,new.paid_period_start,new.paid_period_end,new.calculation_method,new.calculation_evidence)
    is distinct from row(old.external_invoice_id,old.external_payment_intent_id,old.external_charge_id,
    old.currency,old.payment_amount_minor,old.prior_refunded_minor,old.retained_amount_minor,old.target_total_refund_minor,
    old.refund_amount_minor,old.paid_period_start,old.paid_period_end,old.calculation_method,old.calculation_evidence)
  then raise exception 'service_change_termination_calculation_immutable'; end if;
  return new;
end $$;
create trigger service_change_termination_evidence_guard
before update or delete on private.service_change_termination_requests
for each row execute function private.guard_service_change_termination_evidence();

create function public.publish_service_change_for_service(
  p_change_key text,p_policy_version text,p_terms_version text,p_terms_acceptance_key text,
  p_classification text,p_strategy text,p_reason_code text,p_reason_cs text,p_reason_en text,
  p_impact_cs text,p_impact_en text,p_effective_at timestamptz,p_legacy_available boolean,
  p_target_plan_codes text[],p_content_sha256 text,p_actor_user_id uuid
) returns uuid language plpgsql security definer set search_path = '' as $$
declare v_release_id uuid; v_now timestamptz := now();
begin
  if not exists(select 1 from public.profiles p where p.id=p_actor_user_id and p.role='admin')
    or p_policy_version<>'hybrid-v1' or p_terms_version<>'1.3' or p_terms_acceptance_key<>'2026-09-21-v4'
    or p_change_key !~ '^[a-z0-9][a-z0-9._-]{2,79}$' or p_content_sha256 !~ '^[0-9a-f]{64}$'
    or p_classification not in ('conformity_or_security','beneficial_or_minor','material_adverse')
    or p_strategy not in ('apply','grandfather','durable_notice')
    or (p_classification='material_adverse') is distinct from (p_strategy in ('grandfather','durable_notice'))
    or (p_strategy='grandfather') is distinct from p_legacy_available
    or (p_strategy='durable_notice' and p_effective_at<v_now+interval '30 days')
    or cardinality(p_target_plan_codes)<1
  then raise exception 'invalid_service_change_release'; end if;
  if exists(select 1 from unnest(p_target_plan_codes) p where p not in ('teacher','teacher_pro','team','school','campus'))
  then raise exception 'invalid_service_change_target_plan'; end if;

  insert into private.service_change_releases(change_key,policy_version,terms_version,terms_acceptance_key,
    classification,strategy,reason_code,reason_cs,reason_en,impact_cs,impact_en,effective_at,legacy_available,
    target_plan_codes,content_sha256,actor_user_id,created_at)
  values(p_change_key,p_policy_version,p_terms_version,p_terms_acceptance_key,p_classification,p_strategy,p_reason_code,
    btrim(p_reason_cs),btrim(p_reason_en),btrim(p_impact_cs),btrim(p_impact_en),p_effective_at,p_legacy_available,
    p_target_plan_codes,p_content_sha256,p_actor_user_id,v_now)
  returning id into v_release_id;

  insert into private.service_change_deliveries(release_id,recipient_kind,subject_id,external_subscription_id,
    plan_code,billing_period,paid_period_start,paid_period_end,locale,legacy_preserved_until)
  select v_release_id,'individual',b.user_id,b.external_subscription_id,b.plan_code,b.billing_period,
    b.current_period_start,b.current_period_end,case when p.ui_locale='en' then 'en' else 'cs' end,
    case when p_strategy='grandfather' then b.current_period_end else null end
  from public.billing_subscriptions b join public.profiles p on p.id=b.user_id
  where b.provider='stripe' and b.livemode and b.status in ('trialing','active','past_due')
    and b.plan_code=any(p_target_plan_codes);

  insert into private.service_change_deliveries(release_id,recipient_kind,subject_id,plan_code,billing_period,
    paid_period_start,paid_period_end,locale,legacy_preserved_until)
  select v_release_id,'organization',o.id,o.plan_code,o.billing_period,o.current_period_start,o.current_period_end,
    case when o.billing_country='CZ' then 'cs' else 'en' end,
    case when p_strategy='grandfather' then o.current_period_end else null end
  from public.organizations o
  where o.status='active' and not coalesce(o.is_internal_test,false) and o.plan_code=any(p_target_plan_codes);
  return v_release_id;
end $$;

create function public.claim_service_change_deliveries_for_service(p_limit integer)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_rows jsonb;
begin
  if p_limit not between 1 and 50 then raise exception 'invalid_service_change_delivery_limit'; end if;
  with selected as (
    select d.id from private.service_change_deliveries d
    where d.status in ('pending','failed') and d.attempt_count<5 and (d.lease_until is null or d.lease_until<now())
    order by d.created_at for update skip locked limit p_limit
  ), claimed as (
    update private.service_change_deliveries d set status='claimed',lease_token=gen_random_uuid(),
      lease_until=now()+interval '2 minutes',attempt_count=d.attempt_count+1,updated_at=now()
    from selected where d.id=selected.id returning d.*
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'deliveryId',c.id,'leaseToken',c.lease_token,'recipientKind',c.recipient_kind,'subjectId',c.subject_id,
    'email',case when c.recipient_kind='individual' then u.email else o.billing_email end,
    'locale',c.locale,'planCode',c.plan_code,'paidPeriodEnd',c.paid_period_end,'legacyPreservedUntil',c.legacy_preserved_until,
    'changeKey',r.change_key,'classification',r.classification,'strategy',r.strategy,'reasonCode',r.reason_code,
    'reasonCs',r.reason_cs,'reasonEn',r.reason_en,'impactCs',r.impact_cs,'impactEn',r.impact_en,
    'effectiveAt',r.effective_at,'releaseSha256',r.content_sha256
  ) order by c.created_at),'[]'::jsonb) into v_rows
  from claimed c join private.service_change_releases r on r.id=c.release_id
  left join auth.users u on c.recipient_kind='individual' and u.id=c.subject_id
  left join public.organizations o on c.recipient_kind='organization' and o.id=c.subject_id;
  return v_rows;
end $$;

create function public.record_service_change_delivery_sent_for_service(
  p_delivery_id uuid,p_lease_token uuid,p_recipient_email_sha256 text,p_notice_sha256 text,
  p_provider_message_id text,p_sent_at timestamptz
) returns void language plpgsql security definer set search_path = '' as $$
begin
  update private.service_change_deliveries d set status='sent',recipient_email_sha256=p_recipient_email_sha256,
    notice_sha256=p_notice_sha256,provider_message_id=p_provider_message_id,sent_at=p_sent_at,
    termination_deadline=case when r.strategy='durable_notice'
      then greatest(p_sent_at,r.effective_at)+interval '30 days' else null end,
    lease_token=null,lease_until=null,last_error_code=null,updated_at=now()
  from private.service_change_releases r
  where d.id=p_delivery_id and d.release_id=r.id and d.status='claimed' and d.lease_token=p_lease_token
    and p_recipient_email_sha256 ~ '^[0-9a-f]{64}$' and p_notice_sha256 ~ '^[0-9a-f]{64}$'
    and p_provider_message_id is not null and p_sent_at between d.created_at and now()+interval '2 minutes';
  if not found then raise exception 'service_change_delivery_evidence_mismatch'; end if;
end $$;

create function public.fail_service_change_delivery_for_service(
  p_delivery_id uuid,p_lease_token uuid,p_error_code text
) returns void language plpgsql security definer set search_path = '' as $$
begin
  update private.service_change_deliveries set status='failed',last_error_code=left(p_error_code,120),
    lease_token=null,lease_until=null,updated_at=now()
  where id=p_delivery_id and status='claimed' and lease_token=p_lease_token;
  if not found then raise exception 'service_change_delivery_failure_mismatch'; end if;
end $$;

create function public.get_service_change_notices_for_user_service(p_user_id uuid)
returns jsonb language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'deliveryId',d.id,'changeKey',r.change_key,'classification',r.classification,'strategy',r.strategy,
    'reasonCs',r.reason_cs,'reasonEn',r.reason_en,'impactCs',r.impact_cs,'impactEn',r.impact_en,
    'effectiveAt',r.effective_at,'sentAt',d.sent_at,'legacyPreservedUntil',d.legacy_preserved_until,
    'terminationDeadline',d.termination_deadline,'terminationRequested',t.id is not null,'terminationStatus',t.status
  ) order by r.effective_at),'[]'::jsonb)
  from private.service_change_deliveries d
  join private.service_change_releases r on r.id=d.release_id
  left join private.service_change_termination_requests t on t.delivery_id=d.id
  where d.recipient_kind='individual' and d.subject_id=p_user_id and d.status='sent';
$$;

create function public.request_service_change_termination_for_service(
  p_user_id uuid,p_delivery_id uuid,p_requested_at timestamptz
) returns uuid language plpgsql security definer set search_path = '' as $$
declare v_delivery private.service_change_deliveries%rowtype; v_release private.service_change_releases%rowtype; v_id uuid;
begin
  select * into v_delivery from private.service_change_deliveries where id=p_delivery_id for update;
  if not found then raise exception 'service_change_delivery_not_found'; end if;
  select * into strict v_release from private.service_change_releases where id=v_delivery.release_id;
  if v_delivery.recipient_kind<>'individual' or v_delivery.subject_id<>p_user_id or v_delivery.status<>'sent'
    or v_release.classification<>'material_adverse' or v_release.strategy<>'durable_notice'
    or v_delivery.termination_deadline is null or p_requested_at>v_delivery.termination_deadline
    or p_requested_at<v_delivery.sent_at or v_delivery.external_subscription_id is null
  then raise exception 'service_change_termination_not_available'; end if;
  insert into private.service_change_termination_requests(release_id,delivery_id,user_id,external_subscription_id,
    requested_at,legal_deadline)
  values(v_release.id,v_delivery.id,p_user_id,v_delivery.external_subscription_id,p_requested_at,v_delivery.termination_deadline)
  on conflict(delivery_id) do nothing returning id into v_id;
  if v_id is null then select id into strict v_id from private.service_change_termination_requests where delivery_id=p_delivery_id; end if;
  return v_id;
end $$;

create function public.get_service_change_termination_for_service(p_request_id uuid)
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object('request',to_jsonb(t),'delivery',to_jsonb(d),'release',to_jsonb(r))
  from private.service_change_termination_requests t
  join private.service_change_deliveries d on d.id=t.delivery_id
  join private.service_change_releases r on r.id=t.release_id where t.id=p_request_id;
$$;

create function public.reserve_service_change_termination_refund_for_service(
  p_request_id uuid,p_invoice_id text,p_payment_intent_id text,p_charge_id text,p_currency text,
  p_payment_amount_minor bigint,p_prior_refunded_minor bigint,p_retained_amount_minor bigint,
  p_target_total_refund_minor bigint,p_refund_amount_minor bigint,p_period_start timestamptz,p_period_end timestamptz,
  p_calculation_evidence jsonb
) returns void language plpgsql security definer set search_path = '' as $$
declare v_request private.service_change_termination_requests%rowtype; v_payment private.stripe_subscription_payments%rowtype;
begin
  select * into v_request from private.service_change_termination_requests where id=p_request_id for update;
  if not found or v_request.calculation_evidence is not null then raise exception 'service_change_termination_not_reservable'; end if;
  select * into strict v_payment from private.stripe_subscription_payments p
    where p.provider='stripe' and p.livemode and p.user_id=v_request.user_id
      and p.external_subscription_id=v_request.external_subscription_id and p.external_invoice_id=p_invoice_id
      and p.external_payment_intent_id=p_payment_intent_id;
  if p_invoice_id !~ '^in_[A-Za-z0-9_]+$' or p_payment_intent_id !~ '^pi_[A-Za-z0-9_]+$'
    or p_charge_id !~ '^ch_[A-Za-z0-9_]+$' or p_currency not in ('czk','eur','usd')
    or p_period_end<=p_period_start or p_payment_amount_minor<>v_payment.amount_paid or p_currency<>v_payment.currency
    or p_prior_refunded_minor<0 or p_prior_refunded_minor>p_payment_amount_minor
    or p_retained_amount_minor<0 or p_target_total_refund_minor<>p_payment_amount_minor-p_retained_amount_minor
    or p_refund_amount_minor<>greatest(p_target_total_refund_minor-p_prior_refunded_minor,0)
    or jsonb_typeof(p_calculation_evidence)<>'object'
  then raise exception 'service_change_termination_refund_evidence_mismatch'; end if;
  update private.service_change_termination_requests set external_invoice_id=p_invoice_id,
    external_payment_intent_id=p_payment_intent_id,external_charge_id=p_charge_id,currency=p_currency,
    payment_amount_minor=p_payment_amount_minor,prior_refunded_minor=p_prior_refunded_minor,
    retained_amount_minor=p_retained_amount_minor,target_total_refund_minor=p_target_total_refund_minor,
    refund_amount_minor=p_refund_amount_minor,paid_period_start=p_period_start,paid_period_end=p_period_end,
    calculation_method='unused-period-v1',calculation_evidence=p_calculation_evidence,status='processing',updated_at=now()
  where id=p_request_id;
end $$;

create function public.claim_service_change_termination_for_service(p_request_id uuid)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_token uuid:=gen_random_uuid();
begin
  update private.service_change_termination_requests set first_attempt_at=coalesce(first_attempt_at,now()),
    lease_until=now()+interval '2 minutes',lease_token=v_token,status='processing',updated_at=now()
  where id=p_request_id and calculation_evidence is not null
    and status in ('processing','refund_pending','refund_succeeded','needs_attention')
    and (lease_until is null or lease_until<now()) and (first_attempt_at is null or first_attempt_at>now()-interval '23 hours');
  if not found then return null; end if; return v_token;
end $$;

create function public.reconcile_service_change_termination_refund_for_service(
  p_request_id uuid,p_lease_token uuid,p_refund_id text,p_payment_intent_id text,p_amount bigint,
  p_currency text,p_status text
) returns void language plpgsql security definer set search_path = '' as $$
begin
  update private.service_change_termination_requests set external_refund_id=p_refund_id,refund_status=p_status,
    status=case when p_status='succeeded' and subscription_cancelled_at is not null then 'completed'
      when p_status='succeeded' then 'refund_succeeded' when p_status='pending' then 'refund_pending' else 'needs_attention' end,
    failure_stage=case when p_status in ('failed','canceled','requires_action') then 'refund' else null end,
    failure_code=case when p_status in ('failed','canceled','requires_action') then 'stripe_refund_'||p_status else null end,
    updated_at=now()
  where id=p_request_id and (p_lease_token is null or lease_token=p_lease_token)
    and external_payment_intent_id=p_payment_intent_id and refund_amount_minor=p_amount and currency=p_currency
    and p_refund_id ~ '^re_[A-Za-z0-9_]+$' and p_status in ('pending','requires_action','succeeded','failed','canceled')
    and (external_refund_id is null or external_refund_id=p_refund_id);
  if not found then raise exception 'service_change_termination_refund_reconciliation_mismatch'; end if;
end $$;

create function public.record_service_change_termination_cancellation_for_service(
  p_request_id uuid,p_lease_token uuid,p_cancelled_at timestamptz
) returns void language plpgsql security definer set search_path = '' as $$
begin
  update private.service_change_termination_requests set subscription_cancelled_at=coalesce(subscription_cancelled_at,p_cancelled_at),
    status=case when refund_amount_minor=0 or refund_status='succeeded' then 'completed' else status end,
    lease_token=null,lease_until=null,updated_at=now()
  where id=p_request_id and lease_token=p_lease_token and p_cancelled_at is not null;
  if not found then raise exception 'service_change_termination_cancellation_mismatch'; end if;
end $$;

create function public.fail_service_change_termination_for_service(
  p_request_id uuid,p_lease_token uuid,p_failure_stage text,p_failure_code text
) returns void language plpgsql security definer set search_path = '' as $$
begin
  update private.service_change_termination_requests set status='needs_attention',failure_stage=p_failure_stage,
    failure_code=left(p_failure_code,120),lease_token=null,lease_until=null,updated_at=now()
  where id=p_request_id and lease_token=p_lease_token and p_failure_stage in ('refund','cancellation','finalize');
  if not found then raise exception 'service_change_termination_failure_mismatch'; end if;
end $$;

revoke all on function public.publish_service_change_for_service(text,text,text,text,text,text,text,text,text,text,text,timestamptz,boolean,text[],text,uuid),
  public.claim_service_change_deliveries_for_service(integer),
  public.record_service_change_delivery_sent_for_service(uuid,uuid,text,text,text,timestamptz),
  public.fail_service_change_delivery_for_service(uuid,uuid,text),
  public.get_service_change_notices_for_user_service(uuid),
  public.request_service_change_termination_for_service(uuid,uuid,timestamptz),
  public.get_service_change_termination_for_service(uuid),
  public.reserve_service_change_termination_refund_for_service(uuid,text,text,text,text,bigint,bigint,bigint,bigint,bigint,timestamptz,timestamptz,jsonb),
  public.claim_service_change_termination_for_service(uuid),
  public.reconcile_service_change_termination_refund_for_service(uuid,uuid,text,text,bigint,text,text),
  public.record_service_change_termination_cancellation_for_service(uuid,uuid,timestamptz),
  public.fail_service_change_termination_for_service(uuid,uuid,text,text)
from public,anon,authenticated;
grant execute on function public.publish_service_change_for_service(text,text,text,text,text,text,text,text,text,text,text,timestamptz,boolean,text[],text,uuid),
  public.claim_service_change_deliveries_for_service(integer),
  public.record_service_change_delivery_sent_for_service(uuid,uuid,text,text,text,timestamptz),
  public.fail_service_change_delivery_for_service(uuid,uuid,text),
  public.get_service_change_notices_for_user_service(uuid),
  public.request_service_change_termination_for_service(uuid,uuid,timestamptz),
  public.get_service_change_termination_for_service(uuid),
  public.reserve_service_change_termination_refund_for_service(uuid,text,text,text,text,bigint,bigint,bigint,bigint,bigint,timestamptz,timestamptz,jsonb),
  public.claim_service_change_termination_for_service(uuid),
  public.reconcile_service_change_termination_refund_for_service(uuid,uuid,text,text,bigint,text,text),
  public.record_service_change_termination_cancellation_for_service(uuid,uuid,timestamptz),
  public.fail_service_change_termination_for_service(uuid,uuid,text,text)
to service_role;
