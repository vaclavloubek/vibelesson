alter table public.organizations
  add column if not exists cancel_at_period_end boolean not null default false,
  add column if not exists renewal_mode text not null default 'manual_invoice'
    check (renewal_mode in ('automatic_card', 'manual_invoice'));

alter table public.organization_orders
  add column if not exists livemode boolean not null default true;

create table if not exists public.organization_billing_notifications (
  organization_id uuid not null references public.organizations(id) on delete cascade,
  notification_type text not null
    check (notification_type in ('renewal_60', 'renewal_30', 'renewal_7', 'expired')),
  period_end timestamptz not null,
  sent_at timestamptz not null default now(),
  provider_message_id text,
  primary key (organization_id, notification_type, period_end)
);

alter table public.organization_billing_notifications enable row level security;
revoke all on table public.organization_billing_notifications from public, anon, authenticated;

create or replace function public.create_organization_renewal_order(
  p_organization_id uuid,
  p_created_by uuid,
  p_amount_minor integer
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_org public.organizations%rowtype;
  v_order_id uuid;
begin
  select * into v_org
  from public.organizations
  where id = p_organization_id
  for update;

  if not found then raise exception 'organization_not_found'; end if;

  if not exists (
    select 1 from public.organization_memberships om
    where om.organization_id = p_organization_id
      and om.user_id = p_created_by
      and om.status = 'active'
      and om.role in ('owner', 'admin')
  ) then
    raise exception 'organization_admin_required';
  end if;

  if v_org.renewal_mode <> 'manual_invoice' then
    raise exception 'organization_renews_automatically';
  end if;

  if v_org.status not in ('active', 'past_due', 'expired') then
    raise exception 'organization_not_renewable';
  end if;

  if v_org.current_period_end is not null
     and v_org.current_period_end > now() + interval '90 days' then
    raise exception 'organization_renewal_too_early';
  end if;

  if exists (
    select 1 from public.organization_orders oo
    where oo.organization_id = p_organization_id
      and oo.status in ('ordered', 'awaiting_payment')
  ) then
    raise exception 'organization_pending_order_exists';
  end if;

  insert into public.organization_orders (
    organization_id,
    plan_code,
    billing_period,
    currency,
    amount_minor,
    payment_method,
    status,
    billing_snapshot,
    livemode
  )
  values (
    p_organization_id,
    v_org.plan_code,
    v_org.billing_period,
    v_org.currency,
    p_amount_minor,
    'invoice',
    'awaiting_payment',
    jsonb_build_object(
      'name', v_org.name,
      'legalName', v_org.legal_name,
      'registrationNumber', v_org.registration_number,
      'vatId', v_org.vat_id,
      'billingEmail', v_org.billing_email,
      'billingCountry', v_org.billing_country,
      'billingAddress', v_org.billing_address
    ),
    true
  )
  returning id into v_order_id;

  return v_order_id;
end;
$$;

revoke all on function public.create_organization_renewal_order(uuid, uuid, integer)
  from public, anon, authenticated;
grant execute on function public.create_organization_renewal_order(uuid, uuid, integer)
  to service_role;

create or replace function public.expire_organization_licenses()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count integer;
begin
  update public.organizations
  set status = 'expired',
      updated_at = now()
  where status in ('active', 'past_due')
    and current_period_end is not null
    and current_period_end <= now();

  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

revoke all on function public.expire_organization_licenses()
  from public, anon, authenticated;
grant execute on function public.expire_organization_licenses()
  to service_role;

create or replace function public.set_organization_cancel_at_period_end(
  p_organization_id uuid,
  p_cancel_at_period_end boolean
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.organizations
  set cancel_at_period_end = p_cancel_at_period_end,
      updated_at = now()
  where id = p_organization_id;

  if not found then raise exception 'organization_not_found'; end if;
end;
$$;

revoke all on function public.set_organization_cancel_at_period_end(uuid, boolean)
  from public, anon, authenticated;
grant execute on function public.set_organization_cancel_at_period_end(uuid, boolean)
  to service_role;

create or replace function public.mark_organization_notification_sent(
  p_organization_id uuid,
  p_notification_type text,
  p_period_end timestamptz,
  p_provider_message_id text
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_inserted integer;
begin
  insert into public.organization_billing_notifications (
    organization_id, notification_type, period_end, provider_message_id
  ) values (
    p_organization_id, p_notification_type, p_period_end, p_provider_message_id
  )
  on conflict do nothing;

  get diagnostics v_inserted = row_count;
  return v_inserted = 1;
end;
$$;

revoke all on function public.mark_organization_notification_sent(uuid, text, timestamptz, text)
  from public, anon, authenticated;
grant execute on function public.mark_organization_notification_sent(uuid, text, timestamptz, text)
  to service_role;

create or replace function public.activate_organization_order(
  p_organization_id uuid,
  p_order_id uuid,
  p_period_start timestamptz,
  p_period_end timestamptz
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_payment_method text;
begin
  if p_period_end <= p_period_start then raise exception 'invalid_period'; end if;

  update public.organization_orders
  set status = 'paid', paid_at = now(), updated_at = now()
  where id = p_order_id
    and organization_id = p_organization_id
    and status in ('ordered', 'awaiting_payment')
  returning payment_method into v_payment_method;

  if not found then raise exception 'organization_order_not_payable'; end if;

  update public.organizations
  set status = 'active',
      current_period_start = p_period_start,
      current_period_end = p_period_end,
      activated_at = coalesce(activated_at, now()),
      suspended_at = null,
      cancel_at_period_end = false,
      renewal_mode = case
        when v_payment_method = 'card' then 'automatic_card'
        else 'manual_invoice'
      end,
      updated_at = now()
  where id = p_organization_id;
end;
$$;

revoke all on function public.activate_organization_order(uuid, uuid, timestamptz, timestamptz)
  from public, anon, authenticated;
grant execute on function public.activate_organization_order(uuid, uuid, timestamptz, timestamptz)
  to service_role;

create or replace function public.sync_organization_invoice_event(
  p_event_id text,
  p_event_type text,
  p_livemode boolean,
  p_organization_id uuid,
  p_order_id uuid,
  p_invoice_id text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_order public.organization_orders%rowtype;
  v_org public.organizations%rowtype;
  v_inserted integer := 0;
  v_period_start timestamptz;
  v_period_end timestamptz;
begin
  if p_event_type not in ('invoice.paid', 'invoice.payment_failed') then
    raise exception 'invalid_organization_invoice_event';
  end if;

  select * into v_order
  from public.organization_orders
  where id = p_order_id and organization_id = p_organization_id
  for update;

  if not found then raise exception 'organization_order_not_found'; end if;

  select * into v_org
  from public.organizations
  where id = p_organization_id
  for update;

  if not found then raise exception 'organization_not_found'; end if;

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

  if not p_livemode then
    return jsonb_build_object('processed', true, 'sandbox', true);
  end if;

  if p_event_type = 'invoice.payment_failed' then
    if v_org.status = 'active' then
      update public.organizations
      set status = 'past_due', updated_at = now()
      where id = p_organization_id;
    end if;
    return jsonb_build_object('processed', true, 'status', 'past_due');
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
      cancel_at_period_end = false,
      renewal_mode = case
        when v_order.payment_method = 'card' then 'automatic_card'
        else 'manual_invoice'
      end,
      updated_at = now()
  where id = p_organization_id;

  return jsonb_build_object(
    'processed', true,
    'status', 'active',
    'currentPeriodStart', v_period_start,
    'currentPeriodEnd', v_period_end
  );
end;
$$;

revoke all on function public.sync_organization_invoice_event(
  text, text, boolean, uuid, uuid, text
) from public, anon, authenticated;
grant execute on function public.sync_organization_invoice_event(
  text, text, boolean, uuid, uuid, text
) to service_role;
