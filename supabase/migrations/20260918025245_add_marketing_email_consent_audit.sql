alter table public.profiles
  add column if not exists marketing_email_consent boolean not null default false,
  add column if not exists marketing_email_consent_at timestamptz,
  add column if not exists marketing_email_consent_version text,
  add column if not exists marketing_email_consent_withdrawn_at timestamptz;

comment on column public.profiles.marketing_email_consent is
  'Current voluntary consent to Syllonaut marketing email. Not an authorization signal.';
comment on column public.profiles.marketing_email_consent_at is
  'Server timestamp when the current signup marketing consent was recorded.';
comment on column public.profiles.marketing_email_consent_version is
  'Version of the marketing consent wording accepted by the user.';
comment on column public.profiles.marketing_email_consent_withdrawn_at is
  'Server timestamp of a later consent withdrawal when applicable.';

create or replace function private.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare
  wants_marketing boolean :=
    lower(coalesce(new.raw_user_meta_data ->> 'marketing_email_consent', 'false')) = 'true';
begin
  insert into public.profiles (
    id,
    marketing_email_consent,
    marketing_email_consent_at,
    marketing_email_consent_version
  )
  values (
    new.id,
    wants_marketing,
    case when wants_marketing then now() else null end,
    case when wants_marketing then '2026-09-18-v1' else null end
  );

  return new;
end;
$function$;
