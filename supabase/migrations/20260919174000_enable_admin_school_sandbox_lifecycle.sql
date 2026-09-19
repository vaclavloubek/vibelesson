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
    if v_org.status = 'active' then
      update public.organizations
      set status = 'past_due',
          past_due_at = coalesce(past_due_at, now()),
          updated_at = now()
      where id = p_organization_id;
    end if;
    return jsonb_build_object(
      'processed', true,
      'sandbox', not p_livemode,
      'status', 'past_due'
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

  if p_status = 'past_due' then v_next_status := 'past_due';
  elsif p_status in ('unpaid', 'paused') then v_next_status := 'suspended';
  elsif p_status in ('canceled', 'incomplete_expired') then v_next_status := 'cancelled';
  else v_next_status := null;
  end if;

  if v_next_status is not null then
    update public.organizations
    set status = v_next_status,
        past_due_at = case
          when v_next_status = 'past_due' then coalesce(past_due_at, now())
          when v_next_status in ('suspended', 'cancelled') then past_due_at
          else null
        end,
        suspended_at = case
          when v_next_status = 'suspended' then now()
          else suspended_at
        end,
        updated_at = now()
    where id = p_organization_id
      and status <> 'awaiting_payment';
  end if;

  return jsonb_build_object(
    'processed', true,
    'sandbox', not p_livemode,
    'status', v_next_status
  );
end;
$$;

revoke all on function public.sync_organization_subscription_event(
  text, text, boolean, uuid, uuid, text, text
) from public, anon, authenticated;
grant execute on function public.sync_organization_subscription_event(
  text, text, boolean, uuid, uuid, text, text
) to service_role;
