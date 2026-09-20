
alter table private.stripe_subscription_payments
  add column if not exists amount_paid bigint,
  add column if not exists currency text,
  add column if not exists billing_reason text;

alter table private.stripe_subscription_payments
  drop constraint if exists stripe_subscription_payments_amount_paid_check;
alter table private.stripe_subscription_payments
  add constraint stripe_subscription_payments_amount_paid_check
  check (amount_paid is null or amount_paid >= 0);

alter table private.stripe_subscription_payments
  drop constraint if exists stripe_subscription_payments_currency_check;
alter table private.stripe_subscription_payments
  add constraint stripe_subscription_payments_currency_check
  check (currency is null or currency in ('czk', 'eur', 'usd'));

alter table private.stripe_subscription_payments
  drop constraint if exists stripe_subscription_payments_billing_reason_check;
alter table private.stripe_subscription_payments
  add constraint stripe_subscription_payments_billing_reason_check
  check (
    billing_reason is null
    or (
      char_length(billing_reason) between 1 and 64
      and billing_reason ~ '^[a-z0-9_]+$'
    )
  );

create or replace function private.try_release_individual_ai_billing_losses(
  p_user_id uuid,
  p_livemode boolean,
  p_currency text,
  p_paid_at timestamptz
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_required bigint := 0;
  v_recovered bigint := 0;
  v_recovery_start timestamptz;
  v_released_disputes integer := 0;
  v_released_refunds integer := 0;
begin
  if p_user_id is null
     or p_currency not in ('czk', 'eur', 'usd')
     or p_paid_at is null then
    raise exception 'invalid_recovery_payment_context' using errcode = '22023';
  end if;

  with raw_losses as (
    select
      d.external_payment_intent_id,
      d.closed_at as loss_at,
      original.amount_paid as loss_amount
    from private.individual_billing_disputes d
    join private.stripe_subscription_payments original
      on original.provider = d.provider
     and original.livemode = d.livemode
     and original.external_payment_intent_id = d.external_payment_intent_id
    where d.provider = 'stripe'
      and d.livemode = p_livemode
      and d.user_id = p_user_id
      and d.status = 'lost'
      and d.closed_at is not null
      and d.released_at is null
      and original.currency = p_currency
      and original.amount_paid is not null
      and original.amount_paid > 0

    union all

    select
      r.external_payment_intent_id,
      r.full_refunded_at as loss_at,
      r.amount_refunded as loss_amount
    from private.individual_billing_refunds r
    join private.stripe_subscription_payments original
      on original.provider = r.provider
     and original.livemode = r.livemode
     and original.external_payment_intent_id = r.external_payment_intent_id
    where r.provider = 'stripe'
      and r.livemode = p_livemode
      and r.user_id = p_user_id
      and r.full_refund
      and r.full_refunded_at is not null
      and r.released_at is null
      and original.currency = p_currency
      and r.amount_refunded > 0
  ),
  losses as (
    select
      external_payment_intent_id,
      min(loss_at) as loss_at,
      max(loss_amount) as loss_amount
    from raw_losses
    group by external_payment_intent_id
  )
  select
    coalesce(sum(loss_amount), 0)::bigint,
    min(loss_at)
  into v_required, v_recovery_start
  from losses;

  if v_required <= 0 or v_recovery_start is null then
    return jsonb_build_object(
      'requiredAmount', 0,
      'recoveredAmount', 0,
      'releasedLostDisputes', 0,
      'releasedFullRefunds', 0
    );
  end if;

  select coalesce(sum(p.amount_paid), 0)::bigint
  into v_recovered
  from private.stripe_subscription_payments p
  where p.provider = 'stripe'
    and p.livemode = p_livemode
    and p.user_id = p_user_id
    and p.currency = p_currency
    and p.amount_paid is not null
    and p.amount_paid > 0
    and p.paid_at > v_recovery_start
    and p.paid_at <= p_paid_at;

  if v_recovered < v_required then
    return jsonb_build_object(
      'requiredAmount', v_required,
      'recoveredAmount', v_recovered,
      'releasedLostDisputes', 0,
      'releasedFullRefunds', 0
    );
  end if;

  update private.individual_billing_disputes d
  set released_at = p_paid_at,
      release_reason = 'subsequent_payment',
      updated_at = now()
  where d.provider = 'stripe'
    and d.livemode = p_livemode
    and d.user_id = p_user_id
    and d.status = 'lost'
    and d.closed_at is not null
    and d.released_at is null
    and exists (
      select 1
      from private.stripe_subscription_payments original
      where original.provider = d.provider
        and original.livemode = d.livemode
        and original.external_payment_intent_id = d.external_payment_intent_id
        and original.currency = p_currency
        and original.amount_paid is not null
        and original.amount_paid > 0
    );

  get diagnostics v_released_disputes = row_count;

  update private.individual_billing_refunds r
  set released_at = p_paid_at,
      release_reason = 'subsequent_payment',
      updated_at = now()
  where r.provider = 'stripe'
    and r.livemode = p_livemode
    and r.user_id = p_user_id
    and r.full_refund
    and r.full_refunded_at is not null
    and r.released_at is null
    and exists (
      select 1
      from private.stripe_subscription_payments original
      where original.provider = r.provider
        and original.livemode = r.livemode
        and original.external_payment_intent_id = r.external_payment_intent_id
        and original.currency = p_currency
    );

  get diagnostics v_released_refunds = row_count;

  return jsonb_build_object(
    'requiredAmount', v_required,
    'recoveredAmount', v_recovered,
    'releasedLostDisputes', v_released_disputes,
    'releasedFullRefunds', v_released_refunds
  );
end;
$function$;

revoke all on function private.try_release_individual_ai_billing_losses(uuid, boolean, text, timestamptz)
  from public, anon, authenticated, service_role;

create or replace function public.sync_stripe_invoice_payment_event_v2(
  p_event_id text,
  p_livemode boolean,
  p_user_id uuid,
  p_subscription_id text,
  p_invoice_id text,
  p_payment_intent_id text,
  p_paid_at timestamptz,
  p_amount_paid bigint,
  p_currency text,
  p_billing_reason text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_existing private.stripe_subscription_payments%rowtype;
  v_recovery jsonb;
begin
  if p_event_id !~ '^evt_[A-Za-z0-9_]+$'
     or p_subscription_id !~ '^sub_[A-Za-z0-9_]+$'
     or p_invoice_id !~ '^in_[A-Za-z0-9_]+$'
     or p_payment_intent_id !~ '^pi_[A-Za-z0-9_]+$'
     or p_user_id is null
     or p_paid_at is null
     or p_amount_paid < 0
     or p_currency not in ('czk', 'eur', 'usd')
     or p_billing_reason is null
     or char_length(p_billing_reason) not between 1 and 64
     or p_billing_reason !~ '^[a-z0-9_]+$' then
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
    or (v_existing.amount_paid is not null and v_existing.amount_paid is distinct from p_amount_paid)
    or (v_existing.currency is not null and v_existing.currency is distinct from p_currency)
    or (v_existing.billing_reason is not null and v_existing.billing_reason is distinct from p_billing_reason)
  ) then
    raise exception 'stripe_payment_mapping_conflict' using errcode = 'P0001';
  end if;

  insert into private.stripe_subscription_payments (
    provider, livemode, external_payment_intent_id, external_invoice_id,
    user_id, external_subscription_id, paid_at,
    amount_paid, currency, billing_reason, updated_at
  )
  values (
    'stripe', p_livemode, p_payment_intent_id, p_invoice_id,
    p_user_id, p_subscription_id, p_paid_at,
    p_amount_paid, p_currency, p_billing_reason, now()
  )
  on conflict (provider, livemode, external_payment_intent_id)
  do update set
    paid_at = greatest(private.stripe_subscription_payments.paid_at, excluded.paid_at),
    amount_paid = coalesce(private.stripe_subscription_payments.amount_paid, excluded.amount_paid),
    currency = coalesce(private.stripe_subscription_payments.currency, excluded.currency),
    billing_reason = coalesce(private.stripe_subscription_payments.billing_reason, excluded.billing_reason),
    updated_at = now();

  v_recovery := private.try_release_individual_ai_billing_losses(
    p_user_id,
    p_livemode,
    p_currency,
    p_paid_at
  );

  return jsonb_build_object(
    'mapped', true,
    'amountPaid', p_amount_paid,
    'currency', p_currency,
    'billingReason', p_billing_reason,
    'recovery', v_recovery
  );
end;
$function$;

revoke all on function public.sync_stripe_invoice_payment_event_v2(
  text, boolean, uuid, text, text, text, timestamptz, bigint, text, text
)
  from public, anon, authenticated;
grant execute on function public.sync_stripe_invoice_payment_event_v2(
  text, boolean, uuid, text, text, text, timestamptz, bigint, text, text
)
  to service_role;
