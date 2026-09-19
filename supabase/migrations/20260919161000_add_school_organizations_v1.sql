alter table public.billing_plans
  drop constraint if exists billing_plans_audience_check;

alter table public.billing_plans
  add constraint billing_plans_audience_check
  check (audience in ('individual', 'organization', 'internal'));

alter table public.billing_plans
  add column if not exists seat_limit integer
  check (seat_limit is null or seat_limit > 0);

insert into public.billing_plans (
  code, audience, name, purchasable, access_rank,
  monthly_lesson_limit, monthly_revision_limit,
  ai_grading_enabled, lesson_folders_enabled,
  multilingual_lessons_enabled, worksheet_export_enabled, seat_limit
) values
  ('team', 'organization', 'Team', false, 30, 200, 800, false, false, true, false, 10),
  ('school', 'organization', 'School', false, 40, 600, 2400, true, true, true, true, 30),
  ('campus', 'organization', 'Campus', false, 50, 2000, 8000, true, true, true, true, 100)
on conflict (code) do update set
  audience = excluded.audience,
  name = excluded.name,
  purchasable = false,
  access_rank = excluded.access_rank,
  monthly_lesson_limit = excluded.monthly_lesson_limit,
  monthly_revision_limit = excluded.monthly_revision_limit,
  ai_grading_enabled = excluded.ai_grading_enabled,
  lesson_folders_enabled = excluded.lesson_folders_enabled,
  multilingual_lessons_enabled = excluded.multilingual_lessons_enabled,
  worksheet_export_enabled = excluded.worksheet_export_enabled,
  seat_limit = excluded.seat_limit,
  updated_at = now();

create table public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(trim(name)) between 2 and 160),
  legal_name text check (legal_name is null or char_length(trim(legal_name)) between 2 and 200),
  registration_number text check (registration_number is null or char_length(trim(registration_number)) <= 80),
  vat_id text check (vat_id is null or char_length(trim(vat_id)) <= 80),
  billing_email text not null check (char_length(trim(billing_email)) between 3 and 254),
  billing_country text not null check (billing_country ~ '^[A-Z]{2}$'),
  billing_address jsonb not null default '{}'::jsonb,
  billing_period text not null check (billing_period in ('monthly', 'annual')),
  currency text not null check (currency in ('czk', 'eur', 'usd')),
  plan_code text not null references public.billing_plans(code),
  status text not null default 'awaiting_payment'
    check (status in ('awaiting_payment', 'active', 'past_due', 'suspended', 'expired', 'cancelled')),
  owner_user_id uuid not null references auth.users(id) on delete restrict,
  current_period_start timestamptz,
  current_period_end timestamptz,
  activated_at timestamptz,
  suspended_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (
    current_period_start is null
    or current_period_end is null
    or current_period_end > current_period_start
  )
);

create index organizations_owner_idx on public.organizations (owner_user_id, created_at desc);
create index organizations_status_plan_idx on public.organizations (status, plan_code);

alter table public.organizations enable row level security;
revoke all on table public.organizations from public, anon, authenticated;

create table public.organization_memberships (
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check (role in ('owner', 'admin', 'teacher')),
  status text not null default 'active' check (status in ('active', 'revoked')),
  joined_at timestamptz not null default now(),
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (organization_id, user_id),
  check ((status = 'active' and revoked_at is null) or status = 'revoked')
);

create unique index organization_memberships_one_active_org_per_user_idx
  on public.organization_memberships (user_id)
  where status = 'active';

create unique index organization_memberships_one_active_owner_idx
  on public.organization_memberships (organization_id)
  where role = 'owner' and status = 'active';

create index organization_memberships_org_status_idx
  on public.organization_memberships (organization_id, status, role);

alter table public.organization_memberships enable row level security;
revoke all on table public.organization_memberships from public, anon, authenticated;

create table public.organization_invitations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  email_normalized text not null check (email_normalized = lower(trim(email_normalized))),
  role text not null check (role in ('admin', 'teacher')),
  locale text not null default 'cs' check (locale in ('cs', 'en')),
  token_hash text not null unique check (token_hash ~ '^[0-9a-f]{64}$'),
  status text not null default 'pending'
    check (status in ('pending', 'accepted', 'revoked', 'expired')),
  created_by uuid not null references auth.users(id) on delete restrict,
  accepted_by uuid references auth.users(id) on delete set null,
  accepted_at timestamptz,
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (expires_at > created_at),
  check ((status = 'accepted' and accepted_by is not null and accepted_at is not null) or status <> 'accepted')
);

create unique index organization_invitations_one_pending_email_idx
  on public.organization_invitations (organization_id, email_normalized)
  where status = 'pending';

create index organization_invitations_org_status_idx
  on public.organization_invitations (organization_id, status, expires_at);

alter table public.organization_invitations enable row level security;
revoke all on table public.organization_invitations from public, anon, authenticated;

create table public.organization_orders (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  plan_code text not null references public.billing_plans(code),
  billing_period text not null check (billing_period in ('monthly', 'annual')),
  currency text not null check (currency in ('czk', 'eur', 'usd')),
  amount_minor integer not null check (amount_minor >= 0),
  payment_method text not null check (payment_method in ('card', 'invoice')),
  status text not null default 'awaiting_payment'
    check (status in ('draft', 'ordered', 'awaiting_payment', 'paid', 'cancelled', 'expired')),
  billing_snapshot jsonb not null default '{}'::jsonb,
  external_customer_id text,
  external_checkout_session_id text,
  external_invoice_id text,
  paid_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index organization_orders_org_created_idx
  on public.organization_orders (organization_id, created_at desc);
create index organization_orders_status_idx
  on public.organization_orders (status, created_at desc);

alter table public.organization_orders enable row level security;
revoke all on table public.organization_orders from public, anon, authenticated;

alter table public.generation_requests
  add column if not exists organization_id uuid
  references public.organizations(id) on delete set null;

create index if not exists generation_requests_org_action_month_idx
  on public.generation_requests (organization_id, action, created_at desc)
  where organization_id is not null and status in ('pending', 'succeeded');

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
  where om.user_id = p_user_id
    and om.status = 'active'
    and o.status = 'active'
    and bp.audience = 'organization'
  order by bp.access_rank desc, o.created_at asc
  limit 1;
$$;

revoke all on function private.current_active_organization(uuid) from public, anon, authenticated;

create or replace function private.apply_profile_plan(p_user_id uuid, p_plan_code text)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_role text;
  v_plan public.billing_plans%rowtype;
  v_override public.manual_entitlement_overrides%rowtype;
  v_lesson_limit integer;
  v_revision_limit integer;
  v_ai_grading boolean;
  v_folders boolean;
  v_multilingual boolean;
  v_worksheet_export boolean;
  v_org_ai boolean := false;
  v_org_folders boolean := false;
  v_org_multilingual boolean := false;
  v_org_worksheet boolean := false;
  v_applied_plan text;
begin
  select p.role into v_role
  from public.profiles p
  where p.id = p_user_id
  for update;

  if not found then
    raise exception 'profile_not_found' using errcode = 'P0001';
  end if;

  if v_role = 'admin' then
    update public.profiles
    set active_plan_code = 'admin',
        monthly_lesson_limit = null,
        monthly_revision_limit = null,
        ai_grading_enabled = true,
        lesson_folders_enabled = true,
        multilingual_lessons_enabled = true,
        worksheet_export_enabled = true,
        updated_at = now()
    where id = p_user_id;
    return 'admin';
  end if;

  select * into v_plan
  from public.billing_plans
  where code = p_plan_code and audience = 'individual';

  if not found then
    raise exception 'invalid_individual_plan' using errcode = 'P0001';
  end if;

  select
    coalesce(bool_or(bp.ai_grading_enabled), false),
    coalesce(bool_or(bp.lesson_folders_enabled), false),
    coalesce(bool_or(bp.multilingual_lessons_enabled), false),
    coalesce(bool_or(bp.worksheet_export_enabled), false)
  into v_org_ai, v_org_folders, v_org_multilingual, v_org_worksheet
  from public.organization_memberships om
  join public.organizations o on o.id = om.organization_id
  join public.billing_plans bp on bp.code = o.plan_code
  where om.user_id = p_user_id
    and om.status = 'active'
    and o.status = 'active'
    and bp.audience = 'organization';

  v_lesson_limit := v_plan.monthly_lesson_limit;
  v_revision_limit := v_plan.monthly_revision_limit;
  v_ai_grading := v_plan.ai_grading_enabled or v_org_ai;
  v_folders := v_plan.lesson_folders_enabled or v_org_folders;
  v_multilingual := v_plan.multilingual_lessons_enabled or v_org_multilingual;
  v_worksheet_export := v_plan.worksheet_export_enabled or v_org_worksheet;

  select * into v_override
  from public.manual_entitlement_overrides
  where user_id = p_user_id;

  if found then
    if v_override.lesson_limit_override then v_lesson_limit := v_override.monthly_lesson_limit; end if;
    if v_override.revision_limit_override then v_revision_limit := v_override.monthly_revision_limit; end if;
    if v_override.ai_grading_enabled is not null then v_ai_grading := v_override.ai_grading_enabled; end if;
    if v_override.lesson_folders_enabled is not null then v_folders := v_override.lesson_folders_enabled; end if;
    if v_override.multilingual_lessons_enabled is not null then v_multilingual := v_override.multilingual_lessons_enabled; end if;
    if v_override.worksheet_export_enabled is not null then v_worksheet_export := v_override.worksheet_export_enabled; end if;
  end if;

  v_applied_plan := v_plan.code;

  update public.profiles
  set active_plan_code = v_applied_plan,
      monthly_lesson_limit = v_lesson_limit,
      monthly_revision_limit = v_revision_limit,
      ai_grading_enabled = v_ai_grading,
      lesson_folders_enabled = v_folders,
      multilingual_lessons_enabled = v_multilingual,
      worksheet_export_enabled = v_worksheet_export,
      updated_at = now()
  where id = p_user_id;

  return v_applied_plan;
end;
$$;

revoke all on function private.apply_profile_plan(uuid, text) from public, anon, authenticated;

create or replace function private.recompute_current_profile_entitlements(p_user_id uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_plan text;
begin
  select case when p.role = 'admin' then 'free' else p.active_plan_code end
  into v_plan
  from public.profiles p
  where p.id = p_user_id;

  if not found then return null; end if;
  return private.apply_profile_plan(p_user_id, v_plan);
end;
$$;

revoke all on function private.recompute_current_profile_entitlements(uuid) from public, anon, authenticated;

create or replace function private.organization_membership_entitlement_trigger()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' then
    perform private.recompute_current_profile_entitlements(old.user_id);
    return old;
  end if;

  perform private.recompute_current_profile_entitlements(new.user_id);
  if tg_op = 'UPDATE' and old.user_id is distinct from new.user_id then
    perform private.recompute_current_profile_entitlements(old.user_id);
  end if;
  return new;
end;
$$;

revoke all on function private.organization_membership_entitlement_trigger() from public, anon, authenticated;

create trigger organization_memberships_recompute_entitlements
after insert or update or delete on public.organization_memberships
for each row execute function private.organization_membership_entitlement_trigger();

create or replace function private.organization_status_entitlement_trigger()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid;
begin
  if new.status is distinct from old.status or new.plan_code is distinct from old.plan_code then
    for v_user_id in
      select om.user_id
      from public.organization_memberships om
      where om.organization_id = new.id and om.status = 'active'
    loop
      perform private.recompute_current_profile_entitlements(v_user_id);
    end loop;
  end if;
  return new;
end;
$$;

revoke all on function private.organization_status_entitlement_trigger() from public, anon, authenticated;

create trigger organizations_recompute_entitlements
after update of status, plan_code on public.organizations
for each row execute function private.organization_status_entitlement_trigger();

create or replace function public.reserve_lesson_generation()
returns table(request_id uuid, allowed boolean, used integer, monthly_limit integer)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_org_id uuid;
  v_limit integer;
  v_used integer;
  v_request_id uuid;
  v_month_start timestamptz := date_trunc('month', now() at time zone 'UTC') at time zone 'UTC';
  v_month_end timestamptz := (date_trunc('month', now() at time zone 'UTC') + interval '1 month') at time zone 'UTC';
begin
  if v_user_id is null then raise exception 'not_authenticated'; end if;

  select cao.organization_id, cao.monthly_lesson_limit
  into v_org_id, v_limit
  from private.current_active_organization(v_user_id) cao;

  if v_org_id is not null then
    perform 1 from public.organizations o where o.id = v_org_id for update;

    update public.generation_requests
    set status = 'failed', completed_at = now()
    where organization_id = v_org_id and status = 'pending'
      and created_at < now() - interval '10 minutes';

    select count(*)::integer into v_used
    from public.generation_requests g
    where g.organization_id = v_org_id
      and g.action = 'generate_lesson'
      and g.status in ('pending', 'succeeded')
      and g.created_at >= v_month_start and g.created_at < v_month_end;
  else
    select p.monthly_lesson_limit into v_limit
    from public.profiles p where p.id = v_user_id for update;
    if not found then raise exception 'profile_not_found'; end if;

    update public.generation_requests
    set status = 'failed', completed_at = now()
    where user_id = v_user_id and organization_id is null and status = 'pending'
      and created_at < now() - interval '10 minutes';

    select count(*)::integer into v_used
    from public.generation_requests g
    where g.user_id = v_user_id and g.organization_id is null
      and g.action = 'generate_lesson'
      and g.status in ('pending', 'succeeded')
      and g.created_at >= v_month_start and g.created_at < v_month_end;
  end if;

  if v_limit is not null and v_used >= v_limit then
    return query select null::uuid, false, v_used, v_limit;
    return;
  end if;

  insert into public.generation_requests (user_id, organization_id, action, status)
  values (v_user_id, v_org_id, 'generate_lesson', 'pending')
  returning id into v_request_id;

  return query select v_request_id, true, v_used + 1, v_limit;
end;
$$;

revoke all on function public.reserve_lesson_generation() from public, anon;
grant execute on function public.reserve_lesson_generation() to authenticated;

create or replace function public.reserve_revision_operation(p_action text)
returns table(request_id uuid, allowed boolean, used integer, monthly_limit integer)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_org_id uuid;
  v_limit integer;
  v_used integer;
  v_request_id uuid;
  v_month_start timestamptz := date_trunc('month', now() at time zone 'UTC') at time zone 'UTC';
  v_month_end timestamptz := (date_trunc('month', now() at time zone 'UTC') + interval '1 month') at time zone 'UTC';
begin
  if v_user_id is null then raise exception 'not_authenticated'; end if;
  if p_action not in ('revise_lesson', 'revise_block') then raise exception 'invalid_revision_action'; end if;

  select cao.organization_id, cao.monthly_revision_limit
  into v_org_id, v_limit
  from private.current_active_organization(v_user_id) cao;

  if v_org_id is not null then
    perform 1 from public.organizations o where o.id = v_org_id for update;

    update public.generation_requests
    set status = 'failed', completed_at = now()
    where organization_id = v_org_id and status = 'pending'
      and created_at < now() - interval '10 minutes';

    select count(*)::integer into v_used
    from public.generation_requests g
    where g.organization_id = v_org_id
      and g.action in ('revise_lesson', 'revise_block')
      and g.status in ('pending', 'succeeded')
      and g.created_at >= v_month_start and g.created_at < v_month_end;
  else
    select p.monthly_revision_limit into v_limit
    from public.profiles p where p.id = v_user_id for update;
    if not found then raise exception 'profile_not_found'; end if;

    update public.generation_requests
    set status = 'failed', completed_at = now()
    where user_id = v_user_id and organization_id is null and status = 'pending'
      and created_at < now() - interval '10 minutes';

    select count(*)::integer into v_used
    from public.generation_requests g
    where g.user_id = v_user_id and g.organization_id is null
      and g.action in ('revise_lesson', 'revise_block')
      and g.status in ('pending', 'succeeded')
      and g.created_at >= v_month_start and g.created_at < v_month_end;
  end if;

  if v_limit is not null and v_used >= v_limit then
    return query select null::uuid, false, v_used, v_limit;
    return;
  end if;

  insert into public.generation_requests (user_id, organization_id, action, status)
  values (v_user_id, v_org_id, p_action, 'pending')
  returning id into v_request_id;

  return query select v_request_id, true, v_used + 1, v_limit;
end;
$$;

revoke all on function public.reserve_revision_operation(text) from public, anon;
grant execute on function public.reserve_revision_operation(text) to authenticated;

create or replace function public.get_ai_quota()
returns table(
  lesson_used integer,
  lesson_limit integer,
  lesson_remaining integer,
  revision_used integer,
  revision_limit integer,
  revision_remaining integer,
  lesson_unlimited boolean,
  revision_unlimited boolean
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_org_id uuid;
  v_lesson_limit integer;
  v_revision_limit integer;
  v_lesson_used integer;
  v_revision_used integer;
  v_month_start timestamptz := date_trunc('month', now() at time zone 'UTC') at time zone 'UTC';
  v_month_end timestamptz := (date_trunc('month', now() at time zone 'UTC') + interval '1 month') at time zone 'UTC';
begin
  if v_user_id is null then raise exception 'not_authenticated'; end if;

  select cao.organization_id, cao.monthly_lesson_limit, cao.monthly_revision_limit
  into v_org_id, v_lesson_limit, v_revision_limit
  from private.current_active_organization(v_user_id) cao;

  if v_org_id is not null then
    select count(*)::integer into v_lesson_used
    from public.generation_requests g
    where g.organization_id = v_org_id
      and g.action = 'generate_lesson'
      and g.status in ('pending', 'succeeded')
      and g.created_at >= v_month_start and g.created_at < v_month_end;

    select count(*)::integer into v_revision_used
    from public.generation_requests g
    where g.organization_id = v_org_id
      and g.action in ('revise_lesson', 'revise_block')
      and g.status in ('pending', 'succeeded')
      and g.created_at >= v_month_start and g.created_at < v_month_end;
  else
    select p.monthly_lesson_limit, p.monthly_revision_limit
    into v_lesson_limit, v_revision_limit
    from public.profiles p where p.id = v_user_id;
    if not found then raise exception 'profile_not_found'; end if;

    select count(*)::integer into v_lesson_used
    from public.generation_requests g
    where g.user_id = v_user_id and g.organization_id is null
      and g.action = 'generate_lesson'
      and g.status in ('pending', 'succeeded')
      and g.created_at >= v_month_start and g.created_at < v_month_end;

    select count(*)::integer into v_revision_used
    from public.generation_requests g
    where g.user_id = v_user_id and g.organization_id is null
      and g.action in ('revise_lesson', 'revise_block')
      and g.status in ('pending', 'succeeded')
      and g.created_at >= v_month_start and g.created_at < v_month_end;
  end if;

  return query select
    v_lesson_used,
    v_lesson_limit,
    case when v_lesson_limit is null then null else greatest(v_lesson_limit - v_lesson_used, 0) end,
    v_revision_used,
    v_revision_limit,
    case when v_revision_limit is null then null else greatest(v_revision_limit - v_revision_used, 0) end,
    v_lesson_limit is null,
    v_revision_limit is null;
end;
$$;

revoke all on function public.get_ai_quota() from public, anon;
grant execute on function public.get_ai_quota() to authenticated;

create or replace function public.create_organization_order(
  p_owner_user_id uuid,
  p_name text,
  p_legal_name text,
  p_registration_number text,
  p_vat_id text,
  p_billing_email text,
  p_billing_country text,
  p_billing_address jsonb,
  p_plan_code text,
  p_billing_period text,
  p_currency text,
  p_amount_minor integer,
  p_payment_method text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_plan public.billing_plans%rowtype;
  v_org_id uuid;
  v_order_id uuid;
begin
  select * into v_plan from public.billing_plans
  where code = p_plan_code and audience = 'organization';
  if not found then raise exception 'invalid_organization_plan'; end if;

  if p_billing_period not in ('monthly', 'annual') then raise exception 'invalid_billing_period'; end if;
  if p_currency not in ('czk', 'eur', 'usd') then raise exception 'invalid_currency'; end if;
  if p_payment_method not in ('card', 'invoice') then raise exception 'invalid_payment_method'; end if;
  if p_amount_minor < 0 then raise exception 'invalid_amount'; end if;

  if exists (
    select 1 from public.organization_memberships om
    where om.user_id = p_owner_user_id and om.status = 'active'
  ) then
    raise exception 'active_organization_membership_exists';
  end if;

  insert into public.organizations (
    name, legal_name, registration_number, vat_id, billing_email, billing_country,
    billing_address, billing_period, currency, plan_code, status, owner_user_id
  ) values (
    trim(p_name), nullif(trim(p_legal_name), ''), nullif(trim(p_registration_number), ''),
    nullif(trim(p_vat_id), ''), lower(trim(p_billing_email)), upper(p_billing_country),
    coalesce(p_billing_address, '{}'::jsonb), p_billing_period, p_currency, p_plan_code,
    'awaiting_payment', p_owner_user_id
  ) returning id into v_org_id;

  insert into public.organization_memberships (organization_id, user_id, role, status)
  values (v_org_id, p_owner_user_id, 'owner', 'active');

  insert into public.organization_orders (
    organization_id, plan_code, billing_period, currency, amount_minor,
    payment_method, status, billing_snapshot
  ) values (
    v_org_id, p_plan_code, p_billing_period, p_currency, p_amount_minor,
    p_payment_method, 'awaiting_payment',
    jsonb_build_object(
      'name', trim(p_name),
      'legalName', nullif(trim(p_legal_name), ''),
      'registrationNumber', nullif(trim(p_registration_number), ''),
      'vatId', nullif(trim(p_vat_id), ''),
      'billingEmail', lower(trim(p_billing_email)),
      'billingCountry', upper(p_billing_country),
      'billingAddress', coalesce(p_billing_address, '{}'::jsonb)
    )
  ) returning id into v_order_id;

  return jsonb_build_object('organizationId', v_org_id, 'orderId', v_order_id);
end;
$$;

revoke all on function public.create_organization_order(
  uuid, text, text, text, text, text, text, jsonb, text, text, text, integer, text
) from public, anon, authenticated;
grant execute on function public.create_organization_order(
  uuid, text, text, text, text, text, text, jsonb, text, text, text, integer, text
) to service_role;

create or replace function public.create_organization_invitation(
  p_organization_id uuid,
  p_created_by uuid,
  p_email_normalized text,
  p_role text,
  p_locale text,
  p_token_hash text,
  p_expires_at timestamptz
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_seat_limit integer;
  v_active_count integer;
  v_pending_count integer;
  v_invite_id uuid;
begin
  if p_role not in ('admin', 'teacher') then raise exception 'invalid_invitation_role'; end if;
  if p_locale not in ('cs', 'en') then raise exception 'invalid_locale'; end if;

  if not exists (
    select 1 from public.organization_memberships om
    where om.organization_id = p_organization_id
      and om.user_id = p_created_by
      and om.status = 'active'
      and om.role in ('owner', 'admin')
  ) then raise exception 'organization_admin_required'; end if;

  select bp.seat_limit into v_seat_limit
  from public.organizations o
  join public.billing_plans bp on bp.code = o.plan_code
  where o.id = p_organization_id
  for update of o;

  if not found or v_seat_limit is null then raise exception 'organization_plan_invalid'; end if;

  update public.organization_invitations
  set status = 'expired', updated_at = now()
  where organization_id = p_organization_id
    and status = 'pending' and expires_at <= now();

  select count(*)::integer into v_active_count
  from public.organization_memberships
  where organization_id = p_organization_id and status = 'active';

  select count(*)::integer into v_pending_count
  from public.organization_invitations
  where organization_id = p_organization_id and status = 'pending';

  if v_active_count + v_pending_count >= v_seat_limit then
    raise exception 'organization_seat_limit_reached';
  end if;

  insert into public.organization_invitations (
    organization_id, email_normalized, role, locale, token_hash, created_by, expires_at
  ) values (
    p_organization_id, lower(trim(p_email_normalized)), p_role, p_locale,
    p_token_hash, p_created_by, p_expires_at
  ) returning id into v_invite_id;

  return v_invite_id;
end;
$$;

revoke all on function public.create_organization_invitation(
  uuid, uuid, text, text, text, text, timestamptz
) from public, anon, authenticated;
grant execute on function public.create_organization_invitation(
  uuid, uuid, text, text, text, text, timestamptz
) to service_role;

create or replace function public.accept_organization_invitation(
  p_user_id uuid,
  p_email_normalized text,
  p_token_hash text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_invite public.organization_invitations%rowtype;
  v_seat_limit integer;
  v_active_count integer;
begin
  select * into v_invite
  from public.organization_invitations
  where token_hash = p_token_hash
  for update;

  if not found then raise exception 'invitation_not_found'; end if;
  if v_invite.status <> 'pending' then raise exception 'invitation_not_pending'; end if;

  if v_invite.expires_at <= now() then
    update public.organization_invitations
    set status = 'expired', updated_at = now()
    where id = v_invite.id;
    raise exception 'invitation_expired';
  end if;

  if v_invite.email_normalized <> lower(trim(p_email_normalized)) then
    raise exception 'invitation_email_mismatch';
  end if;

  if exists (
    select 1 from public.organization_memberships om
    where om.user_id = p_user_id and om.status = 'active'
      and om.organization_id <> v_invite.organization_id
  ) then raise exception 'active_organization_membership_exists'; end if;

  select bp.seat_limit into v_seat_limit
  from public.organizations o
  join public.billing_plans bp on bp.code = o.plan_code
  where o.id = v_invite.organization_id
  for update of o;

  select count(*)::integer into v_active_count
  from public.organization_memberships
  where organization_id = v_invite.organization_id and status = 'active';

  if v_seat_limit is null or v_active_count >= v_seat_limit then
    raise exception 'organization_seat_limit_reached';
  end if;

  insert into public.organization_memberships (
    organization_id, user_id, role, status, revoked_at
  ) values (
    v_invite.organization_id, p_user_id, v_invite.role, 'active', null
  )
  on conflict (organization_id, user_id)
  do update set
    role = excluded.role,
    status = 'active',
    revoked_at = null,
    joined_at = now(),
    updated_at = now();

  update public.organization_invitations
  set status = 'accepted', accepted_by = p_user_id,
      accepted_at = now(), updated_at = now()
  where id = v_invite.id;

  return jsonb_build_object(
    'organizationId', v_invite.organization_id,
    'role', v_invite.role
  );
end;
$$;

revoke all on function public.accept_organization_invitation(uuid, text, text)
  from public, anon, authenticated;
grant execute on function public.accept_organization_invitation(uuid, text, text)
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
begin
  if p_period_end <= p_period_start then raise exception 'invalid_period'; end if;

  update public.organization_orders
  set status = 'paid', paid_at = now(), updated_at = now()
  where id = p_order_id and organization_id = p_organization_id
    and status in ('ordered', 'awaiting_payment');

  if not found then raise exception 'organization_order_not_payable'; end if;

  update public.organizations
  set status = 'active',
      current_period_start = p_period_start,
      current_period_end = p_period_end,
      activated_at = coalesce(activated_at, now()),
      suspended_at = null,
      updated_at = now()
  where id = p_organization_id;
end;
$$;

revoke all on function public.activate_organization_order(uuid, uuid, timestamptz, timestamptz)
  from public, anon, authenticated;
grant execute on function public.activate_organization_order(uuid, uuid, timestamptz, timestamptz)
  to service_role;

comment on table public.organizations is
  'Syllonaut school/team organization. Paid entitlements are granted only while status=active.';
comment on table public.organization_memberships is
  'Organization membership and role. V1 intentionally permits one active organization per user.';
comment on table public.organization_orders is
  'School-plan order ledger. awaiting_payment never grants paid organization entitlements.';
comment on column public.generation_requests.organization_id is
  'Organization whose shared monthly AI pool funded this request. Null means personal quota.';
