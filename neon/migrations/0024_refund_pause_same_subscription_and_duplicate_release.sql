-- Refund AI pause follows the refunded subscription; a refunded duplicate
-- payment releases it immediately (2026-09-26, follow-up to 0022; 0023 was taken by the Free notice).
--
-- 1. private.individual_ai_billing_pause_reason: the 'refund' branch now
--    requires that the refunded subscription itself is still live
--    (trialing/active/past_due, individual plan). Before, any live individual
--    subscription kept the pause, so refunding a second, duplicate
--    subscription paused AI on the first one. All other branches, their
--    order, signature, SECURITY DEFINER, search_path and grants stay as in
--    0022.
--
-- 2. public.release_stripe_duplicate_payment_refund: the Stripe webhook calls
--    it when every effective refund of a fully refunded charge has reason
--    'duplicate'. The refund is released (release_reason
--    'duplicate_payment') only when another payment of the same
--    subscription, in the same currency, of at least the refunded amount and
--    not itself fully refunded, was paid within 7 days of the refunded one,
--    i.e. the period stays paid. Otherwise nothing changes and the existing
--    recovery rules apply. Service-only (no grants for API roles).
--
-- Idempotent.

alter table private.individual_billing_refunds
  drop constraint if exists individual_billing_refunds_release_reason_check;
alter table private.individual_billing_refunds
  add constraint individual_billing_refunds_release_reason_check
  check (release_reason is null or release_reason = any (array['subsequent_payment', 'refund_reversed', 'duplicate_payment']));

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
      join public.billing_subscriptions bs
        on bs.provider = r.provider
       and bs.livemode = r.livemode
       and bs.user_id = r.user_id
       and bs.external_subscription_id = r.external_subscription_id
      join public.billing_plans bp on bp.code = bs.plan_code
      where r.provider = 'stripe'
        and r.livemode = true
        and r.user_id = p_user_id
        and r.full_refund
        and r.released_at is null
        and bs.status in ('trialing', 'active', 'past_due')
        and bp.audience = 'individual'
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

create or replace function public.release_stripe_duplicate_payment_refund(
  p_event_id text,
  p_livemode boolean,
  p_charge_id text,
  p_event_at timestamptz
)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_refund private.individual_billing_refunds%rowtype;
  v_original private.stripe_subscription_payments%rowtype;
begin
  if p_event_id !~ '^evt_[A-Za-z0-9_]+$'
     or p_livemode is null
     or p_charge_id !~ '^ch_[A-Za-z0-9_]+$'
     or p_event_at is null then
    raise exception 'invalid_duplicate_payment_refund' using errcode = '22023';
  end if;

  select * into v_refund
  from private.individual_billing_refunds r
  where r.provider = 'stripe'
    and r.livemode = p_livemode
    and r.external_charge_id = p_charge_id
  for update;

  if not found then
    raise exception 'stripe_refund_payment_mapping_missing' using errcode = 'P0001';
  end if;

  if not v_refund.full_refund then
    return jsonb_build_object('released', false, 'reason', 'not_full_refund');
  end if;

  if v_refund.released_at is not null then
    return jsonb_build_object('released', false, 'reason', 'already_released', 'releaseReason', v_refund.release_reason);
  end if;

  select * into v_original
  from private.stripe_subscription_payments p
  where p.provider = v_refund.provider
    and p.livemode = v_refund.livemode
    and p.external_payment_intent_id = v_refund.external_payment_intent_id;

  if not found or v_original.paid_at is null or v_original.currency is null then
    return jsonb_build_object('released', false, 'reason', 'original_payment_unknown');
  end if;

  if not exists (
    select 1
    from private.stripe_subscription_payments o
    where o.provider = v_refund.provider
      and o.livemode = v_refund.livemode
      and o.user_id = v_refund.user_id
      and o.external_subscription_id = v_refund.external_subscription_id
      and o.external_payment_intent_id <> v_refund.external_payment_intent_id
      and o.currency = v_original.currency
      and o.amount_paid is not null
      and o.amount_paid >= v_refund.amount_refunded
      and o.paid_at between v_original.paid_at - interval '7 days'
                        and v_original.paid_at + interval '7 days'
      and not exists (
        select 1
        from private.individual_billing_refunds x
        where x.provider = o.provider
          and x.livemode = o.livemode
          and x.external_payment_intent_id = o.external_payment_intent_id
          and x.full_refund
      )
  ) then
    return jsonb_build_object('released', false, 'reason', 'no_covering_payment');
  end if;

  update private.individual_billing_refunds r
  set released_at = p_event_at,
      release_reason = 'duplicate_payment',
      updated_at = now()
  where r.provider = v_refund.provider
    and r.livemode = v_refund.livemode
    and r.external_charge_id = v_refund.external_charge_id;

  return jsonb_build_object(
    'released', true,
    'userId', v_refund.user_id,
    'pauseReason', private.individual_ai_billing_pause_reason(v_refund.user_id)
  );
end;
$function$;

revoke all on function public.release_stripe_duplicate_payment_refund(text, boolean, text, timestamptz) from public;
revoke all on function public.release_stripe_duplicate_payment_refund(text, boolean, text, timestamptz) from anon, anonymous, authenticated, authenticator, service_role;
