alter table public.organization_orders
  add column if not exists external_subscription_id text,
  add column if not exists hosted_invoice_url text,
  add column if not exists invoice_pdf_url text;

create table public.organization_billing_events (
  provider text not null check (provider = 'stripe'),
  livemode boolean not null,
  external_event_id text not null check (char_length(external_event_id) between 5 and 255),
  event_type text not null check (char_length(event_type) between 1 and 120),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  order_id uuid references public.organization_orders(id) on delete set null,
  external_invoice_id text,
  processed_at timestamptz not null default now(),
  primary key (provider, livemode, external_event_id)
);

create index organization_billing_events_org_idx
  on public.organization_billing_events (organization_id, processed_at desc);

alter table public.organization_billing_events enable row level security;
revoke all on table public.organization_billing_events from public, anon, authenticated;

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

create or replace function public.sync_organization_subscription_event(
  p_event_id text,
  p_event_type text,
  p_livemode boolean,
  p_organization_id uuid,
  p_order_id uuid,
  p_subscription_id text,
  p_status text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_inserted integer := 0;
  v_next_status text;
begin
  if p_status not in (
    'trialing', 'active', 'past_due', 'unpaid', 'canceled',
    'incomplete', 'incomplete_expired', 'paused'
  ) then raise exception 'invalid_organization_subscription_status'; end if;

  if not exists (
    select 1 from public.organization_orders oo
    where oo.id = p_order_id and oo.organization_id = p_organization_id
  ) then raise exception 'organization_order_not_found'; end if;

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

  if not p_livemode then
    return jsonb_build_object('processed', true, 'sandbox', true);
  end if;

  if p_status = 'past_due' then v_next_status := 'past_due';
  elsif p_status in ('unpaid', 'paused') then v_next_status := 'suspended';
  elsif p_status in ('canceled', 'incomplete_expired') then v_next_status := 'cancelled';
  else v_next_status := null;
  end if;

  if v_next_status is not null then
    update public.organizations
    set status = v_next_status,
        suspended_at = case when v_next_status = 'suspended' then now() else suspended_at end,
        updated_at = now()
    where id = p_organization_id
      and status <> 'awaiting_payment';
  end if;

  return jsonb_build_object('processed', true, 'status', v_next_status);
end;
$$;

revoke all on function public.sync_organization_subscription_event(
  text, text, boolean, uuid, uuid, text, text
) from public, anon, authenticated;
grant execute on function public.sync_organization_subscription_event(
  text, text, boolean, uuid, uuid, text, text
) to service_role;

comment on table public.organization_billing_events is
  'Idempotent Stripe event ledger for school organization billing.';
