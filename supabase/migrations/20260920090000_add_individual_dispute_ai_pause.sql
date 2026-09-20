-- Individual subscription dispute protection.
-- Keeps non-AI paid access available while pausing new variable-cost AI work.

create table if not exists private.stripe_subscription_payments (
  provider text not null default 'stripe',
  livemode boolean not null,
  external_payment_intent_id text not null,
  external_invoice_id text not null,
  user_id uuid not null references auth.users(id) on delete cascade,
  external_subscription_id text not null,
  paid_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (provider, livemode, external_payment_intent_id),
  constraint stripe_subscription_payments_provider_check check (provider = 'stripe'),
  constraint stripe_subscription_payments_pi_format check (external_payment_intent_id ~ '^pi_[A-Za-z0-9_]+$'),
  constraint stripe_subscription_payments_invoice_format check (external_invoice_id ~ '^in_[A-Za-z0-9_]+$'),
  constraint stripe_subscription_payments_subscription_format check (external_subscription_id ~ '^sub_[A-Za-z0-9_]+$')
);

alter table private.stripe_subscription_payments enable row level security;
revoke all on table private.stripe_subscription_payments from public, anon, authenticated, service_role;

create index if not exists stripe_subscription_payments_user_paid_idx
  on private.stripe_subscription_payments (user_id, paid_at desc);

create table if not exists private.individual_billing_disputes (
  provider text not null default 'stripe',
  livemode boolean not null,
  external_dispute_id text not null,
  external_payment_intent_id text not null,
  user_id uuid not null references auth.users(id) on delete cascade,
  external_subscription_id text not null,
  status text not null,
  last_event_type text not null,
  last_event_id text not null,
  opened_at timestamptz not null,
  last_event_at timestamptz not null,
  closed_at timestamptz,
  released_at timestamptz,
  release_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (provider, livemode, external_dispute_id),
  constraint individual_billing_disputes_provider_check check (provider = 'stripe'),
  constraint individual_billing_disputes_id_format check (external_dispute_id ~ '^d[pu]_[A-Za-z0-9_]+$'),
  constraint individual_billing_disputes_pi_format check (external_payment_intent_id ~ '^pi_[A-Za-z0-9_]+$'),
  constraint individual_billing_disputes_subscription_format check (external_subscription_id ~ '^sub_[A-Za-z0-9_]+$'),
  constraint individual_billing_disputes_status_nonempty check (char_length(status) between 1 and 64),
  constraint individual_billing_disputes_event_type_check check (
    last_event_type in (
      'charge.dispute.created',
      'charge.dispute.closed',
      'charge.dispute.funds_withdrawn',
      'charge.dispute.funds_reinstated'
    )
  ),
  constraint individual_billing_disputes_release_reason_check check (
    release_reason is null or release_reason in ('dispute_resolved', 'funds_reinstated', 'subsequent_payment')
  )
);

alter table private.individual_billing_disputes enable row level security;
revoke all on table private.individual_billing_disputes from public, anon, authenticated, service_role;

create index if not exists individual_billing_disputes_user_open_idx
  on private.individual_billing_disputes (user_id, last_event_at desc)
  where released_at is null;

create or replace function private.individual_ai_billing_pause_reason(p_user_id uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $function$
  select case
    when exists (
      select 1 from public.profiles p
      where p.id = p_user_id and p.role = 'admin'
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

create or replace function private.individual_ai_billing_paused(p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $function$
  select private.individual_ai_billing_pause_reason(p_user_id) is not null;
$function$;

revoke all on function private.individual_ai_billing_paused(uuid)
  from public, anon, authenticated, service_role;

create or replace function public.get_individual_ai_billing_pause_reason_server(p_user_id uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $function$
  select private.individual_ai_billing_pause_reason(p_user_id);
$function$;

revoke all on function public.get_individual_ai_billing_pause_reason_server(uuid)
  from public, anon, authenticated;
grant execute on function public.get_individual_ai_billing_pause_reason_server(uuid)
  to service_role;

create or replace function public.get_individual_ai_billing_paused_server(p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $function$
  select private.individual_ai_billing_paused(p_user_id);
$function$;

revoke all on function public.get_individual_ai_billing_paused_server(uuid)
  from public, anon, authenticated;
grant execute on function public.get_individual_ai_billing_paused_server(uuid)
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
  v_released integer := 0;
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
    select 1 from public.billing_subscriptions bs
    where bs.user_id = p_user_id
      and bs.provider = 'stripe'
      and bs.livemode = p_livemode
      and bs.external_subscription_id = p_subscription_id
  ) then
    raise exception 'stripe_invoice_subscription_mapping_mismatch' using errcode = 'P0001';
  end if;

  select * into v_existing
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

  get diagnostics v_released = row_count;

  return jsonb_build_object('mapped', true, 'releasedLostDisputes', v_released);
end;
$function$;

revoke all on function public.sync_stripe_invoice_payment_event(text, boolean, uuid, text, text, text, timestamptz)
  from public, anon, authenticated;
grant execute on function public.sync_stripe_invoice_payment_event(text, boolean, uuid, text, text, text, timestamptz)
  to service_role;

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
