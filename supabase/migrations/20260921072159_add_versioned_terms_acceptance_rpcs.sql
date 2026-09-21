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
  requested_terms_version text := case requested_terms_acceptance_key
    when '2026-09-21-v1' then '1.0'
    when '2026-09-21-v2' then '1.1'
    else null
  end;
  marketing_consent_version constant text := '2026-09-18-v1';
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

  if requested_terms_acceptance and requested_terms_version is not null then
    insert into private.terms_acceptance_events (
      user_id,
      terms_version,
      acceptance_key,
      source
    )
    values (
      new.id,
      requested_terms_version,
      requested_terms_acceptance_key,
      'signup'
    )
    on conflict (user_id, acceptance_key, source) do nothing;
  end if;

  return new;
end;
$function$;

create or replace function public.has_terms_acceptance_for_service(
  p_user_id uuid,
  p_acceptance_key text
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $function$
  select
    p_acceptance_key in ('2026-09-21-v1', '2026-09-21-v2')
    and exists (
      select 1
      from private.terms_acceptance_events tae
      where tae.user_id = p_user_id
        and tae.acceptance_key = p_acceptance_key
    );
$function$;

revoke execute on function public.has_terms_acceptance_for_service(uuid, text) from public, anon, authenticated;
grant execute on function public.has_terms_acceptance_for_service(uuid, text) to service_role;

create or replace function public.record_terms_reconsent_for_service(
  p_user_id uuid,
  p_acceptance_key text
)
returns timestamptz
language plpgsql
security definer
set search_path = ''
as $function$
declare
  accepted timestamptz;
  resolved_terms_version text := case p_acceptance_key
    when '2026-09-21-v1' then '1.0'
    when '2026-09-21-v2' then '1.1'
    else null
  end;
begin
  if resolved_terms_version is null then
    raise exception 'unsupported_terms_acceptance_key';
  end if;

  if not exists (select 1 from auth.users u where u.id = p_user_id) then
    raise exception 'terms_reconsent_user_not_found';
  end if;

  insert into private.terms_acceptance_events (
    user_id,
    terms_version,
    acceptance_key,
    source
  )
  values (
    p_user_id,
    resolved_terms_version,
    p_acceptance_key,
    'reconsent'
  )
  on conflict (user_id, acceptance_key, source) do nothing;

  select tae.accepted_at
  into accepted
  from private.terms_acceptance_events tae
  where tae.user_id = p_user_id
    and tae.acceptance_key = p_acceptance_key
    and tae.source = 'reconsent'
  order by tae.accepted_at asc
  limit 1;

  return accepted;
end;
$function$;

revoke execute on function public.record_terms_reconsent_for_service(uuid, text) from public, anon, authenticated;
grant execute on function public.record_terms_reconsent_for_service(uuid, text) to service_role;
