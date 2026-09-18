alter table public.profiles
  add column if not exists marketing_email_consent boolean not null default false,
  add column if not exists marketing_email_consent_at timestamptz,
  add column if not exists marketing_email_consent_version text,
  add column if not exists marketing_email_consent_revoked_at timestamptz;

create table if not exists private.marketing_consent_events (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  granted boolean not null,
  consent_version text,
  source text not null check (source in ('signup', 'settings')),
  created_at timestamptz not null default now()
);

revoke all on table private.marketing_consent_events from public, anon, authenticated;

create or replace function private.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare
  requested_marketing_consent boolean := lower(coalesce(new.raw_user_meta_data ->> 'marketing_email_consent', 'false')) = 'true';
  consent_version constant text := '2026-09-18-v1';
begin
  insert into public.profiles (
    id,
    marketing_email_consent,
    marketing_email_consent_at,
    marketing_email_consent_version
  )
  values (
    new.id,
    requested_marketing_consent,
    case when requested_marketing_consent then now() else null end,
    case when requested_marketing_consent then consent_version else null end
  );

  if requested_marketing_consent then
    insert into private.marketing_consent_events (user_id, granted, consent_version, source)
    values (new.id, true, consent_version, 'signup');
  end if;

  return new;
end;
$function$;

create or replace function public.set_marketing_email_consent(p_granted boolean)
returns table (
  marketing_email_consent boolean,
  marketing_email_consent_at timestamptz,
  marketing_email_consent_version text,
  marketing_email_consent_revoked_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $function$
declare
  caller_id uuid := auth.uid();
  consent_version constant text := '2026-09-18-v1';
  effective_version text;
begin
  if caller_id is null then
    raise exception 'authentication required';
  end if;

  update public.profiles
  set
    marketing_email_consent = p_granted,
    marketing_email_consent_at = case when p_granted then now() else marketing_email_consent_at end,
    marketing_email_consent_version = case when p_granted then consent_version else marketing_email_consent_version end,
    marketing_email_consent_revoked_at = case when p_granted then null else now() end,
    updated_at = now()
  where id = caller_id
  returning profiles.marketing_email_consent_version
  into effective_version;

  if not found then
    raise exception 'profile not found';
  end if;

  insert into private.marketing_consent_events (user_id, granted, consent_version, source)
  values (caller_id, p_granted, coalesce(effective_version, consent_version), 'settings');

  return query
  select
    p.marketing_email_consent,
    p.marketing_email_consent_at,
    p.marketing_email_consent_version,
    p.marketing_email_consent_revoked_at
  from public.profiles p
  where p.id = caller_id;
end;
$function$;

revoke all on function public.set_marketing_email_consent(boolean) from public, anon;
grant execute on function public.set_marketing_email_consent(boolean) to authenticated;

comment on column public.profiles.marketing_email_consent is
  'Current opt-in state for Syllonaut marketing emails such as product offers, news and case studies.';
comment on column public.profiles.marketing_email_consent_version is
  'Version of the marketing consent wording last accepted by the user.';
comment on function public.set_marketing_email_consent(boolean) is
  'Authenticated self-service marketing-email consent update with server-side timestamps and audit event.';
