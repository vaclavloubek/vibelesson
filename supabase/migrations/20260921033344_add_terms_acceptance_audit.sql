create table private.terms_acceptance_events (
  id bigint generated always as identity primary key,
  user_id uuid not null,
  terms_version text not null,
  acceptance_key text not null,
  source text not null,
  accepted_at timestamptz not null default now(),
  constraint terms_acceptance_events_source_nonempty check (btrim(source) <> ''),
  constraint terms_acceptance_events_unique unique (user_id, acceptance_key, source)
);

comment on table private.terms_acceptance_events is
  'Append-only server audit of Terms acceptance. Deliberately no FK to auth.users so contractual evidence is not silently cascade-deleted with an account; retention is governed by the privacy notice.';
comment on column private.terms_acceptance_events.user_id is
  'Supabase Auth user UUID at the time the acceptance was recorded. No email or other direct identifier is duplicated here.';
comment on column private.terms_acceptance_events.accepted_at is
  'Server timestamp recorded by Postgres when the acceptance event is persisted.';

alter table private.terms_acceptance_events enable row level security;
revoke all on table private.terms_acceptance_events from public, anon, authenticated;
revoke all on sequence private.terms_acceptance_events_id_seq from public, anon, authenticated;

create or replace function private.reject_terms_acceptance_event_mutation()
returns trigger
language plpgsql
set search_path = ''
as $function$
begin
  raise exception 'terms acceptance audit is append-only';
end;
$function$;

revoke all on function private.reject_terms_acceptance_event_mutation() from public, anon, authenticated;

create trigger terms_acceptance_events_append_only
before update or delete on private.terms_acceptance_events
for each row execute function private.reject_terms_acceptance_event_mutation();

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
  requested_terms_acceptance boolean := lower(coalesce(new.raw_user_meta_data ->> 'terms_accepted', 'false')) = 'true';
  requested_terms_acceptance_key text := nullif(btrim(coalesce(new.raw_user_meta_data ->> 'terms_acceptance_version', '')), '');
  marketing_consent_version constant text := '2026-09-18-v1';
  current_terms_version constant text := '1.0';
  current_terms_acceptance_key constant text := '2026-09-21-v1';
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
    case when requested_marketing_consent then marketing_consent_version else null end,
    requested_ui_locale
  );

  if requested_marketing_consent then
    insert into private.marketing_consent_events (user_id, granted, consent_version, source)
    values (new.id, true, marketing_consent_version, 'signup');
  end if;

  if requested_terms_acceptance and requested_terms_acceptance_key = current_terms_acceptance_key then
    insert into private.terms_acceptance_events (
      user_id,
      terms_version,
      acceptance_key,
      source
    )
    values (
      new.id,
      current_terms_version,
      current_terms_acceptance_key,
      'signup'
    )
    on conflict (user_id, acceptance_key, source) do nothing;
  end if;

  return new;
end;
$function$;
