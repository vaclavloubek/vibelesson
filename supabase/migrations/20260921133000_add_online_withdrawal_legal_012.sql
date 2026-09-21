-- LEGAL-012: statutory model form and authenticated online withdrawal.
-- The legal submission is immutable; confirmation delivery state is kept separately.

create table private.individual_withdrawal_online_submissions (
  receipt_id uuid primary key references private.individual_withdrawal_receipts(id) on delete restrict,
  user_id uuid not null,
  snapshot_id uuid not null unique references private.individual_contract_snapshots(id) on delete restrict,
  locale text not null check (locale in ('cs','en')),
  consumer_name text not null check (char_length(consumer_name) between 2 and 160),
  electronic_contact text not null check (char_length(electronic_contact) between 3 and 254),
  notice_payload jsonb not null check (jsonb_typeof(notice_payload)='object'),
  notice_sha256 text not null check (notice_sha256 ~ '^[0-9a-f]{64}$'),
  submitted_at timestamptz not null,
  created_at timestamptz not null default now()
);

alter table private.individual_withdrawal_online_submissions enable row level security;
revoke all on private.individual_withdrawal_online_submissions from public,anon,authenticated,service_role;

create trigger individual_withdrawal_online_submissions_append_only
before update or delete on private.individual_withdrawal_online_submissions
for each row execute function private.reject_individual_contract_evidence_mutation();

create table private.individual_withdrawal_confirmation_deliveries (
  receipt_id uuid primary key references private.individual_withdrawal_receipts(id) on delete restrict,
  status text not null default 'pending' check (status in ('pending','sent')),
  attempt_count integer not null default 0 check (attempt_count >= 0),
  resend_email_id text,
  last_error_code text,
  sent_at timestamptz,
  updated_at timestamptz not null default now(),
  constraint individual_withdrawal_confirmation_sent_check check (
    (status='pending' and sent_at is null) or (status='sent' and sent_at is not null and resend_email_id is not null)
  )
);

alter table private.individual_withdrawal_confirmation_deliveries enable row level security;
revoke all on private.individual_withdrawal_confirmation_deliveries from public,anon,authenticated,service_role;

create function public.get_online_individual_withdrawal_for_service(p_user_id uuid)
returns jsonb
language sql
stable
security definer
set search_path=''
as $function$
  with candidate as (
    select
      s.id as snapshot_id,
      s.plan_code,
      s.billing_period,
      s.currency,
      s.amount_minor,
      s.locale,
      s.accepted_at,
      s.accepted_at + interval '14 days' as deadline,
      r.id as receipt_id,
      r.withdrawal_received_at,
      d.external_subscription_id,
      row_number() over (partition by s.id order by d.created_at asc) as delivery_rank
    from private.individual_contract_snapshots s
    join public.billing_email_deliveries d
      on d.contract_snapshot_id=s.id
      and d.provider='stripe'
      and d.livemode
      and d.notification_type='subscription_activated'
    left join private.individual_withdrawal_receipts r on r.snapshot_id=s.id
    where s.user_id=p_user_id
      and s.provider='stripe'
      and s.livemode
      and s.immediate_performance_requested
      and (r.id is not null or now() <= s.accepted_at + interval '14 days')
  )
  select jsonb_build_object(
    'snapshotId',c.snapshot_id,
    'subscriptionId',c.external_subscription_id,
    'planCode',c.plan_code,
    'billingPeriod',c.billing_period,
    'currency',c.currency,
    'amountMinor',c.amount_minor,
    'locale',c.locale,
    'acceptedAt',c.accepted_at,
    'deadline',c.deadline,
    'eligible',c.receipt_id is null and now() <= c.deadline,
    'receiptId',c.receipt_id,
    'receivedAt',c.withdrawal_received_at,
    'confirmationStatus',coalesce(cd.status,case when os.receipt_id is null then null else 'pending' end),
    'confirmationSentAt',cd.sent_at
  )
  from candidate c
  left join private.individual_withdrawal_online_submissions os on os.receipt_id=c.receipt_id
  left join private.individual_withdrawal_confirmation_deliveries cd on cd.receipt_id=c.receipt_id
  where c.delivery_rank=1
  order by c.accepted_at desc
  limit 1;
$function$;

create function public.register_online_individual_withdrawal_for_service(
  p_user_id uuid,
  p_snapshot_id uuid,
  p_consumer_name text,
  p_electronic_contact text,
  p_locale text,
  p_consumer_confirmed boolean
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $function$
declare
  v_snapshot private.individual_contract_snapshots%rowtype;
  v_receipt private.individual_withdrawal_receipts%rowtype;
  v_submission private.individual_withdrawal_online_submissions%rowtype;
  v_submitted_at timestamptz := clock_timestamp();
  v_name text := btrim(coalesce(p_consumer_name,''));
  v_contact text := lower(btrim(coalesce(p_electronic_contact,'')));
  v_payload jsonb;
  v_sha text;
begin
  if p_user_id is null or p_snapshot_id is null or not coalesce(p_consumer_confirmed,false)
    or p_locale is null or p_locale not in ('cs','en') or char_length(v_name) not between 2 and 160
    or char_length(v_contact) not between 3 and 254
    or v_contact !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
  then raise exception 'invalid_online_withdrawal_submission' using errcode='22023'; end if;

  select * into v_snapshot
  from private.individual_contract_snapshots s
  where s.id=p_snapshot_id and s.user_id=p_user_id and s.provider='stripe' and s.livemode
    and s.immediate_performance_requested
  for share;
  if not found then raise exception 'online_withdrawal_snapshot_mismatch'; end if;
  if v_submitted_at > v_snapshot.accepted_at + interval '14 days' then
    raise exception 'online_withdrawal_deadline_expired';
  end if;
  if not exists (
    select 1 from public.billing_email_deliveries d
    where d.contract_snapshot_id=v_snapshot.id and d.user_id=p_user_id and d.provider='stripe' and d.livemode
      and d.notification_type='subscription_activated'
  ) then raise exception 'online_withdrawal_activation_missing'; end if;

  select * into v_receipt from private.individual_withdrawal_receipts r where r.snapshot_id=v_snapshot.id;
  if found then
    select * into v_submission from private.individual_withdrawal_online_submissions os where os.receipt_id=v_receipt.id;
    if not found or v_receipt.user_id<>p_user_id then raise exception 'online_withdrawal_receipt_conflict'; end if;
  else
    v_payload:=jsonb_build_object(
      'version','syllonaut-online-withdrawal-v1',
      'statement',case when p_locale='cs'
        then 'Oznamuji, že tímto odstupuji od smlouvy o poskytnutí služby Syllonaut.'
        else 'I hereby give notice that I withdraw from the contract for the provision of the Syllonaut service.' end,
      'provider','Václav Loubek, IČO 88878431',
      'snapshotId',v_snapshot.id,
      'planCode',v_snapshot.plan_code,
      'billingPeriod',v_snapshot.billing_period,
      'orderedAt',v_snapshot.accepted_at,
      'consumerName',v_name,
      'electronicContact',v_contact,
      'submittedAt',v_submitted_at,
      'locale',p_locale
    );
    v_sha:=encode(extensions.digest(convert_to(v_payload::text,'UTF8'),'sha256'),'hex');

    insert into private.individual_withdrawal_receipts(
      user_id,snapshot_id,withdrawal_sent_at,withdrawal_received_at,notice_sha256,actor_user_id
    ) values (p_user_id,v_snapshot.id,v_submitted_at,v_submitted_at,v_sha,p_user_id)
    returning * into v_receipt;

    insert into private.individual_withdrawal_online_submissions(
      receipt_id,user_id,snapshot_id,locale,consumer_name,electronic_contact,notice_payload,notice_sha256,submitted_at
    ) values (v_receipt.id,p_user_id,v_snapshot.id,p_locale,v_name,v_contact,v_payload,v_sha,v_submitted_at)
    returning * into v_submission;

    insert into private.individual_withdrawal_confirmation_deliveries(receipt_id) values(v_receipt.id);
  end if;

  return jsonb_build_object(
    'receiptId',v_receipt.id,
    'snapshotId',v_submission.snapshot_id,
    'submittedAt',v_submission.submitted_at,
    'noticePayload',v_submission.notice_payload,
    'noticeSha256',v_submission.notice_sha256,
    'confirmationStatus',(select d.status from private.individual_withdrawal_confirmation_deliveries d where d.receipt_id=v_receipt.id)
  );
end;
$function$;

create function public.get_online_individual_withdrawal_confirmation_for_service(p_receipt_id uuid,p_user_id uuid)
returns jsonb
language sql
stable
security definer
set search_path=''
as $function$
  select jsonb_build_object(
    'receiptId',os.receipt_id,
    'locale',os.locale,
    'consumerName',os.consumer_name,
    'electronicContact',os.electronic_contact,
    'noticePayload',os.notice_payload,
    'noticeSha256',os.notice_sha256,
    'submittedAt',os.submitted_at,
    'status',cd.status,
    'attemptCount',cd.attempt_count,
    'sentAt',cd.sent_at
  )
  from private.individual_withdrawal_online_submissions os
  join private.individual_withdrawal_confirmation_deliveries cd on cd.receipt_id=os.receipt_id
  where os.receipt_id=p_receipt_id and os.user_id=p_user_id;
$function$;

create function public.record_online_individual_withdrawal_confirmation_for_service(
  p_receipt_id uuid,p_resend_email_id text,p_error_code text
)
returns void
language plpgsql
security definer
set search_path=''
as $function$
begin
  if p_receipt_id is null or (p_resend_email_id is null and nullif(btrim(coalesce(p_error_code,'')),'') is null)
    or (p_resend_email_id is not null and p_resend_email_id !~ '^[A-Za-z0-9_-]+$')
  then raise exception 'invalid_online_withdrawal_confirmation_result'; end if;

  update private.individual_withdrawal_confirmation_deliveries
  set status=case when p_resend_email_id is null then 'pending' else 'sent' end,
      attempt_count=attempt_count+1,
      resend_email_id=coalesce(resend_email_id,p_resend_email_id),
      last_error_code=case when p_resend_email_id is null then left(p_error_code,120) else null end,
      sent_at=case when p_resend_email_id is null then sent_at else coalesce(sent_at,clock_timestamp()) end,
      updated_at=clock_timestamp()
  where receipt_id=p_receipt_id and status<>'sent';
end;
$function$;

revoke all on function public.get_online_individual_withdrawal_for_service(uuid),
  public.register_online_individual_withdrawal_for_service(uuid,uuid,text,text,text,boolean),
  public.get_online_individual_withdrawal_confirmation_for_service(uuid,uuid),
  public.record_online_individual_withdrawal_confirmation_for_service(uuid,text,text)
from public,anon,authenticated;
grant execute on function public.get_online_individual_withdrawal_for_service(uuid),
  public.register_online_individual_withdrawal_for_service(uuid,uuid,text,text,text,boolean),
  public.get_online_individual_withdrawal_confirmation_for_service(uuid,uuid),
  public.record_online_individual_withdrawal_confirmation_for_service(uuid,text,text)
to service_role;

-- Terms 1.5 adds the statutory model form and the online withdrawal channel.
create or replace function private.handle_new_user()
returns trigger language plpgsql security definer set search_path='' as $function$
declare
  requested_marketing_consent boolean := lower(coalesce(new.raw_user_meta_data ->> 'marketing_email_consent', 'false')) = 'true';
  requested_ui_locale text := case lower(coalesce(new.raw_user_meta_data ->> 'ui_locale', '')) when 'cs' then 'cs' when 'en' then 'en' else null end;
  requested_terms_acceptance boolean := lower(coalesce(new.raw_user_meta_data ->> 'terms_accepted', 'false')) = 'true';
  requested_terms_acceptance_key text := nullif(btrim(coalesce(new.raw_user_meta_data ->> 'terms_acceptance_version', '')), '');
  requested_terms_version text := case requested_terms_acceptance_key
    when '2026-09-21-v1' then '1.0' when '2026-09-21-v2' then '1.1' when '2026-09-21-v3' then '1.2'
    when '2026-09-21-v4' then '1.3' when '2026-09-21-v5' then '1.4' when '2026-09-21-v6' then '1.5' else null end;
  marketing_consent_version constant text := '2026-09-18-v1';
begin
  insert into public.profiles(id,marketing_email_consent,marketing_email_consent_at,marketing_email_consent_version,ui_locale)
  values(new.id,requested_marketing_consent,case when requested_marketing_consent then now() else null end,
    case when requested_marketing_consent then marketing_consent_version else null end,requested_ui_locale);
  if requested_marketing_consent then insert into private.marketing_consent_events(user_id,granted,consent_version,source)
    values(new.id,true,marketing_consent_version,'signup'); end if;
  if requested_terms_acceptance and requested_terms_version is not null then
    insert into private.terms_acceptance_events(user_id,terms_version,acceptance_key,source)
    values(new.id,requested_terms_version,requested_terms_acceptance_key,'signup') on conflict(user_id,acceptance_key,source) do nothing;
  end if;
  return new;
end;
$function$;

create or replace function public.has_terms_acceptance_for_service(p_user_id uuid,p_acceptance_key text)
returns boolean language sql stable security definer set search_path='' as $function$
  select p_acceptance_key in ('2026-09-21-v1','2026-09-21-v2','2026-09-21-v3','2026-09-21-v4','2026-09-21-v5','2026-09-21-v6')
    and exists(select 1 from private.terms_acceptance_events tae where tae.user_id=p_user_id and tae.acceptance_key=p_acceptance_key);
$function$;

create or replace function public.record_terms_reconsent_for_service(p_user_id uuid,p_acceptance_key text)
returns timestamptz language plpgsql security definer set search_path='' as $function$
declare accepted timestamptz; resolved_terms_version text := case p_acceptance_key
  when '2026-09-21-v1' then '1.0' when '2026-09-21-v2' then '1.1' when '2026-09-21-v3' then '1.2'
  when '2026-09-21-v4' then '1.3' when '2026-09-21-v5' then '1.4' when '2026-09-21-v6' then '1.5' else null end;
begin
  if resolved_terms_version is null then raise exception 'unsupported_terms_acceptance_key'; end if;
  if not exists(select 1 from auth.users u where u.id=p_user_id) then raise exception 'terms_reconsent_user_not_found'; end if;
  insert into private.terms_acceptance_events(user_id,terms_version,acceptance_key,source)
  values(p_user_id,resolved_terms_version,p_acceptance_key,'reconsent') on conflict(user_id,acceptance_key,source) do nothing;
  select tae.accepted_at into accepted from private.terms_acceptance_events tae
  where tae.user_id=p_user_id and tae.acceptance_key=p_acceptance_key and tae.source='reconsent'
  order by tae.accepted_at asc limit 1;
  return accepted;
end;
$function$;

revoke execute on function public.has_terms_acceptance_for_service(uuid,text),
  public.record_terms_reconsent_for_service(uuid,text) from public,anon,authenticated;
grant execute on function public.has_terms_acceptance_for_service(uuid,text),
  public.record_terms_reconsent_for_service(uuid,text) to service_role;
