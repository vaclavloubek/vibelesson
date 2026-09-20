
-- Organization AI billing pause / Stripe loss recovery.
-- Payment trouble pauses only new AI cost while the commercial licence remains usable.
-- Hard states (suspended/expired/cancelled/awaiting_payment) remain unchanged.

create table if not exists private.organization_stripe_payments (
  provider text not null default 'stripe',
  livemode boolean not null,
  external_payment_intent_id text not null,
  external_invoice_id text not null,
  organization_id uuid not null references public.organizations(id),
  order_id uuid not null references public.organization_orders(id),
  paid_at timestamptz not null,
  amount_paid bigint not null check (amount_paid >= 0),
  currency text not null check (currency in ('czk','eur','usd')),
  billing_reason text not null check (billing_reason ~ '^[a-z0-9_]{1,64}$'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (provider, livemode, external_payment_intent_id)
);

create index if not exists organization_stripe_payments_org_paid_idx
  on private.organization_stripe_payments(organization_id, paid_at desc);

alter table private.organization_stripe_payments enable row level security;
revoke all on private.organization_stripe_payments from public, anon, authenticated, service_role;

create table if not exists private.organization_billing_disputes (
  provider text not null default 'stripe',
  livemode boolean not null,
  external_dispute_id text not null,
  external_payment_intent_id text not null,
  organization_id uuid not null references public.organizations(id),
  order_id uuid not null references public.organization_orders(id),
  amount_disputed bigint not null check (amount_disputed > 0),
  currency text not null check (currency in ('czk','eur','usd')),
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
  primary key (provider, livemode, external_dispute_id)
);

create index if not exists organization_billing_disputes_open_idx
  on private.organization_billing_disputes(organization_id, last_event_at desc)
  where released_at is null;

alter table private.organization_billing_disputes enable row level security;
revoke all on private.organization_billing_disputes from public, anon, authenticated, service_role;

create table if not exists private.organization_billing_refunds (
  provider text not null default 'stripe',
  livemode boolean not null,
  external_charge_id text not null,
  external_payment_intent_id text not null,
  organization_id uuid not null references public.organizations(id),
  order_id uuid not null references public.organization_orders(id),
  amount_total bigint not null check (amount_total > 0),
  amount_refunded bigint not null check (amount_refunded >= 0 and amount_refunded <= amount_total),
  full_refund boolean not null,
  last_event_type text not null,
  last_event_id text not null,
  last_event_at timestamptz not null,
  full_refunded_at timestamptz,
  released_at timestamptz,
  release_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (provider, livemode, external_charge_id)
);

create index if not exists organization_billing_refunds_open_idx
  on private.organization_billing_refunds(organization_id, last_event_at desc)
  where full_refund and released_at is null;

alter table private.organization_billing_refunds enable row level security;
revoke all on private.organization_billing_refunds from public, anon, authenticated, service_role;

-- Migrate the old licence-wide card past_due representation into the new
-- AI-only payment-grace representation. Manual invoice lifecycle is unchanged.
update public.organizations
set status = 'active',
    updated_at = now()
where status = 'past_due'
  and renewal_mode = 'automatic_card'
  and past_due_at is not null;

create or replace function private.organization_ai_billing_pause_reason(p_organization_id uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $function$
  select case
    when exists (
      select 1 from public.organizations o
      where o.id = p_organization_id and o.is_internal_test
    ) then null
    when exists (
      select 1
      from private.organization_billing_disputes d
      where d.provider='stripe'
        and d.livemode=true
        and d.organization_id=p_organization_id
        and d.released_at is null
    ) then 'dispute'
    when exists (
      select 1
      from private.organization_billing_refunds r
      where r.provider='stripe'
        and r.livemode=true
        and r.organization_id=p_organization_id
        and r.full_refund
        and r.released_at is null
    ) then 'refund'
    when exists (
      select 1 from public.organizations o
      where o.id=p_organization_id
        and (o.status='past_due' or (o.status='active' and o.past_due_at is not null))
    ) then 'past_due'
    else null
  end;
$function$;

revoke all on function private.organization_ai_billing_pause_reason(uuid)
  from public, anon, authenticated, service_role;

create or replace function private.organization_ai_billing_paused(p_organization_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $function$
  select private.organization_ai_billing_pause_reason(p_organization_id) is not null;
$function$;

revoke all on function private.organization_ai_billing_paused(uuid)
  from public, anon, authenticated, service_role;

create or replace function private.effective_ai_billing_pause_reason(p_user_id uuid)
returns text
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare
  v_role text;
  v_org_id uuid;
begin
  select p.role into v_role
  from public.profiles p
  where p.id=p_user_id;

  if v_role = 'admin' then return null; end if;

  select m.organization_id
  into v_org_id
  from public.organization_memberships m
  join public.organizations o on o.id=m.organization_id
  where m.user_id=p_user_id
    and m.status='active'
    and m.revoked_at is null
    and o.status='active'
  limit 1;

  if v_org_id is not null then
    return private.organization_ai_billing_pause_reason(v_org_id);
  end if;

  return private.individual_ai_billing_pause_reason(p_user_id);
end;
$function$;

revoke all on function private.effective_ai_billing_pause_reason(uuid)
  from public, anon, authenticated, service_role;

create or replace function private.effective_ai_billing_paused(p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $function$
  select private.effective_ai_billing_pause_reason(p_user_id) is not null;
$function$;

revoke all on function private.effective_ai_billing_paused(uuid)
  from public, anon, authenticated, service_role;

create or replace function public.get_effective_ai_billing_pause_state_server(p_user_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare
  v_role text;
  v_org_id uuid;
  v_membership_role text;
  v_reason text;
begin

  select p.role into v_role from public.profiles p where p.id=p_user_id;
  if not found then raise exception 'profile_not_found' using errcode='P0001'; end if;

  if v_role='admin' then
    return jsonb_build_object('reason',null,'scope',null,'organizationId',null,'manager',false);
  end if;

  select m.organization_id,m.role
  into v_org_id,v_membership_role
  from public.organization_memberships m
  join public.organizations o on o.id=m.organization_id
  where m.user_id=p_user_id
    and m.status='active'
    and m.revoked_at is null
    and o.status='active'
  limit 1;

  if v_org_id is not null then
    v_reason := private.organization_ai_billing_pause_reason(v_org_id);
    return jsonb_build_object(
      'reason',v_reason,
      'scope',case when v_reason is null then null else 'organization' end,
      'organizationId',case when v_reason is null then null else v_org_id end,
      'manager',case when v_reason is null then false else v_membership_role in ('owner','admin') end
    );
  end if;

  v_reason := private.individual_ai_billing_pause_reason(p_user_id);
  return jsonb_build_object(
    'reason',v_reason,
    'scope',case when v_reason is null then null else 'individual' end,
    'organizationId',null,
    'manager',false
  );
end;
$function$;

revoke execute on function public.get_effective_ai_billing_pause_state_server(uuid)
  from public, anon, authenticated;
grant execute on function public.get_effective_ai_billing_pause_state_server(uuid)
  to service_role;

create or replace function public.get_organization_ai_billing_pause_reason_server(p_organization_id uuid)
returns text
language plpgsql
stable
security definer
set search_path = ''
as $function$
begin
  return private.organization_ai_billing_pause_reason(p_organization_id);
end;
$function$;

revoke execute on function public.get_organization_ai_billing_pause_reason_server(uuid)
  from public, anon, authenticated;
grant execute on function public.get_organization_ai_billing_pause_reason_server(uuid)
  to service_role;

create or replace function private.try_release_organization_ai_billing_losses(
  p_organization_id uuid,
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
  if p_organization_id is null
     or p_currency not in ('czk','eur','usd')
     or p_paid_at is null then
    raise exception 'invalid_organization_recovery_payment_context' using errcode='22023';
  end if;

  with raw_losses as (
    select d.external_payment_intent_id,d.closed_at as loss_at,d.amount_disputed as loss_amount
    from private.organization_billing_disputes d
    where d.provider='stripe'
      and d.livemode=p_livemode
      and d.organization_id=p_organization_id
      and d.status='lost'
      and d.closed_at is not null
      and d.released_at is null
      and d.currency=p_currency
      and d.amount_disputed>0

    union all

    select r.external_payment_intent_id,r.full_refunded_at as loss_at,r.amount_refunded as loss_amount
    from private.organization_billing_refunds r
    join private.organization_stripe_payments original
      on original.provider=r.provider
     and original.livemode=r.livemode
     and original.external_payment_intent_id=r.external_payment_intent_id
    where r.provider='stripe'
      and r.livemode=p_livemode
      and r.organization_id=p_organization_id
      and r.full_refund
      and r.full_refunded_at is not null
      and r.released_at is null
      and original.currency=p_currency
      and r.amount_refunded>0
  ),
  losses as (
    select external_payment_intent_id,min(loss_at) as loss_at,max(loss_amount) as loss_amount
    from raw_losses
    group by external_payment_intent_id
  )
  select coalesce(sum(loss_amount),0)::bigint,min(loss_at)
  into v_required,v_recovery_start
  from losses;

  if v_required<=0 or v_recovery_start is null then
    return jsonb_build_object('requiredAmount',0,'recoveredAmount',0,'releasedLostDisputes',0,'releasedFullRefunds',0);
  end if;

  select coalesce(sum(p.amount_paid),0)::bigint
  into v_recovered
  from private.organization_stripe_payments p
  where p.provider='stripe'
    and p.livemode=p_livemode
    and p.organization_id=p_organization_id
    and p.currency=p_currency
    and p.amount_paid>0
    and p.paid_at>v_recovery_start
    and p.paid_at<=p_paid_at;

  if v_recovered<v_required then
    return jsonb_build_object(
      'requiredAmount',v_required,'recoveredAmount',v_recovered,
      'releasedLostDisputes',0,'releasedFullRefunds',0
    );
  end if;

  update private.organization_billing_disputes d
  set released_at=p_paid_at,release_reason='subsequent_payment',updated_at=now()
  where d.provider='stripe'
    and d.livemode=p_livemode
    and d.organization_id=p_organization_id
    and d.status='lost'
    and d.closed_at is not null
    and d.released_at is null
    and d.currency=p_currency;
  get diagnostics v_released_disputes=row_count;

  update private.organization_billing_refunds r
  set released_at=p_paid_at,release_reason='subsequent_payment',updated_at=now()
  where r.provider='stripe'
    and r.livemode=p_livemode
    and r.organization_id=p_organization_id
    and r.full_refund
    and r.full_refunded_at is not null
    and r.released_at is null
    and exists (
      select 1 from private.organization_stripe_payments original
      where original.provider=r.provider
        and original.livemode=r.livemode
        and original.external_payment_intent_id=r.external_payment_intent_id
        and original.currency=p_currency
    );
  get diagnostics v_released_refunds=row_count;

  return jsonb_build_object(
    'requiredAmount',v_required,'recoveredAmount',v_recovered,
    'releasedLostDisputes',v_released_disputes,'releasedFullRefunds',v_released_refunds
  );
end;
$function$;

revoke all on function private.try_release_organization_ai_billing_losses(uuid,boolean,text,timestamptz)
  from public, anon, authenticated, service_role;

create or replace function public.sync_organization_invoice_payment_event_v2(
  p_event_id text,
  p_livemode boolean,
  p_organization_id uuid,
  p_order_id uuid,
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
  v_order public.organization_orders%rowtype;
  v_existing private.organization_stripe_payments%rowtype;
  v_recovery jsonb;
begin

  if p_event_id !~ '^evt_[A-Za-z0-9_]+$'
     or p_invoice_id !~ '^in_[A-Za-z0-9_]+$'
     or p_payment_intent_id !~ '^pi_[A-Za-z0-9_]+$'
     or p_organization_id is null or p_order_id is null or p_paid_at is null
     or p_amount_paid<0
     or p_currency not in ('czk','eur','usd')
     or p_billing_reason is null
     or p_billing_reason !~ '^[a-z0-9_]{1,64}$' then
    raise exception 'invalid_organization_invoice_payment_mapping' using errcode='22023';
  end if;

  select * into v_order
  from public.organization_orders o
  where o.id=p_order_id and o.organization_id=p_organization_id
  for update;

  if not found then raise exception 'organization_order_not_found' using errcode='P0001'; end if;
  if v_order.livemode is distinct from p_livemode then
    raise exception 'organization_billing_environment_mismatch' using errcode='P0001';
  end if;
  if v_order.payment_method<>'card' then
    raise exception 'organization_payment_mapping_not_card' using errcode='P0001';
  end if;

  select * into v_existing
  from private.organization_stripe_payments p
  where p.provider='stripe'
    and p.livemode=p_livemode
    and p.external_payment_intent_id=p_payment_intent_id;

  if found and (
    v_existing.organization_id is distinct from p_organization_id
    or v_existing.order_id is distinct from p_order_id
    or v_existing.external_invoice_id is distinct from p_invoice_id
    or v_existing.amount_paid is distinct from p_amount_paid
    or v_existing.currency is distinct from p_currency
    or v_existing.billing_reason is distinct from p_billing_reason
  ) then
    raise exception 'organization_stripe_payment_mapping_conflict' using errcode='P0001';
  end if;

  insert into private.organization_stripe_payments(
    provider,livemode,external_payment_intent_id,external_invoice_id,
    organization_id,order_id,paid_at,amount_paid,currency,billing_reason,updated_at
  ) values (
    'stripe',p_livemode,p_payment_intent_id,p_invoice_id,
    p_organization_id,p_order_id,p_paid_at,p_amount_paid,p_currency,p_billing_reason,now()
  )
  on conflict(provider,livemode,external_payment_intent_id)
  do update set
    paid_at=greatest(private.organization_stripe_payments.paid_at,excluded.paid_at),
    updated_at=now();

  v_recovery:=private.try_release_organization_ai_billing_losses(
    p_organization_id,p_livemode,p_currency,p_paid_at
  );

  return jsonb_build_object(
    'mapped',true,'amountPaid',p_amount_paid,'currency',p_currency,
    'billingReason',p_billing_reason,'recovery',v_recovery
  );
end;
$function$;

revoke execute on function public.sync_organization_invoice_payment_event_v2(
  text,boolean,uuid,uuid,text,text,timestamptz,bigint,text,text
) from public,anon,authenticated;
grant execute on function public.sync_organization_invoice_payment_event_v2(
  text,boolean,uuid,uuid,text,text,timestamptz,bigint,text,text
) to service_role;

create or replace function public.sync_organization_stripe_dispute_event(
  p_event_id text,
  p_event_type text,
  p_livemode boolean,
  p_dispute_id text,
  p_payment_intent_id text,
  p_status text,
  p_amount_disputed bigint,
  p_currency text,
  p_event_at timestamptz
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_payment private.organization_stripe_payments%rowtype;
  v_existing private.organization_billing_disputes%rowtype;
  v_release boolean:=false;
  v_release_reason text:=null;
  v_closed_at timestamptz:=null;
begin

  if p_event_id !~ '^evt_[A-Za-z0-9_]+$'
     or p_dispute_id !~ '^d[pu]_[A-Za-z0-9_]+$'
     or p_payment_intent_id !~ '^pi_[A-Za-z0-9_]+$'
     or char_length(coalesce(p_status,'')) not between 1 and 64
     or p_amount_disputed<=0
     or p_currency not in ('czk','eur','usd')
     or p_event_at is null
     or p_event_type not in (
       'charge.dispute.created','charge.dispute.closed',
       'charge.dispute.funds_withdrawn','charge.dispute.funds_reinstated'
     ) then
    raise exception 'invalid_organization_stripe_dispute_event' using errcode='22023';
  end if;

  select * into v_payment
  from private.organization_stripe_payments p
  where p.provider='stripe'
    and p.livemode=p_livemode
    and p.external_payment_intent_id=p_payment_intent_id;

  if not found then
    raise exception 'organization_stripe_dispute_payment_mapping_missing' using errcode='P0001';
  end if;
  if v_payment.currency is distinct from p_currency then
    raise exception 'organization_stripe_dispute_currency_mismatch' using errcode='P0001';
  end if;
  if p_amount_disputed > v_payment.amount_paid then
    raise exception 'organization_stripe_dispute_amount_mismatch' using errcode='P0001';
  end if;

  select * into v_existing
  from private.organization_billing_disputes d
  where d.provider='stripe'
    and d.livemode=p_livemode
    and d.external_dispute_id=p_dispute_id;

  if found and (
    v_existing.external_payment_intent_id is distinct from p_payment_intent_id
    or v_existing.organization_id is distinct from v_payment.organization_id
    or v_existing.order_id is distinct from v_payment.order_id
    or v_existing.amount_disputed is distinct from p_amount_disputed
    or v_existing.currency is distinct from p_currency
  ) then
    raise exception 'organization_stripe_dispute_mapping_conflict' using errcode='P0001';
  end if;

  if p_event_type='charge.dispute.closed' then
    v_closed_at:=p_event_at;
    if p_status in ('won','warning_closed') then
      v_release:=true; v_release_reason:='dispute_resolved';
    end if;
  elsif p_event_type='charge.dispute.funds_reinstated' then
    v_release:=true; v_release_reason:='funds_reinstated';
  end if;

  insert into private.organization_billing_disputes(
    provider,livemode,external_dispute_id,external_payment_intent_id,
    organization_id,order_id,amount_disputed,currency,status,last_event_type,last_event_id,
    opened_at,last_event_at,closed_at,released_at,release_reason,updated_at
  ) values (
    'stripe',p_livemode,p_dispute_id,p_payment_intent_id,
    v_payment.organization_id,v_payment.order_id,p_amount_disputed,p_currency,
    p_status,p_event_type,p_event_id,p_event_at,p_event_at,v_closed_at,
    case when v_release then p_event_at else null end,v_release_reason,now()
  )
  on conflict(provider,livemode,external_dispute_id)
  do update set
    status=excluded.status,
    last_event_type=excluded.last_event_type,
    last_event_id=excluded.last_event_id,
    last_event_at=excluded.last_event_at,
    closed_at=coalesce(excluded.closed_at,private.organization_billing_disputes.closed_at),
    released_at=case
      when excluded.released_at is not null then excluded.released_at
      when excluded.last_event_type in ('charge.dispute.created','charge.dispute.funds_withdrawn') then null
      else private.organization_billing_disputes.released_at
    end,
    release_reason=case
      when excluded.release_reason is not null then excluded.release_reason
      when excluded.last_event_type in ('charge.dispute.created','charge.dispute.funds_withdrawn') then null
      else private.organization_billing_disputes.release_reason
    end,
    updated_at=now()
  where excluded.last_event_at>=private.organization_billing_disputes.last_event_at;

  insert into public.organization_billing_events(
    provider,livemode,external_event_id,event_type,organization_id,order_id
  ) values (
    'stripe',p_livemode,p_event_id,p_event_type,v_payment.organization_id,v_payment.order_id
  ) on conflict do nothing;

  return jsonb_build_object(
    'organizationId',v_payment.organization_id,
    'orderId',v_payment.order_id,
    'pauseReason',private.organization_ai_billing_pause_reason(v_payment.organization_id)
  );
end;
$function$;

revoke execute on function public.sync_organization_stripe_dispute_event(
  text,text,boolean,text,text,text,bigint,text,timestamptz
) from public,anon,authenticated;
grant execute on function public.sync_organization_stripe_dispute_event(
  text,text,boolean,text,text,text,bigint,text,timestamptz
) to service_role;

create or replace function public.sync_organization_stripe_refund_state(
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
  v_payment private.organization_stripe_payments%rowtype;
  v_existing private.organization_billing_refunds%rowtype;
  v_full_refunded_at timestamptz;
  v_released_at timestamptz;
  v_release_reason text;
begin

  if p_event_id !~ '^evt_[A-Za-z0-9_]+$'
     or p_event_type not in ('charge.refunded','refund.created','refund.updated','refund.failed')
     or p_charge_id !~ '^ch_[A-Za-z0-9_]+$'
     or p_payment_intent_id !~ '^pi_[A-Za-z0-9_]+$'
     or p_amount_total<=0
     or p_amount_refunded<0
     or p_amount_refunded>p_amount_total
     or p_fully_refunded is distinct from (p_amount_refunded>=p_amount_total)
     or p_event_at is null then
    raise exception 'invalid_organization_stripe_refund_state' using errcode='22023';
  end if;

  select * into v_payment
  from private.organization_stripe_payments p
  where p.provider='stripe'
    and p.livemode=p_livemode
    and p.external_payment_intent_id=p_payment_intent_id;

  if not found then
    raise exception 'organization_stripe_refund_payment_mapping_missing' using errcode='P0001';
  end if;
  if p_amount_total is distinct from v_payment.amount_paid then
    raise exception 'organization_stripe_refund_amount_mismatch' using errcode='P0001';
  end if;

  select * into v_existing
  from private.organization_billing_refunds r
  where r.provider='stripe'
    and r.livemode=p_livemode
    and r.external_charge_id=p_charge_id;

  if found and (
    v_existing.external_payment_intent_id is distinct from p_payment_intent_id
    or v_existing.organization_id is distinct from v_payment.organization_id
    or v_existing.order_id is distinct from v_payment.order_id
    or v_existing.amount_total is distinct from p_amount_total
  ) then
    raise exception 'organization_stripe_refund_mapping_conflict' using errcode='P0001';
  end if;

  if p_fully_refunded then
    v_full_refunded_at:=case
      when found and v_existing.full_refund and v_existing.full_refunded_at is not null
        then least(v_existing.full_refunded_at,p_event_at)
      else p_event_at
    end;
    if found and v_existing.full_refund and v_existing.released_at is not null then
      -- A recovered full refund is idempotent. Repeated refund.updated /
      -- charge.refunded events for the same still-full-refunded charge must not
      -- reopen the loss after later subscription payments already recovered it.
      v_released_at:=v_existing.released_at;
      v_release_reason:=v_existing.release_reason;
    else
      v_released_at:=null;
      v_release_reason:=null;
    end if;
  else
    v_full_refunded_at:=case when found then v_existing.full_refunded_at else null end;
    if found and v_existing.full_refund and v_existing.released_at is null then
      v_released_at:=p_event_at;
      v_release_reason:='refund_reversed';
    else
      v_released_at:=case when found then v_existing.released_at else null end;
      v_release_reason:=case when found then v_existing.release_reason else null end;
    end if;
  end if;

  insert into private.organization_billing_refunds(
    provider,livemode,external_charge_id,external_payment_intent_id,
    organization_id,order_id,amount_total,amount_refunded,full_refund,
    last_event_type,last_event_id,last_event_at,full_refunded_at,
    released_at,release_reason,updated_at
  ) values (
    'stripe',p_livemode,p_charge_id,p_payment_intent_id,
    v_payment.organization_id,v_payment.order_id,p_amount_total,p_amount_refunded,p_fully_refunded,
    p_event_type,p_event_id,p_event_at,v_full_refunded_at,v_released_at,v_release_reason,now()
  )
  on conflict(provider,livemode,external_charge_id)
  do update set
    amount_refunded=excluded.amount_refunded,
    full_refund=excluded.full_refund,
    last_event_type=excluded.last_event_type,
    last_event_id=excluded.last_event_id,
    last_event_at=excluded.last_event_at,
    full_refunded_at=excluded.full_refunded_at,
    released_at=excluded.released_at,
    release_reason=excluded.release_reason,
    updated_at=now()
  where excluded.last_event_at>=private.organization_billing_refunds.last_event_at;

  insert into public.organization_billing_events(
    provider,livemode,external_event_id,event_type,organization_id,order_id
  ) values (
    'stripe',p_livemode,p_event_id,p_event_type,v_payment.organization_id,v_payment.order_id
  ) on conflict do nothing;

  return jsonb_build_object(
    'organizationId',v_payment.organization_id,
    'orderId',v_payment.order_id,
    'fullRefund',p_fully_refunded,
    'pauseReason',private.organization_ai_billing_pause_reason(v_payment.organization_id)
  );
end;
$function$;

revoke execute on function public.sync_organization_stripe_refund_state(
  text,text,boolean,text,text,bigint,bigint,boolean,timestamptz
) from public,anon,authenticated;
grant execute on function public.sync_organization_stripe_refund_state(
  text,text,boolean,text,text,bigint,bigint,boolean,timestamptz
) to service_role;


-- Extend the existing generation write-boundary to organization billing pause.

CREATE OR REPLACE FUNCTION private.enforce_individual_ai_payment_state()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  if new.action in ('generate_lesson', 'revise_lesson', 'revise_block') then
    if new.organization_id is not null
       and private.organization_ai_billing_paused(new.organization_id) then
      raise exception 'billing_payment_required' using errcode = 'P0001';
    elsif new.organization_id is null
       and private.individual_ai_billing_paused(new.user_id) then
      raise exception 'billing_payment_required' using errcode = 'P0001';
    end if;
  end if;
  return new;
end;
$function$;


-- Use effective individual/organization billing state in all AI grading paths.

CREATE OR REPLACE FUNCTION private.dispatch_response_evaluation_job(p_evaluation_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_token text;
  v_hash text;
  v_user_id uuid;
begin
  select s.teacher_id
  into v_user_id
  from public.response_evaluations e
  join public.sessions s on s.id = e.session_id
  where e.id = p_evaluation_id;

  if v_user_id is not null
     and private.effective_ai_billing_paused(v_user_id) then
    update public.response_evaluations
    set status = 'needs_review',
        grader_version = 'manual-payment-v1',
        error = null,
        updated_at = now()
    where id = p_evaluation_id
      and (
        status = 'pending'
        or (status = 'grading' and updated_at < now() - interval '5 minutes')
      );

    delete from private.grading_jobs
    where evaluation_id = p_evaluation_id;

    return false;
  end if;

  if not exists (
    select 1
    from public.response_evaluations e
    join public.sessions s on s.id = e.session_id
    join public.profiles p on p.id = s.teacher_id
    where e.id = p_evaluation_id
      and (coalesce(p.ai_grading_enabled, false) or p.role = 'admin')
      and (
        e.status = 'pending'
        or (e.status = 'grading' and e.updated_at < now() - interval '5 minutes')
      )
  ) then
    return false;
  end if;

  v_token := encode(extensions.gen_random_bytes(32), 'hex');
  v_hash := encode(extensions.digest(v_token, 'sha256'), 'hex');

  insert into private.grading_jobs (
    evaluation_id,
    token_hash,
    status,
    attempt_count,
    created_at,
    expires_at,
    claimed_at
  )
  values (
    p_evaluation_id,
    v_hash,
    'pending',
    1,
    now(),
    now() + interval '15 minutes',
    null
  )
  on conflict (evaluation_id) do update
  set token_hash = excluded.token_hash,
      status = 'pending',
      attempt_count = private.grading_jobs.attempt_count + 1,
      created_at = now(),
      expires_at = now() + interval '15 minutes',
      claimed_at = null;

  perform net.http_post(
    url := 'https://www.syllonaut.com/api/internal/grading/jobs',
    body := jsonb_build_object('token', v_token),
    headers := '{"Content-Type":"application/json"}'::jsonb,
    timeout_milliseconds := 5000
  );

  return true;
end;
$function$;



CREATE OR REPLACE FUNCTION private.enqueue_server_grading_job()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_user_id uuid;
begin
  if new.status <> 'pending' then
    return new;
  end if;

  if tg_op = 'UPDATE'
     and old.status = 'pending'
     and old.source_updated_at is not distinct from new.source_updated_at then
    return new;
  end if;

  select s.teacher_id
  into v_user_id
  from public.sessions s
  where s.id = new.session_id;

  if v_user_id is not null
     and private.effective_ai_billing_paused(v_user_id) then
    update public.response_evaluations
    set status = 'needs_review',
        grader_version = 'manual-payment-v1',
        error = null,
        updated_at = now()
    where id = new.id
      and status = 'pending';
    return new;
  end if;

  perform private.dispatch_response_evaluation_job(new.id);
  return new;
end;
$function$;



CREATE OR REPLACE FUNCTION private.reserve_ai_grading_budget(p_evaluation_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_user_id uuid;
  v_role text;
  v_ai_enabled boolean;
  v_org_id uuid;
  v_plan_code text;
  v_budget numeric(12,2);
  v_count_limit integer;
  v_used_count integer;
  v_used_cost numeric(14,6);
  v_reservation numeric(12,6) := 0.040000;
  v_month_start timestamptz := date_trunc('month', now() at time zone 'UTC') at time zone 'UTC';
  v_month_end timestamptz := (date_trunc('month', now() at time zone 'UTC') + interval '1 month') at time zone 'UTC';
begin
  select s.teacher_id, p.role, coalesce(p.ai_grading_enabled, false)
  into v_user_id, v_role, v_ai_enabled
  from public.response_evaluations e
  join public.sessions s on s.id = e.session_id
  join public.profiles p on p.id = s.teacher_id
  where e.id = p_evaluation_id;

  if v_user_id is null or not v_ai_enabled then
    return false;
  end if;

  if v_role = 'admin' then
    return true;
  end if;

  if private.effective_ai_billing_paused(v_user_id) then
    return false;
  end if;

  select cao.organization_id, cao.plan_code
  into v_org_id, v_plan_code
  from private.current_active_organization(v_user_id) cao;

  if v_org_id is not null then
    perform 1
    from public.organizations o
    where o.id = v_org_id
    for update;
  else
    perform 1
    from public.profiles p
    where p.id = v_user_id
    for update;

    select coalesce(p.active_plan_code, 'free')
    into v_plan_code
    from public.profiles p
    where p.id = v_user_id;
  end if;

  select bp.monthly_ai_grading_budget_usd,
         bp.monthly_ai_grading_count_limit
  into v_budget, v_count_limit
  from public.billing_plans bp
  where bp.code = v_plan_code
    and bp.ai_grading_enabled;

  if v_budget is null or v_count_limit is null then
    return false;
  end if;

  update private.ai_grading_budget_requests r
  set status = 'failed',
      completed_at = now()
  where r.status = 'reserved'
    and r.created_at < now() - interval '15 minutes'
    and (
      (v_org_id is not null and r.organization_id = v_org_id)
      or
      (v_org_id is null and r.organization_id is null and r.user_id = v_user_id)
    );

  if exists (
    select 1
    from private.ai_grading_budget_requests r
    where r.evaluation_id = p_evaluation_id
      and r.status = 'reserved'
  ) then
    return true;
  end if;

  select
    count(*)::integer,
    coalesce(sum(
      case
        when r.status = 'reserved' then r.reserved_cost_usd
        else coalesce(r.actual_cost_usd, 0)
      end
    ), 0)::numeric(14,6)
  into v_used_count, v_used_cost
  from private.ai_grading_budget_requests r
  where r.status in ('reserved', 'succeeded')
    and r.created_at >= v_month_start
    and r.created_at < v_month_end
    and (
      (v_org_id is not null and r.organization_id = v_org_id)
      or
      (v_org_id is null and r.organization_id is null and r.user_id = v_user_id)
    );

  if v_used_count >= v_count_limit
     or v_used_cost + v_reservation > v_budget then
    return false;
  end if;

  insert into private.ai_grading_budget_requests (
    evaluation_id,
    user_id,
    organization_id,
    plan_code,
    status,
    reserved_cost_usd
  )
  values (
    p_evaluation_id,
    v_user_id,
    v_org_id,
    v_plan_code,
    'reserved',
    v_reservation
  );

  return true;
end;
$function$;



CREATE OR REPLACE FUNCTION public.requeue_response_evaluation_server(p_user_id uuid, p_evaluation_id uuid, p_device_token_hash text)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_evaluation public.response_evaluations%rowtype;
  v_submitted_answer jsonb;
  v_submitted_at timestamptz;
  v_ai_enabled boolean := false;
  v_payment_paused boolean := false;
begin
  if p_user_id is null or p_evaluation_id is null then
    raise exception 'invalid_regrade_request' using errcode = '22023';
  end if;

  if not private.trusted_device_hash_valid(p_user_id, p_device_token_hash) then
    raise exception 'trusted_device_required' using errcode = '42501';
  end if;

  select e.*
  into v_evaluation
  from public.response_evaluations e
  join public.sessions s on s.id = e.session_id
  where e.id = p_evaluation_id
    and s.teacher_id = p_user_id;

  if not found then return false; end if;
  if v_evaluation.status not in ('graded', 'needs_review', 'failed') then return false; end if;

  select coalesce(p.ai_grading_enabled, false) or p.role = 'admin'
  into v_ai_enabled
  from public.sessions s
  join public.profiles p on p.id = s.teacher_id
  where s.id = v_evaluation.session_id
    and s.teacher_id = p_user_id;

  v_ai_enabled := coalesce(v_ai_enabled, false);
  v_payment_paused := private.effective_ai_billing_paused(p_user_id);

  if v_evaluation.response_id is not null then
    select r.submitted_answer, r.submitted_at
    into v_submitted_answer, v_submitted_at
    from public.responses r
    where r.id = v_evaluation.response_id
      and r.session_id = v_evaluation.session_id;
  elsif v_evaluation.team_response_id is not null then
    select r.submitted_answer, r.submitted_at
    into v_submitted_answer, v_submitted_at
    from public.team_responses r
    where r.id = v_evaluation.team_response_id
      and r.session_id = v_evaluation.session_id;
  else
    return false;
  end if;

  if v_submitted_at is null
     or jsonb_typeof(v_submitted_answer) <> 'object'
     or nullif(btrim(v_submitted_answer->>'text'), '') is null
     or v_submitted_answer is not distinct from v_evaluation.answer_snapshot then
    return false;
  end if;

  update public.response_evaluations e
  set source_updated_at = v_submitted_at,
      status = case
        when v_ai_enabled and not v_payment_paused then 'pending'
        else 'needs_review'
      end,
      answer_snapshot = v_submitted_answer,
      criterion_scores = '[]'::jsonb,
      ai_score = null,
      teacher_score = null,
      rationale = null,
      confidence = null,
      model = null,
      cost_usd = null,
      error = null,
      evaluated_at = null,
      teacher_confirmed = false,
      teacher_reviewed_at = null,
      teacher_note = null,
      grader_version = case
        when v_ai_enabled and not v_payment_paused then 'b7-v6-server-regrade'
        when v_ai_enabled and v_payment_paused then 'manual-payment-v1'
        else 'manual-v1'
      end,
      updated_at = now()
  where e.id = p_evaluation_id;

  return true;
end;
$function$;


-- Keep card payment failure in an AI-only grace state, not a licence-wide state.

CREATE OR REPLACE FUNCTION public.sync_organization_invoice_event(p_event_id text, p_event_type text, p_livemode boolean, p_organization_id uuid, p_order_id uuid, p_invoice_id text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_order public.organization_orders%rowtype;
  v_org public.organizations%rowtype;
  v_inserted integer := 0;
  v_period_start timestamptz;
  v_period_end timestamptz;
  v_owner_role text;
begin
  if p_event_type not in ('invoice.paid', 'invoice.payment_failed') then
    raise exception 'invalid_organization_invoice_event';
  end if;

  select * into v_order
  from public.organization_orders
  where id = p_order_id and organization_id = p_organization_id
  for update;

  if not found then raise exception 'organization_order_not_found'; end if;
  if v_order.livemode is distinct from p_livemode then
    raise exception 'organization_billing_environment_mismatch';
  end if;

  select * into v_org
  from public.organizations
  where id = p_organization_id
  for update;

  if not found then raise exception 'organization_not_found'; end if;

  if not p_livemode then
    select p.role into v_owner_role
    from public.profiles p
    where p.id = v_org.owner_user_id;

    if v_owner_role is distinct from 'admin' then
      raise exception 'sandbox_organization_owner_not_admin';
    end if;
  end if;

  insert into public.organization_billing_events (
    provider, livemode, external_event_id, event_type,
    organization_id, order_id, external_invoice_id
  ) values (
    'stripe', p_livemode, p_event_id, p_event_type,
    p_organization_id, p_order_id, p_invoice_id
  )
  on conflict do nothing;

  get diagnostics v_inserted = row_count;
  if v_inserted = 0 then
    return jsonb_build_object('processed', false, 'reason', 'duplicate_event');
  end if;

  if p_event_type = 'invoice.payment_failed' then
    if v_org.status in ('active', 'past_due') then
      update public.organizations
      set status = 'active',
          past_due_at = coalesce(past_due_at, now()),
          updated_at = now()
      where id = p_organization_id;
    end if;
    return jsonb_build_object(
      'processed', true,
      'sandbox', not p_livemode,
      'status', case when v_org.status in ('active', 'past_due') then 'past_due' else v_org.status end
    );
  end if;

  v_period_start := case
    when v_org.current_period_end is not null and v_org.current_period_end > now()
      then v_org.current_period_end
    else now()
  end;

  v_period_end := case
    when v_order.billing_period = 'annual'
      then v_period_start + interval '1 year'
    else v_period_start + interval '1 month'
  end;

  update public.organization_orders
  set status = 'paid',
      paid_at = coalesce(paid_at, now()),
      external_invoice_id = coalesce(p_invoice_id, external_invoice_id),
      updated_at = now()
  where id = p_order_id;

  update public.organizations
  set status = 'active',
      current_period_start = v_period_start,
      current_period_end = v_period_end,
      activated_at = coalesce(activated_at, now()),
      suspended_at = null,
      past_due_at = null,
      cancel_at_period_end = false,
      renewal_mode = case
        when v_order.payment_method = 'card' then 'automatic_card'
        else 'manual_invoice'
      end,
      updated_at = now()
  where id = p_organization_id;

  return jsonb_build_object(
    'processed', true,
    'sandbox', not p_livemode,
    'status', 'active',
    'currentPeriodStart', v_period_start,
    'currentPeriodEnd', v_period_end
  );
end;
$function$;



CREATE OR REPLACE FUNCTION public.sync_organization_subscription_event(p_event_id text, p_event_type text, p_livemode boolean, p_organization_id uuid, p_order_id uuid, p_subscription_id text, p_status text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_inserted integer := 0;
  v_next_status text;
  v_order public.organization_orders%rowtype;
  v_org public.organizations%rowtype;
  v_owner_role text;
begin
  if p_status not in (
    'trialing', 'active', 'past_due', 'unpaid', 'canceled',
    'incomplete', 'incomplete_expired', 'paused'
  ) then raise exception 'invalid_organization_subscription_status'; end if;

  select * into v_order
  from public.organization_orders
  where id = p_order_id and organization_id = p_organization_id
  for update;

  if not found then raise exception 'organization_order_not_found'; end if;
  if v_order.livemode is distinct from p_livemode then
    raise exception 'organization_billing_environment_mismatch';
  end if;

  select * into v_org
  from public.organizations
  where id = p_organization_id
  for update;

  if not found then raise exception 'organization_not_found'; end if;

  if not p_livemode then
    select p.role into v_owner_role
    from public.profiles p
    where p.id = v_org.owner_user_id;

    if v_owner_role is distinct from 'admin' then
      raise exception 'sandbox_organization_owner_not_admin';
    end if;
  end if;

  insert into public.organization_billing_events (
    provider, livemode, external_event_id, event_type,
    organization_id, order_id
  ) values (
    'stripe', p_livemode, p_event_id, p_event_type,
    p_organization_id, p_order_id
  )
  on conflict do nothing;

  get diagnostics v_inserted = row_count;
  if v_inserted = 0 then
    return jsonb_build_object('processed', false, 'reason', 'duplicate_event');
  end if;

  update public.organization_orders
  set external_subscription_id = coalesce(p_subscription_id, external_subscription_id),
      updated_at = now()
  where id = p_order_id;

  if p_status = 'past_due' then
    v_next_status := 'past_due';
    update public.organizations
    set status = case when status = 'past_due' then 'active' else status end,
        past_due_at = coalesce(past_due_at, now()),
        updated_at = now()
    where id = p_organization_id
      and status in ('active', 'past_due');
  elsif p_status in ('unpaid', 'paused') then
    v_next_status := 'suspended';
    update public.organizations
    set status = 'suspended',
        suspended_at = now(),
        updated_at = now()
    where id = p_organization_id
      and status <> 'awaiting_payment';
  elsif p_status in ('canceled', 'incomplete_expired') then
    v_next_status := 'cancelled';
    update public.organizations
    set status = 'cancelled',
        updated_at = now()
    where id = p_organization_id
      and status <> 'awaiting_payment';
  elsif p_status in ('trialing', 'active') then
    v_next_status := null;
    update public.organizations
    set status = case when status = 'past_due' then 'active' else status end,
        past_due_at = null,
        suspended_at = case when status = 'active' then null else suspended_at end,
        updated_at = now()
    where id = p_organization_id
      and status in ('active', 'past_due');
  else
    v_next_status := null;
  end if;

  return jsonb_build_object(
    'processed', true,
    'sandbox', not p_livemode,
    'status', v_next_status
  );
end;
$function$;



CREATE OR REPLACE FUNCTION public.expire_organization_licenses()
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_count integer;
begin
  update public.organizations
  set status = 'expired',
      updated_at = now()
  where status in ('active', 'past_due')
    and current_period_end is not null
    and current_period_end <= now()
    and not (status = 'active' and past_due_at is not null);

  get diagnostics v_count = row_count;
  return v_count;
end;
$function$;



CREATE OR REPLACE FUNCTION public.suspend_overdue_organizations(p_grace_days integer DEFAULT 14)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_count integer;
begin
  if p_grace_days < 0 or p_grace_days > 90 then
    raise exception 'invalid_grace_days';
  end if;

  update public.organizations
  set status = 'suspended',
      suspended_at = now(),
      updated_at = now()
  where status in ('active', 'past_due')
    and past_due_at is not null
    and past_due_at <= now() - make_interval(days => p_grace_days);

  get diagnostics v_count = row_count;
  return v_count;
end;
$function$;
