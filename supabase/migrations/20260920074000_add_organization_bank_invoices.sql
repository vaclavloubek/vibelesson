-- Organization bank invoices.
-- Adds a stable organization-level variable symbol, immutable invoice snapshots,
-- audited bank/manual payment confirmation, and service-role-only matching paths.

create sequence if not exists private.organization_variable_symbol_seq
  as bigint
  start with 1000000001
  increment by 1
  minvalue 1000000001
  maxvalue 9999999999
  no cycle;

alter table public.organizations
  add column if not exists payment_variable_symbol text;

update public.organizations
set payment_variable_symbol = nextval('private.organization_variable_symbol_seq')::text
where payment_variable_symbol is null;

alter table public.organizations
  alter column payment_variable_symbol set not null,
  alter column payment_variable_symbol
    set default nextval('private.organization_variable_symbol_seq')::text;

alter table public.organizations
  drop constraint if exists organizations_payment_variable_symbol_check;

alter table public.organizations
  add constraint organizations_payment_variable_symbol_check
  check (payment_variable_symbol ~ '^[0-9]{1,10}$');

create unique index if not exists organizations_payment_variable_symbol_uidx
  on public.organizations(payment_variable_symbol);

create sequence if not exists private.organization_invoice_seq
  as bigint
  start with 1
  increment by 1
  minvalue 1
  no cycle;

alter table public.organization_orders
  add column if not exists invoice_number text,
  add column if not exists invoice_issued_at timestamptz,
  add column if not exists invoice_due_date date,
  add column if not exists invoice_snapshot jsonb not null default '{}'::jsonb,
  add column if not exists payment_confirmation_source text,
  add column if not exists payment_confirmed_by uuid references public.profiles(id) on delete set null,
  add column if not exists payment_confirmed_at timestamptz,
  add column if not exists bank_transaction_reference text;

alter table public.organization_orders
  drop constraint if exists organization_orders_payment_confirmation_source_check;

alter table public.organization_orders
  add constraint organization_orders_payment_confirmation_source_check
  check (
    payment_confirmation_source is null
    or payment_confirmation_source in ('stripe', 'superadmin_manual', 'bank_match')
  );

create unique index if not exists organization_orders_invoice_number_uidx
  on public.organization_orders(invoice_number)
  where invoice_number is not null;

create unique index if not exists organization_orders_one_pending_bank_invoice_per_org_uidx
  on public.organization_orders(organization_id)
  where payment_method='invoice'
    and status in ('ordered','awaiting_payment')
    and invoice_number is not null;

create table if not exists public.organization_bank_payment_confirmations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  order_id uuid not null references public.organization_orders(id) on delete cascade,
  source text not null check (source in ('superadmin_manual','bank_match')),
  actor_user_id uuid references public.profiles(id) on delete set null,
  bank_transaction_reference text,
  amount_minor integer not null check (amount_minor >= 0),
  currency text not null check (currency in ('czk','eur','usd')),
  received_at timestamptz not null,
  created_at timestamptz not null default now(),
  unique(order_id)
);

create unique index if not exists organization_bank_payment_reference_uidx
  on public.organization_bank_payment_confirmations(bank_transaction_reference)
  where bank_transaction_reference is not null;

alter table public.organization_bank_payment_confirmations enable row level security;

revoke all on table public.organization_bank_payment_confirmations
  from public, anon, authenticated;

grant select, insert, update, delete
  on table public.organization_bank_payment_confirmations
  to service_role;

create or replace function public.issue_organization_bank_invoice(
  p_order_id uuid,
  p_invoice_snapshot jsonb,
  p_due_date date
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_order public.organization_orders%rowtype;
  v_org public.organizations%rowtype;
  v_invoice_number text;
begin
  if p_due_date < current_date then
    raise exception 'invoice_due_date_invalid';
  end if;

  if jsonb_typeof(coalesce(p_invoice_snapshot, '{}'::jsonb)) <> 'object'
     or p_invoice_snapshot = '{}'::jsonb then
    raise exception 'invoice_snapshot_required';
  end if;

  select *
  into v_order
  from public.organization_orders
  where id = p_order_id
  for update;

  if not found then raise exception 'organization_order_not_found'; end if;
  if v_order.payment_method <> 'invoice' then
    raise exception 'organization_order_not_bank_invoice';
  end if;
  if v_order.status not in ('ordered','awaiting_payment') then
    raise exception 'organization_order_not_payable';
  end if;

  select *
  into v_org
  from public.organizations
  where id = v_order.organization_id
  for update;

  if v_order.invoice_number is not null then
    return jsonb_build_object(
      'invoiceNumber', v_order.invoice_number,
      'variableSymbol', v_org.payment_variable_symbol,
      'dueDate', v_order.invoice_due_date,
      'issued', false
    );
  end if;

  v_invoice_number :=
    'SY-' || to_char(current_date, 'YYYY') || '-' ||
    lpad(nextval('private.organization_invoice_seq')::text, 6, '0');

  update public.organization_orders
  set invoice_number = v_invoice_number,
      invoice_issued_at = now(),
      invoice_due_date = p_due_date,
      invoice_snapshot = p_invoice_snapshot,
      updated_at = now()
  where id = p_order_id;

  return jsonb_build_object(
    'invoiceNumber', v_invoice_number,
    'variableSymbol', v_org.payment_variable_symbol,
    'dueDate', p_due_date,
    'issued', true
  );
end;
$$;

create or replace function private.activate_organization_bank_invoice(
  p_order_id uuid,
  p_source text,
  p_actor_user_id uuid,
  p_bank_reference text,
  p_received_at timestamptz
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_order public.organization_orders%rowtype;
  v_org public.organizations%rowtype;
  v_period_start timestamptz;
  v_period_end timestamptz;
begin
  if p_source not in ('superadmin_manual','bank_match') then
    raise exception 'invalid_bank_payment_source';
  end if;

  select *
  into v_order
  from public.organization_orders
  where id = p_order_id
  for update;

  if not found then raise exception 'organization_order_not_found'; end if;
  if v_order.payment_method <> 'invoice'
     or v_order.invoice_number is null then
    raise exception 'organization_order_not_bank_invoice';
  end if;

  if v_order.status = 'paid' then
    return jsonb_build_object('processed', false, 'reason', 'already_paid');
  end if;

  if v_order.status not in ('ordered','awaiting_payment') then
    raise exception 'organization_order_not_payable';
  end if;

  select *
  into v_org
  from public.organizations
  where id = v_order.organization_id
  for update;

  if not found then raise exception 'organization_not_found'; end if;

  v_period_start := case
    when v_org.current_period_end is not null
         and v_org.current_period_end > p_received_at
      then v_org.current_period_end
    else p_received_at
  end;

  v_period_end := case
    when v_order.billing_period = 'annual'
      then v_period_start + interval '1 year'
    else v_period_start + interval '1 month'
  end;

  insert into public.organization_bank_payment_confirmations (
    organization_id,
    order_id,
    source,
    actor_user_id,
    bank_transaction_reference,
    amount_minor,
    currency,
    received_at
  )
  values (
    v_order.organization_id,
    v_order.id,
    p_source,
    p_actor_user_id,
    nullif(trim(p_bank_reference),''),
    v_order.amount_minor,
    v_order.currency,
    p_received_at
  );

  update public.organization_orders
  set status = 'paid',
      paid_at = coalesce(paid_at, p_received_at),
      payment_confirmation_source = p_source,
      payment_confirmed_by = p_actor_user_id,
      payment_confirmed_at = now(),
      bank_transaction_reference = nullif(trim(p_bank_reference),''),
      updated_at = now()
  where id = v_order.id;

  update public.organizations
  set status = 'active',
      current_period_start = v_period_start,
      current_period_end = v_period_end,
      activated_at = coalesce(activated_at, p_received_at),
      suspended_at = null,
      past_due_at = null,
      cancel_at_period_end = false,
      renewal_mode = 'manual_invoice',
      updated_at = now()
  where id = v_order.organization_id;

  return jsonb_build_object(
    'processed', true,
    'organizationId', v_order.organization_id,
    'orderId', v_order.id,
    'status', 'active',
    'currentPeriodStart', v_period_start,
    'currentPeriodEnd', v_period_end
  );
end;
$$;

create or replace function public.confirm_organization_bank_payment_manual(
  p_order_id uuid,
  p_actor_user_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_actor_user_id <> '5bbed66a-c125-4740-947c-946a364c6d3f'::uuid then
    raise exception 'superadmin_required';
  end if;

  return private.activate_organization_bank_invoice(
    p_order_id,
    'superadmin_manual',
    p_actor_user_id,
    null,
    now()
  );
end;
$$;

create or replace function public.match_organization_bank_payment(
  p_variable_symbol text,
  p_amount_minor integer,
  p_currency text,
  p_bank_reference text,
  p_received_at timestamptz
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_org_id uuid;
  v_order_id uuid;
  v_count integer;
begin
  if p_variable_symbol !~ '^[0-9]{1,10}$' then
    raise exception 'invalid_variable_symbol';
  end if;
  if p_amount_minor < 0 then raise exception 'invalid_amount'; end if;
  if lower(p_currency) not in ('czk','eur','usd') then
    raise exception 'invalid_currency';
  end if;
  if coalesce(trim(p_bank_reference),'') = '' then
    raise exception 'bank_reference_required';
  end if;

  if exists (
    select 1
    from public.organization_bank_payment_confirmations c
    where c.bank_transaction_reference = trim(p_bank_reference)
  ) then
    return jsonb_build_object(
      'processed', false,
      'reason', 'duplicate_bank_reference'
    );
  end if;

  select o.id
  into v_org_id
  from public.organizations o
  where o.payment_variable_symbol = p_variable_symbol;

  if not found then
    return jsonb_build_object(
      'processed', false,
      'reason', 'organization_not_found'
    );
  end if;

  select count(*)
  into v_count
  from public.organization_orders oo
  where oo.organization_id = v_org_id
    and oo.payment_method = 'invoice'
    and oo.invoice_number is not null
    and oo.status in ('ordered','awaiting_payment')
    and oo.amount_minor = p_amount_minor
    and oo.currency = lower(p_currency);

  if v_count = 0 then
    return jsonb_build_object(
      'processed', false,
      'reason', 'invoice_not_found'
    );
  end if;

  if v_count > 1 then
    raise exception 'ambiguous_bank_payment_match';
  end if;

  select oo.id
  into v_order_id
  from public.organization_orders oo
  where oo.organization_id = v_org_id
    and oo.payment_method = 'invoice'
    and oo.invoice_number is not null
    and oo.status in ('ordered','awaiting_payment')
    and oo.amount_minor = p_amount_minor
    and oo.currency = lower(p_currency)
  limit 1;

  return private.activate_organization_bank_invoice(
    v_order_id,
    'bank_match',
    null,
    trim(p_bank_reference),
    coalesce(p_received_at, now())
  );
end;
$$;

revoke all on function public.issue_organization_bank_invoice(uuid,jsonb,date)
  from public, anon, authenticated;
grant execute on function public.issue_organization_bank_invoice(uuid,jsonb,date)
  to service_role;

revoke all on function private.activate_organization_bank_invoice(uuid,text,uuid,text,timestamptz)
  from public, anon, authenticated;

revoke all on function public.confirm_organization_bank_payment_manual(uuid,uuid)
  from public, anon, authenticated;
grant execute on function public.confirm_organization_bank_payment_manual(uuid,uuid)
  to service_role;

revoke all on function public.match_organization_bank_payment(text,integer,text,text,timestamptz)
  from public, anon, authenticated;
grant execute on function public.match_organization_bank_payment(text,integer,text,text,timestamptz)
  to service_role;
