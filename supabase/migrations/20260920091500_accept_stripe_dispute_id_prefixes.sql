-- Stripe dispute IDs can use both dp_ and du_ prefixes.
-- Correct the already-live private ledger constraint and service-only sync RPC.

alter table private.individual_billing_disputes
  drop constraint if exists individual_billing_disputes_id_format;

alter table private.individual_billing_disputes
  add constraint individual_billing_disputes_id_format
  check (external_dispute_id ~ '^d[pu]_[A-Za-z0-9_]+$');

create or replace function public.sync_stripe_dispute_event(
  p_event_id text,
  p_event_type text,
  p_livemode boolean,
  p_dispute_id text,
  p_payment_intent_id text,
  p_status text,
  p_event_at timestamptz
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_payment private.stripe_subscription_payments%rowtype;
  v_release boolean := false;
  v_release_reason text := null;
  v_closed_at timestamptz := null;
begin
  if p_event_id !~ '^evt_[A-Za-z0-9_]+$'
     or p_dispute_id !~ '^d[pu]_[A-Za-z0-9_]+$'
     or p_payment_intent_id !~ '^pi_[A-Za-z0-9_]+$'
     or char_length(coalesce(p_status, '')) not between 1 and 64
     or p_event_at is null
     or p_event_type not in (
       'charge.dispute.created',
       'charge.dispute.closed',
       'charge.dispute.funds_withdrawn',
       'charge.dispute.funds_reinstated'
     ) then
    raise exception 'invalid_stripe_dispute_event' using errcode = '22023';
  end if;

  select * into v_payment
  from private.stripe_subscription_payments p
  where p.provider = 'stripe'
    and p.livemode = p_livemode
    and p.external_payment_intent_id = p_payment_intent_id;

  if not found then
    raise exception 'stripe_dispute_payment_mapping_missing' using errcode = 'P0001';
  end if;

  if p_event_type = 'charge.dispute.closed' then
    v_closed_at := p_event_at;
    if p_status in ('won', 'warning_closed') then
      v_release := true;
      v_release_reason := 'dispute_resolved';
    end if;
  elsif p_event_type = 'charge.dispute.funds_reinstated' then
    v_release := true;
    v_release_reason := 'funds_reinstated';
  end if;

  insert into private.individual_billing_disputes (
    provider, livemode, external_dispute_id, external_payment_intent_id,
    user_id, external_subscription_id, status, last_event_type, last_event_id,
    opened_at, last_event_at, closed_at, released_at, release_reason, updated_at
  )
  values (
    'stripe', p_livemode, p_dispute_id, p_payment_intent_id,
    v_payment.user_id, v_payment.external_subscription_id, p_status, p_event_type, p_event_id,
    p_event_at, p_event_at, v_closed_at,
    case when v_release then p_event_at else null end,
    v_release_reason, now()
  )
  on conflict (provider, livemode, external_dispute_id)
  do update set
    status = excluded.status,
    last_event_type = excluded.last_event_type,
    last_event_id = excluded.last_event_id,
    last_event_at = excluded.last_event_at,
    closed_at = coalesce(excluded.closed_at, private.individual_billing_disputes.closed_at),
    released_at = case
      when excluded.released_at is not null then excluded.released_at
      when excluded.last_event_type in ('charge.dispute.created', 'charge.dispute.funds_withdrawn') then null
      else private.individual_billing_disputes.released_at
    end,
    release_reason = case
      when excluded.release_reason is not null then excluded.release_reason
      when excluded.last_event_type in ('charge.dispute.created', 'charge.dispute.funds_withdrawn') then null
      else private.individual_billing_disputes.release_reason
    end,
    updated_at = now()
  where excluded.last_event_at >= private.individual_billing_disputes.last_event_at;

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
    'pauseReason', private.individual_ai_billing_pause_reason(v_payment.user_id)
  );
end;
$function$;

revoke all on function public.sync_stripe_dispute_event(text, text, boolean, text, text, text, timestamptz)
  from public, anon, authenticated;
grant execute on function public.sync_stripe_dispute_event(text, text, boolean, text, text, text, timestamptz)
  to service_role;
