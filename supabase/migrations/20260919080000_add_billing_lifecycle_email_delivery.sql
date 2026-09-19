alter table public.profiles
  add column if not exists ui_locale text;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'profiles_ui_locale_check'
      and conrelid = 'public.profiles'::regclass
  ) then
    alter table public.profiles
      add constraint profiles_ui_locale_check
      check (ui_locale is null or ui_locale in ('cs', 'en'));
  end if;
end;
$$;

comment on column public.profiles.ui_locale is
  'Last explicit Syllonaut UI locale used for transactional product communication. Null falls back to billing-country locale.';

create or replace function private.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare
  requested_marketing_consent boolean := lower(coalesce(new.raw_user_meta_data ->> 'marketing_email_consent', 'false')) = 'true';
  requested_ui_locale text := case lower(coalesce(new.raw_user_meta_data ->> 'ui_locale', ''))
    when 'cs' then 'cs'
    when 'en' then 'en'
    else null
  end;
  consent_version constant text := '2026-09-18-v1';
begin
  insert into public.profiles (
    id,
    marketing_email_consent,
    marketing_email_consent_at,
    marketing_email_consent_version,
    ui_locale
  )
  values (
    new.id,
    requested_marketing_consent,
    case when requested_marketing_consent then now() else null end,
    case when requested_marketing_consent then consent_version else null end,
    requested_ui_locale
  );

  if requested_marketing_consent then
    insert into private.marketing_consent_events (user_id, granted, consent_version, source)
    values (new.id, true, consent_version, 'signup');
  end if;

  return new;
end;
$function$;

create or replace function public.set_ui_locale(p_locale text)
returns text
language plpgsql
security definer
set search_path = ''
as $function$
declare
  caller_id uuid := auth.uid();
  normalized_locale text := lower(trim(coalesce(p_locale, '')));
begin
  if caller_id is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;

  if normalized_locale not in ('cs', 'en') then
    raise exception 'invalid ui locale' using errcode = '22023';
  end if;

  update public.profiles
  set ui_locale = normalized_locale,
      updated_at = now()
  where id = caller_id;

  if not found then
    raise exception 'profile not found' using errcode = 'P0001';
  end if;

  return normalized_locale;
end;
$function$;

revoke all on function public.set_ui_locale(text) from public, anon;
grant execute on function public.set_ui_locale(text) to authenticated;

update public.profiles p
set ui_locale = case
  when upper(bc.billing_country) in ('CZ', 'SK') then 'cs'
  else 'en'
end,
updated_at = now()
from public.billing_customers bc
where p.id = bc.user_id
  and bc.provider = 'stripe'
  and bc.livemode = true
  and bc.billing_country is not null
  and p.ui_locale is null;

create table if not exists public.billing_email_deliveries (
  provider text not null check (provider = 'stripe'),
  livemode boolean not null,
  external_event_id text not null check (char_length(external_event_id) between 5 and 255),
  notification_type text not null check (notification_type in (
    'subscription_activated',
    'cancellation_scheduled',
    'cancellation_revoked',
    'subscription_ended'
  )),
  user_id uuid not null references auth.users(id) on delete cascade,
  external_subscription_id text not null check (char_length(external_subscription_id) between 5 and 255),
  status text not null default 'pending' check (status in ('pending', 'sent')),
  attempt_count integer not null default 0 check (attempt_count >= 0),
  resend_email_id text,
  last_error_code text,
  sent_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (provider, livemode, external_event_id, notification_type)
);

create index if not exists billing_email_deliveries_pending_idx
  on public.billing_email_deliveries (status, created_at)
  where status = 'pending';

alter table public.billing_email_deliveries enable row level security;
revoke all on table public.billing_email_deliveries from public, anon, authenticated;

comment on table public.billing_email_deliveries is
  'Service-role-only audit and idempotency ledger for Syllonaut transactional billing lifecycle emails. Payment receipts, refunds and failed-payment emails remain Stripe-owned.';
