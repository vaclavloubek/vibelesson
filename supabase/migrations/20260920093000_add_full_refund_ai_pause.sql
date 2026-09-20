-- Full-refund AI-only billing lock for individual subscriptions.
-- Partial refunds are recorded but do not pause AI. A later confirmed subscription
-- payment releases an unresolved full-refund lock.

create table if not exists private.individual_billing_refunds (
  provider text not null default 'stripe'
    check (provider = 'stripe'),
  livemode boolean not null,
  external_charge_id text not null,
  external_payment_intent_id text not null,
  user_id uuid not null references auth.users(id) on delete cascade,
  external_subscription_id text not null,
  amount_total bigint not null check (amount_total > 0),
  amount_refunded bigint not null check (amount_refunded >= 0 and amount_refunded <= amount_total),
  full_refund boolean not null default false,
  last_event_type text not null,
  last_event_id text not null,
  last_event_at timestamptz not null,
  full_refunded_at timestamptz,
  released_at timestamptz,
  release_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (provider, livemode, external_charge_id),
  constraint individual_billing_refunds_charge_format
    check (external_charge_id ~ '^ch_[A-Za-z0-9_]+$'),
  constraint individual_billing_refunds_pi_format
    check (external_payment_intent_id ~ '^pi_[A-Za-z0-9_]+$'),
  constraint individual_billing_refunds_subscription_format
    check (external_subscription_id ~ '^sub_[A-Za-z0-9_]+$'),
  constraint individual_billing_refunds_event_type_check
    check (last_event_type in ('charge.refunded', 'refund.created', 'refund.updated', 'refund.failed')),
  constraint individual_billing_refunds_release_reason_check
    check (release_reason is null or release_reason in ('subsequent_payment', 'refund_reversed'))
);

alter table private.individual_billing_refunds enable row level security;
revoke all on table private.individual_billing_refunds
  from public, anon, authenticated, service_role;

create index if not exists individual_billing_refunds_user_open_idx
  on private.individual_billing_refunds (user_id, last_event_at desc)
  where full_refund and released_at is null;

create or replace function private.individual_ai_billing_pause_reason(p_user_id uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $function$
  select case
    when exists (
      select 1
      from public.profiles p
      where p.id = p_user_id
        and p.role = 'admin'
    ) then null
    when exists (
      select 1
      from public.organization_memberships m
      join public.organizations o on o.id = m.organization_id
      where m.user_id = p_user_id
        and m.status = 'active'
        and m.revoked_at is null
        and o.status = 'active'
    ) then null
    when exists (
      select 1
      from private.individual_billing_disputes d
      where d.provider = 'stripe'
        and d.livemode = true
        and d.user_id = p_user_id
        and d.released_at is null
    ) then 'dispute'
    when exists (
      select 1
      from private.individual_billing_refunds r
      where r.provider = 'stripe'
        and r.livemode = true
        and r.user_id = p_user_id
        and r.full_refund
        and r.released_at is null
    ) then 'refund'
    when coalesce((
      select bs.status = 'past_due'
      from public.billing_subscriptions bs
      join public.billing_plans bp on bp.code = bs.plan_code
      where bs.user_id = p_user_id
        and bs.provider = 'stripe'
        and bs.livemode = true
        and bs.status in ('trialing', 'active', 'past_due')
        and bp.audience = 'individual'
      order by bp.access_rank desc, bs.updated_at desc
      limit 1
    ), false) then 'past_due'
    else null
  end;
$function$;

revoke all on function private.individual_ai_billing_pause_reason(uuid)
  from public, anon, authenticated, service_role;

create or replace function public.sync_stripe_refund_state(
  p_event_id text,
  p_event_type text,
  p_livemode boolean,
  p_charge_id text,
  p_payment_intent_id text,
  p_amount_total bigint,
  p_amount_refunded bigint,
  p_fully_refunded boolean,
  p_event_at timestamptz
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_payment private.stripe_subscription_payments%rowtype;
  v_existing private.individual_billing_refunds%rowtype;
  v_full_refunded_at timestamptz;
  v_released_at timestamptz;
  v_release_reason text;
begin
  if p_event_id !~ '^evt_[A-Za-z0-9_]+$'
     or p_event_type not in ('charge.refunded', 'refund.created', 'refund.updated', 'refund.failed')
     or p_charge_id !~ '^ch_[A-Za-z0-9_]+$'
     or p_payment_intent_id !~ '^pi_[A-Za-z0-9_]+$'
     or p_amount_total <= 0
     or p_amount_refunded < 0
     or p_amount_refunded > p_amount_total
     or p_fully_refunded is distinct from (p_amount_refunded >= p_amount_total)
     or p_event_at is null then
    raise exception 'invalid_stripe_refund_state' using errcode = '22023';
  end if;

  select *
  into v_payment
  from private.stripe_subscription_payments p
  where p.provider = 'stripe'
    and p.livemode = p_livemode
    and p.external_payment_intent_id = p_payment_intent_id;

  if not found then
    raise exception 'stripe_refund_payment_mapping_missing' using errcode = 'P0001';
  end if;

  select *
  into v_existing
  from private.individual_billing_refunds r
  where r.provider = 'stripe'
    and r.livemode = p_livemode
    and r.external_charge_id = p_charge_id;

  if found and (
    v_existing.external_payment_intent_id is distinct from p_payment_intent_id
    or v_existing.user_id is distinct from v_payment.user_id
    or v_existing.external_subscription_id is distinct from v_payment.external_subscription_id
    or v_existing.amount_total is distinct from p_amount_total
  ) then
    raise exception 'stripe_refund_mapping_conflict' using errcode = 'P0001';
  end if;

  if p_fully_refunded then
    v_full_refunded_at := case
      when found and v_existing.full_refund and v_existing.full_refunded_at is not null
        then least(v_existing.full_refunded_at, p_event_at)
      else p_event_at
    end;
    v_released_at := null;
    v_release_reason := null;
  else
    v_full_refunded_at := case when found then v_existing.full_refunded_at else null end;
    if found and v_existing.full_refund and v_existing.released_at is null then
      v_released_at := p_event_at;
      v_release_reason := 'refund_reversed';
    else
      v_released_at := case when found then v_existing.released_at else null end;
      v_release_reason := case when found then v_existing.release_reason else null end;
    end if;
  end if;

  insert into private.individual_billing_refunds (
    provider, livemode, external_charge_id, external_payment_intent_id,
    user_id, external_subscription_id, amount_total, amount_refunded,
    full_refund, last_event_type, last_event_id, last_event_at,
    full_refunded_at, released_at, release_reason, updated_at
  )
  values (
    'stripe', p_livemode, p_charge_id, p_payment_intent_id,
    v_payment.user_id, v_payment.external_subscription_id,
    p_amount_total, p_amount_refunded, p_fully_refunded,
    p_event_type, p_event_id, p_event_at,
    v_full_refunded_at, v_released_at, v_release_reason, now()
  )
  on conflict (provider, livemode, external_charge_id)
  do update set
    amount_refunded = excluded.amount_refunded,
    full_refund = excluded.full_refund,
    last_event_type = excluded.last_event_type,
    last_event_id = excluded.last_event_id,
    last_event_at = excluded.last_event_at,
    full_refunded_at = excluded.full_refunded_at,
    released_at = excluded.released_at,
    release_reason = excluded.release_reason,
    updated_at = now()
  where excluded.last_event_at >= private.individual_billing_refunds.last_event_at;

  insert into public.billing_events (
    provider, livemode, external_event_id, event_type, user_id, external_subscription_id
  )
  values (
    'stripe', p_livemode, p_event_id, p_event_type,
    v_payment.user_id, v_payment.external_subscription_id
  )
  on conflict (provider, livemode, external_event_id) do nothing;

  return jsonb_build_object(
    'userId', v_payment.user_id,
    'subscriptionId', v_payment.external_subscription_id,
    'fullRefund', p_fully_refunded,
    'pauseReason', private.individual_ai_billing_pause_reason(v_payment.user_id)
  );
end;
$function$;

revoke all on function public.sync_stripe_refund_state(text, text, boolean, text, text, bigint, bigint, boolean, timestamptz)
  from public, anon, authenticated;
grant execute on function public.sync_stripe_refund_state(text, text, boolean, text, text, bigint, bigint, boolean, timestamptz)
  to service_role;

create or replace function public.sync_stripe_invoice_payment_event(
  p_event_id text,
  p_livemode boolean,
  p_user_id uuid,
  p_subscription_id text,
  p_invoice_id text,
  p_payment_intent_id text,
  p_paid_at timestamptz
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_existing private.stripe_subscription_payments%rowtype;
  v_released_disputes integer := 0;
  v_released_refunds integer := 0;
begin
  if p_event_id !~ '^evt_[A-Za-z0-9_]+$'
     or p_subscription_id !~ '^sub_[A-Za-z0-9_]+$'
     or p_invoice_id !~ '^in_[A-Za-z0-9_]+$'
     or p_payment_intent_id !~ '^pi_[A-Za-z0-9_]+$'
     or p_user_id is null
     or p_paid_at is null then
    raise exception 'invalid_stripe_invoice_payment_mapping' using errcode = '22023';
  end if;

  if not exists (
    select 1
    from public.billing_subscriptions bs
    where bs.user_id = p_user_id
      and bs.provider = 'stripe'
      and bs.livemode = p_livemode
      and bs.external_subscription_id = p_subscription_id
  ) then
    raise exception 'stripe_invoice_subscription_mapping_mismatch' using errcode = 'P0001';
  end if;

  select *
  into v_existing
  from private.stripe_subscription_payments p
  where p.provider = 'stripe'
    and p.livemode = p_livemode
    and p.external_payment_intent_id = p_payment_intent_id;

  if found and (
    v_existing.user_id is distinct from p_user_id
    or v_existing.external_subscription_id is distinct from p_subscription_id
    or v_existing.external_invoice_id is distinct from p_invoice_id
  ) then
    raise exception 'stripe_payment_mapping_conflict' using errcode = 'P0001';
  end if;

  insert into private.stripe_subscription_payments (
    provider, livemode, external_payment_intent_id, external_invoice_id,
    user_id, external_subscription_id, paid_at, updated_at
  )
  values (
    'stripe', p_livemode, p_payment_intent_id, p_invoice_id,
    p_user_id, p_subscription_id, p_paid_at, now()
  )
  on conflict (provider, livemode, external_payment_intent_id)
  do update set
    paid_at = greatest(private.stripe_subscription_payments.paid_at, excluded.paid_at),
    updated_at = now();

  update private.individual_billing_disputes d
  set released_at = p_paid_at,
      release_reason = 'subsequent_payment',
      updated_at = now()
  where d.provider = 'stripe'
    and d.livemode = p_livemode
    and d.user_id = p_user_id
    and d.released_at is null
    and d.status = 'lost'
    and d.closed_at is not null
    and p_paid_at > d.closed_at;

  get diagnostics v_released_disputes = row_count;

  update private.individual_billing_refunds r
  set released_at = p_paid_at,
      release_reason = 'subsequent_payment',
      updated_at = now()
  where r.provider = 'stripe'
    and r.livemode = p_livemode
    and r.user_id = p_user_id
    and r.full_refund
    and r.released_at is null
    and r.full_refunded_at is not null
    and p_paid_at > r.full_refunded_at;

  get diagnostics v_released_refunds = row_count;

  return jsonb_build_object(
    'mapped', true,
    'releasedLostDisputes', v_released_disputes,
    'releasedFullRefunds', v_released_refunds
  );
end;
$function$;

revoke all on function public.sync_stripe_invoice_payment_event(text, boolean, uuid, text, text, text, timestamptz)
  from public, anon, authenticated;
grant execute on function public.sync_stripe_invoice_payment_event(text, boolean, uuid, text, text, text, timestamptz)
  to service_role;
