create table public.billing_plans (
  code text primary key,
  audience text not null check (audience in ('individual', 'internal')),
  name text not null,
  purchasable boolean not null default false,
  access_rank integer not null default 0 check (access_rank >= 0),
  monthly_lesson_limit integer check (monthly_lesson_limit is null or monthly_lesson_limit >= 0),
  monthly_revision_limit integer check (monthly_revision_limit is null or monthly_revision_limit >= 0),
  ai_grading_enabled boolean not null default false,
  lesson_folders_enabled boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

insert into public.billing_plans (
  code, audience, name, purchasable, access_rank,
  monthly_lesson_limit, monthly_revision_limit,
  ai_grading_enabled, lesson_folders_enabled
) values
  ('free', 'individual', 'Free', false, 0, 5, 20, false, false),
  ('teacher', 'individual', 'Teacher', true, 10, 25, 100, false, false),
  ('teacher_pro', 'individual', 'Teacher Pro', true, 20, 60, 250, true, true),
  ('admin', 'internal', 'Admin', false, 100, null, null, true, true);

alter table public.billing_plans enable row level security;
revoke all on table public.billing_plans from public, anon, authenticated;

alter table public.profiles
  add column active_plan_code text not null default 'free';

update public.profiles
set active_plan_code = 'admin',
    updated_at = now()
where role = 'admin';

alter table public.profiles
  add constraint profiles_active_plan_code_fkey
  foreign key (active_plan_code)
  references public.billing_plans(code);

comment on column public.profiles.active_plan_code is
  'Base access plan currently applied to the profile. Manual entitlement overrides can further adjust effective limits/features.';

create table public.manual_entitlement_overrides (
  user_id uuid primary key references auth.users(id) on delete cascade,
  lesson_limit_override boolean not null default false,
  monthly_lesson_limit integer check (monthly_lesson_limit is null or monthly_lesson_limit >= 0),
  revision_limit_override boolean not null default false,
  monthly_revision_limit integer check (monthly_revision_limit is null or monthly_revision_limit >= 0),
  ai_grading_enabled boolean,
  lesson_folders_enabled boolean,
  note text check (note is null or char_length(note) <= 500),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (lesson_limit_override or monthly_lesson_limit is null),
  check (revision_limit_override or monthly_revision_limit is null)
);

insert into public.manual_entitlement_overrides (
  user_id,
  lesson_limit_override,
  monthly_lesson_limit,
  revision_limit_override,
  monthly_revision_limit,
  ai_grading_enabled,
  lesson_folders_enabled,
  note
)
select
  p.id,
  p.monthly_lesson_limit is distinct from 5,
  case when p.monthly_lesson_limit is distinct from 5 then p.monthly_lesson_limit else null end,
  p.monthly_revision_limit is distinct from 20,
  case when p.monthly_revision_limit is distinct from 20 then p.monthly_revision_limit else null end,
  case when p.ai_grading_enabled is distinct from false then p.ai_grading_enabled else null end,
  case when p.lesson_folders_enabled is distinct from false then p.lesson_folders_enabled else null end,
  'Migrated existing non-default entitlement state'
from public.profiles p
where p.role <> 'admin'
  and (
    p.monthly_lesson_limit is distinct from 5
    or p.monthly_revision_limit is distinct from 20
    or p.ai_grading_enabled is distinct from false
    or p.lesson_folders_enabled is distinct from false
  );

alter table public.manual_entitlement_overrides enable row level security;
revoke all on table public.manual_entitlement_overrides from public, anon, authenticated;

create table public.billing_prices (
  provider text not null check (provider = 'stripe'),
  livemode boolean not null,
  external_price_id text not null check (char_length(external_price_id) between 5 and 255),
  plan_code text not null references public.billing_plans(code),
  billing_period text not null check (billing_period in ('monthly', 'annual')),
  currency text not null check (currency in ('czk', 'eur', 'usd')),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (provider, livemode, external_price_id),
  unique (provider, livemode, plan_code, billing_period, currency)
);

alter table public.billing_prices enable row level security;
revoke all on table public.billing_prices from public, anon, authenticated;

insert into public.billing_prices (
  provider, livemode, external_price_id, plan_code, billing_period, currency
) values
  ('stripe', false, 'price_1UH3ouAgkxhGI3t1MY5EufRe', 'teacher', 'monthly', 'czk'),
  ('stripe', false, 'price_1UH3pBAgkxhGI3t1UyMUxQH0', 'teacher', 'annual', 'czk'),
  ('stripe', false, 'price_1UH3yHAgkxhGI3t1uAedPRXk', 'teacher', 'monthly', 'eur'),
  ('stripe', false, 'price_1UH3yJAgkxhGI3t1h8OteK07', 'teacher', 'annual', 'eur'),
  ('stripe', false, 'price_1UH3yMAgkxhGI3t1LMI5cvVJ', 'teacher', 'monthly', 'usd'),
  ('stripe', false, 'price_1UH3yOAgkxhGI3t1hAoJVKgD', 'teacher', 'annual', 'usd'),
  ('stripe', false, 'price_1UH42wAgkxhGI3t1FHREq9KF', 'teacher_pro', 'monthly', 'czk'),
  ('stripe', false, 'price_1UH42yAgkxhGI3t1hnCALgsq', 'teacher_pro', 'annual', 'czk'),
  ('stripe', false, 'price_1UH430AgkxhGI3t1FtwacXSp', 'teacher_pro', 'monthly', 'eur'),
  ('stripe', false, 'price_1UH432AgkxhGI3t1ELdH8Ovo', 'teacher_pro', 'annual', 'eur'),
  ('stripe', false, 'price_1UH434AgkxhGI3t1oVoZlVQA', 'teacher_pro', 'monthly', 'usd'),
  ('stripe', false, 'price_1UH437AgkxhGI3t1nZLCc297', 'teacher_pro', 'annual', 'usd');

create table public.billing_customers (
  user_id uuid not null references auth.users(id) on delete cascade,
  provider text not null check (provider = 'stripe'),
  livemode boolean not null,
  external_customer_id text not null check (char_length(external_customer_id) between 5 and 255),
  billing_country text check (billing_country is null or billing_country ~ '^[A-Z]{2}$'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, provider, livemode),
  unique (provider, livemode, external_customer_id)
);

alter table public.billing_customers enable row level security;
revoke all on table public.billing_customers from public, anon, authenticated;

create table public.billing_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  provider text not null check (provider = 'stripe'),
  livemode boolean not null,
  external_subscription_id text not null check (char_length(external_subscription_id) between 5 and 255),
  external_customer_id text not null check (char_length(external_customer_id) between 5 and 255),
  external_price_id text not null check (char_length(external_price_id) between 5 and 255),
  plan_code text not null references public.billing_plans(code),
  billing_period text not null check (billing_period in ('monthly', 'annual')),
  currency text not null check (currency in ('czk', 'eur', 'usd')),
  merchant_of_record boolean not null default false,
  status text not null check (status in (
    'trialing', 'active', 'past_due', 'unpaid', 'canceled',
    'incomplete', 'incomplete_expired', 'paused'
  )),
  cancel_at_period_end boolean not null default false,
  current_period_start timestamptz,
  current_period_end timestamptz,
  canceled_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (provider, livemode, external_subscription_id),
  foreign key (provider, livemode, external_price_id)
    references public.billing_prices(provider, livemode, external_price_id),
  check (
    current_period_start is null
    or current_period_end is null
    or current_period_end > current_period_start
  )
);

create index billing_subscriptions_user_live_status_idx
  on public.billing_subscriptions (user_id, livemode, status);

alter table public.billing_subscriptions enable row level security;
revoke all on table public.billing_subscriptions from public, anon, authenticated;

create table public.billing_events (
  provider text not null check (provider = 'stripe'),
  livemode boolean not null,
  external_event_id text not null check (char_length(external_event_id) between 5 and 255),
  event_type text not null check (char_length(event_type) between 1 and 120),
  user_id uuid not null references auth.users(id) on delete cascade,
  external_subscription_id text not null check (char_length(external_subscription_id) between 5 and 255),
  processed_at timestamptz not null default now(),
  primary key (provider, livemode, external_event_id)
);

create index billing_events_user_idx
  on public.billing_events (user_id, processed_at desc);

alter table public.billing_events enable row level security;
revoke all on table public.billing_events from public, anon, authenticated;

create or replace function private.apply_profile_plan(
  p_user_id uuid,
  p_plan_code text
)
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
  v_applied_plan text;
begin
  select p.role
  into v_role
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
        updated_at = now()
    where id = p_user_id;

    return 'admin';
  end if;

  select *
  into v_plan
  from public.billing_plans
  where code = p_plan_code
    and audience = 'individual';

  if not found then
    raise exception 'invalid_individual_plan' using errcode = 'P0001';
  end if;

  v_lesson_limit := v_plan.monthly_lesson_limit;
  v_revision_limit := v_plan.monthly_revision_limit;
  v_ai_grading := v_plan.ai_grading_enabled;
  v_folders := v_plan.lesson_folders_enabled;

  select *
  into v_override
  from public.manual_entitlement_overrides
  where user_id = p_user_id;

  if found then
    if v_override.lesson_limit_override then
      v_lesson_limit := v_override.monthly_lesson_limit;
    end if;

    if v_override.revision_limit_override then
      v_revision_limit := v_override.monthly_revision_limit;
    end if;

    if v_override.ai_grading_enabled is not null then
      v_ai_grading := v_override.ai_grading_enabled;
    end if;

    if v_override.lesson_folders_enabled is not null then
      v_folders := v_override.lesson_folders_enabled;
    end if;
  end if;

  v_applied_plan := v_plan.code;

  update public.profiles
  set active_plan_code = v_applied_plan,
      monthly_lesson_limit = v_lesson_limit,
      monthly_revision_limit = v_revision_limit,
      ai_grading_enabled = v_ai_grading,
      lesson_folders_enabled = v_folders,
      updated_at = now()
  where id = p_user_id;

  return v_applied_plan;
end;
$$;

revoke all on function private.apply_profile_plan(uuid, text) from public, anon, authenticated;

create or replace function private.effective_billing_plan(
  p_user_id uuid,
  p_livemode boolean
)
returns text
language sql
security definer
set search_path = ''
as $$
  select coalesce((
    select bp.code
    from public.billing_subscriptions bs
    join public.billing_plans bp on bp.code = bs.plan_code
    where bs.user_id = p_user_id
      and bs.livemode = p_livemode
      and bs.status in ('trialing', 'active', 'past_due')
      and bp.audience = 'individual'
    order by bp.access_rank desc, bs.updated_at desc
    limit 1
  ), 'free'::text);
$$;

revoke all on function private.effective_billing_plan(uuid, boolean) from public, anon, authenticated;

create or replace function private.recompute_live_billing_entitlements(
  p_user_id uuid
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_plan text;
begin
  v_plan := private.effective_billing_plan(p_user_id, true);
  return private.apply_profile_plan(p_user_id, v_plan);
end;
$$;

revoke all on function private.recompute_live_billing_entitlements(uuid) from public, anon, authenticated;

create or replace function public.sync_stripe_subscription_event(
  p_event_id text,
  p_event_type text,
  p_livemode boolean,
  p_user_id uuid,
  p_customer_id text,
  p_subscription_id text,
  p_price_id text,
  p_merchant_of_record boolean,
  p_status text,
  p_cancel_at_period_end boolean,
  p_current_period_start timestamptz,
  p_current_period_end timestamptz,
  p_canceled_at timestamptz,
  p_billing_country text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_price public.billing_prices%rowtype;
  v_existing_customer text;
  v_existing_subscription_user uuid;
  v_inserted integer := 0;
  v_effective_plan text;
  v_applied_plan text;
begin
  if auth.role() is distinct from 'service_role' then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  if p_event_id is null or p_event_id !~ '^evt_[A-Za-z0-9_]+$' then
    raise exception 'invalid_event_id' using errcode = '22023';
  end if;

  if p_event_type is null or char_length(p_event_type) not between 1 and 120 then
    raise exception 'invalid_event_type' using errcode = '22023';
  end if;

  if p_customer_id is null or p_customer_id !~ '^cus_[A-Za-z0-9_]+$' then
    raise exception 'invalid_customer_id' using errcode = '22023';
  end if;

  if p_subscription_id is null or p_subscription_id !~ '^sub_[A-Za-z0-9_]+$' then
    raise exception 'invalid_subscription_id' using errcode = '22023';
  end if;

  if p_price_id is null or p_price_id !~ '^price_[A-Za-z0-9_]+$' then
    raise exception 'invalid_price_id' using errcode = '22023';
  end if;

  if p_status not in (
    'trialing', 'active', 'past_due', 'unpaid', 'canceled',
    'incomplete', 'incomplete_expired', 'paused'
  ) then
    raise exception 'invalid_subscription_status' using errcode = '22023';
  end if;

  if p_billing_country is not null and upper(p_billing_country) !~ '^[A-Z]{2}$' then
    raise exception 'invalid_billing_country' using errcode = '22023';
  end if;

  if p_current_period_start is not null
     and p_current_period_end is not null
     and p_current_period_end <= p_current_period_start then
    raise exception 'invalid_billing_period' using errcode = '22023';
  end if;

  if not exists (select 1 from public.profiles where id = p_user_id) then
    raise exception 'profile_not_found' using errcode = 'P0001';
  end if;

  select *
  into v_price
  from public.billing_prices
  where provider = 'stripe'
    and livemode = p_livemode
    and external_price_id = p_price_id
    and active = true;

  if not found then
    raise exception 'unknown_billing_price' using errcode = 'P0001';
  end if;

  select bc.external_customer_id
  into v_existing_customer
  from public.billing_customers bc
  where bc.user_id = p_user_id
    and bc.provider = 'stripe'
    and bc.livemode = p_livemode
  for update;

  if found and v_existing_customer <> p_customer_id then
    raise exception 'billing_customer_mismatch' using errcode = 'P0001';
  end if;

  if exists (
    select 1
    from public.billing_customers bc
    where bc.provider = 'stripe'
      and bc.livemode = p_livemode
      and bc.external_customer_id = p_customer_id
      and bc.user_id <> p_user_id
  ) then
    raise exception 'billing_customer_user_mismatch' using errcode = 'P0001';
  end if;

  select bs.user_id
  into v_existing_subscription_user
  from public.billing_subscriptions bs
  where bs.provider = 'stripe'
    and bs.livemode = p_livemode
    and bs.external_subscription_id = p_subscription_id
  for update;

  if found and v_existing_subscription_user <> p_user_id then
    raise exception 'billing_subscription_user_mismatch' using errcode = 'P0001';
  end if;

  insert into public.billing_events (
    provider, livemode, external_event_id, event_type, user_id, external_subscription_id
  )
  values (
    'stripe', p_livemode, p_event_id, p_event_type, p_user_id, p_subscription_id
  )
  on conflict do nothing;

  get diagnostics v_inserted = row_count;

  if v_inserted = 0 then
    return jsonb_build_object(
      'processed', false,
      'reason', 'duplicate_event',
      'livemode', p_livemode
    );
  end if;

  insert into public.billing_customers (
    user_id, provider, livemode, external_customer_id, billing_country
  )
  values (
    p_user_id, 'stripe', p_livemode, p_customer_id, upper(p_billing_country)
  )
  on conflict (user_id, provider, livemode)
  do update set
    billing_country = coalesce(excluded.billing_country, public.billing_customers.billing_country),
    updated_at = now();

  insert into public.billing_subscriptions (
    user_id,
    provider,
    livemode,
    external_subscription_id,
    external_customer_id,
    external_price_id,
    plan_code,
    billing_period,
    currency,
    merchant_of_record,
    status,
    cancel_at_period_end,
    current_period_start,
    current_period_end,
    canceled_at
  )
  values (
    p_user_id,
    'stripe',
    p_livemode,
    p_subscription_id,
    p_customer_id,
    p_price_id,
    v_price.plan_code,
    v_price.billing_period,
    v_price.currency,
    p_merchant_of_record,
    p_status,
    p_cancel_at_period_end,
    p_current_period_start,
    p_current_period_end,
    p_canceled_at
  )
  on conflict (provider, livemode, external_subscription_id)
  do update set
    external_customer_id = excluded.external_customer_id,
    external_price_id = excluded.external_price_id,
    plan_code = excluded.plan_code,
    billing_period = excluded.billing_period,
    currency = excluded.currency,
    merchant_of_record = excluded.merchant_of_record,
    status = excluded.status,
    cancel_at_period_end = excluded.cancel_at_period_end,
    current_period_start = excluded.current_period_start,
    current_period_end = excluded.current_period_end,
    canceled_at = excluded.canceled_at,
    updated_at = now();

  v_effective_plan := private.effective_billing_plan(p_user_id, p_livemode);

  if p_livemode then
    v_applied_plan := private.recompute_live_billing_entitlements(p_user_id);
  else
    v_applied_plan := null;
  end if;

  return jsonb_build_object(
    'processed', true,
    'livemode', p_livemode,
    'effective_plan', v_effective_plan,
    'entitlements_applied', p_livemode,
    'applied_plan', v_applied_plan
  );
end;
$$;

revoke all on function public.sync_stripe_subscription_event(
  text, text, boolean, uuid, text, text, text, boolean, text, boolean,
  timestamptz, timestamptz, timestamptz, text
) from public, anon, authenticated;

grant execute on function public.sync_stripe_subscription_event(
  text, text, boolean, uuid, text, text, text, boolean, text, boolean,
  timestamptz, timestamptz, timestamptz, text
) to service_role;

comment on function public.sync_stripe_subscription_event(
  text, text, boolean, uuid, text, text, text, boolean, text, boolean,
  timestamptz, timestamptz, timestamptz, text
) is
  'Service-role-only atomic Stripe subscription sync. Sandbox events are stored but never change production profile entitlements.';
