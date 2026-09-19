alter table public.organizations
  add column if not exists is_internal_test boolean not null default false;

create unique index if not exists organizations_one_internal_test_per_owner_idx
  on public.organizations (owner_user_id)
  where is_internal_test;

create or replace function private.enforce_internal_test_organization()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_role text;
begin
  if tg_op = 'UPDATE' and old.is_internal_test then
    if new.is_internal_test is distinct from old.is_internal_test then
      raise exception 'internal_test_flag_is_immutable' using errcode = '23514';
    end if;
    if new.owner_user_id is distinct from old.owner_user_id then
      raise exception 'internal_test_owner_is_locked' using errcode = '23514';
    end if;
  end if;

  if new.is_internal_test then
    select p.role into v_role
    from public.profiles p
    where p.id = new.owner_user_id;

    if v_role is distinct from 'admin' then
      raise exception 'internal_test_owner_must_be_app_admin' using errcode = '23514';
    end if;
  end if;

  return new;
end;
$$;

revoke all on function private.enforce_internal_test_organization()
  from public, anon, authenticated;

drop trigger if exists enforce_internal_test_organization on public.organizations;
create trigger enforce_internal_test_organization
before insert or update of owner_user_id, is_internal_test
on public.organizations
for each row
execute function private.enforce_internal_test_organization();

do $internal_test_school$
declare
  v_admin_count integer;
  v_admin_user_id uuid;
  v_admin_email text;
  v_existing_membership_org_id uuid;
  v_test_org_id uuid;
begin
  select count(*)::integer
  into v_admin_count
  from public.profiles p
  where p.role = 'admin';

  if v_admin_count = 0 then
    raise notice 'No app admin profile exists; Testovací škola seed skipped.';
    return;
  end if;

  if v_admin_count <> 1 then
    raise exception 'internal_test_school_requires_exactly_one_app_admin';
  end if;

  select p.id, u.email
  into v_admin_user_id, v_admin_email
  from public.profiles p
  join auth.users u on u.id = p.id
  where p.role = 'admin'
  limit 1;

  select om.organization_id
  into v_existing_membership_org_id
  from public.organization_memberships om
  where om.user_id = v_admin_user_id
    and om.status = 'active'
  limit 1;

  if v_existing_membership_org_id is not null then
    select o.id
    into v_test_org_id
    from public.organizations o
    where o.id = v_existing_membership_org_id
      and o.is_internal_test;

    if v_test_org_id is null then
      raise exception 'app_admin_already_has_active_non_test_organization';
    end if;
  end if;

  if v_test_org_id is null then
    select o.id
    into v_test_org_id
    from public.organizations o
    where o.owner_user_id = v_admin_user_id
      and o.is_internal_test
    limit 1;
  end if;

  if v_test_org_id is null then
    insert into public.organizations (
      name,
      legal_name,
      billing_email,
      billing_country,
      billing_address,
      billing_period,
      currency,
      plan_code,
      status,
      owner_user_id,
      current_period_start,
      current_period_end,
      activated_at,
      suspended_at,
      cancel_at_period_end,
      renewal_mode,
      past_due_at,
      is_internal_test
    )
    values (
      'Testovací škola',
      null,
      coalesce(v_admin_email, 'internal-test@syllonaut.local'),
      'CZ',
      '{}'::jsonb,
      'annual',
      'czk',
      'campus',
      'active',
      v_admin_user_id,
      null,
      null,
      now(),
      null,
      false,
      'manual_invoice',
      null,
      true
    )
    returning id into v_test_org_id;
  else
    update public.organizations
    set name = 'Testovací škola',
        plan_code = 'campus',
        status = 'active',
        current_period_start = null,
        current_period_end = null,
        suspended_at = null,
        past_due_at = null,
        cancel_at_period_end = false,
        renewal_mode = 'manual_invoice',
        updated_at = now()
    where id = v_test_org_id;
  end if;

  insert into public.organization_memberships (
    organization_id,
    user_id,
    role,
    status,
    joined_at,
    revoked_at,
    created_at,
    updated_at
  )
  values (
    v_test_org_id,
    v_admin_user_id,
    'owner',
    'active',
    now(),
    null,
    now(),
    now()
  )
  on conflict (organization_id, user_id)
  do update set
    role = 'owner',
    status = 'active',
    revoked_at = null,
    updated_at = now();
end;
$internal_test_school$;

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
  if v_org.is_internal_test then raise exception 'internal_test_organization_not_billable'; end if;

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

create or replace function public.transfer_organization_ownership(
  p_organization_id uuid,
  p_current_owner uuid,
  p_new_owner uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if exists (
    select 1
    from public.organizations o
    where o.id = p_organization_id
      and o.is_internal_test
  ) then
    raise exception 'internal_test_owner_is_locked';
  end if;

  if p_current_owner = p_new_owner then
    raise exception 'new_owner_must_differ';
  end if;

  if not exists (
    select 1
    from public.organization_memberships om
    where om.organization_id = p_organization_id
      and om.user_id = p_current_owner
      and om.status = 'active'
      and om.role = 'owner'
  ) then
    raise exception 'current_owner_required';
  end if;

  if not exists (
    select 1
    from public.organization_memberships om
    where om.organization_id = p_organization_id
      and om.user_id = p_new_owner
      and om.status = 'active'
      and om.role in ('admin', 'teacher')
  ) then
    raise exception 'new_owner_must_be_active_member';
  end if;

  update public.organization_memberships
  set role = 'admin',
      updated_at = now()
  where organization_id = p_organization_id
    and user_id = p_current_owner
    and status = 'active';

  update public.organization_memberships
  set role = 'owner',
      updated_at = now()
  where organization_id = p_organization_id
    and user_id = p_new_owner
    and status = 'active';

  update public.organizations
  set owner_user_id = p_new_owner,
      updated_at = now()
  where id = p_organization_id;

  if not found then
    raise exception 'organization_not_found';
  end if;
end;
$$;

revoke all on function public.transfer_organization_ownership(uuid, uuid, uuid)
  from public, anon, authenticated;
grant execute on function public.transfer_organization_ownership(uuid, uuid, uuid)
  to service_role;

comment on column public.organizations.is_internal_test is
  'Internal non-billable test tenant. Owner must be an app admin; ownership is locked.';
