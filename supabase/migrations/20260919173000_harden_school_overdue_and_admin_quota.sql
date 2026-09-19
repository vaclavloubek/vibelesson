alter table public.organizations
  add column if not exists past_due_at timestamptz;

create or replace function private.current_active_organization(p_user_id uuid)
returns table(
  organization_id uuid,
  plan_code text,
  access_rank integer,
  monthly_lesson_limit integer,
  monthly_revision_limit integer,
  ai_grading_enabled boolean,
  lesson_folders_enabled boolean,
  multilingual_lessons_enabled boolean,
  worksheet_export_enabled boolean,
  seat_limit integer
)
language sql
security definer
set search_path = ''
as $$
  select
    o.id,
    bp.code,
    bp.access_rank,
    bp.monthly_lesson_limit,
    bp.monthly_revision_limit,
    bp.ai_grading_enabled,
    bp.lesson_folders_enabled,
    bp.multilingual_lessons_enabled,
    bp.worksheet_export_enabled,
    bp.seat_limit
  from public.organization_memberships om
  join public.organizations o on o.id = om.organization_id
  join public.billing_plans bp on bp.code = o.plan_code
  join public.profiles p on p.id = om.user_id
  where om.user_id = p_user_id
    and om.status = 'active'
    and o.status = 'active'
    and bp.audience = 'organization'
    and p.role <> 'admin'
  order by bp.access_rank desc, o.created_at asc
  limit 1;
$$;

revoke all on function private.current_active_organization(uuid) from public, anon, authenticated;

create or replace function public.suspend_overdue_organizations(p_grace_days integer default 14)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
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
  where status = 'past_due'
    and past_due_at is not null
    and past_due_at <= now() - make_interval(days => p_grace_days);

  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

revoke all on function public.suspend_overdue_organizations(integer)
  from public, anon, authenticated;
grant execute on function public.suspend_overdue_organizations(integer)
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
      set status = 'past_due',
          past_due_at = coalesce(past_due_at, now()),
          updated_at = now()
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

  return jsonb_build_object('processed', true, 'status', v_next_status);
end;
$$;

revoke all on function public.sync_organization_subscription_event(
  text, text, boolean, uuid, uuid, text, text
) from public, anon, authenticated;
grant execute on function public.sync_organization_subscription_event(
  text, text, boolean, uuid, uuid, text, text
) to service_role;
