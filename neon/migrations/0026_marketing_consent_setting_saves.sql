-- Saving the marketing email consent from the settings works (2026-09-27).
--
-- set_marketing_email_consent failed on every call with
-- 42702 column reference "marketing_email_consent_at" is ambiguous: its
-- RETURNS TABLE columns are PL/pgSQL variables with the same names as the
-- profiles columns read in the UPDATE. The toggle on /gdpr and on the
-- subscription page therefore never saved; private.marketing_consent_events
-- held only 'signup' rows.
--
-- The only change against the production definition (md5
-- 5a28ecf277746cc6cc873da5c42dfedd on 2026-09-27): the two column reads in
-- the UPDATE's CASE expressions are qualified with the table name. Signature,
-- SECURITY DEFINER, search_path and grants are unchanged (CREATE OR REPLACE
-- keeps the grants). Idempotent.

create or replace function public.set_marketing_email_consent(p_granted boolean)
returns table(
  marketing_email_consent boolean,
  marketing_email_consent_at timestamp with time zone,
  marketing_email_consent_version text,
  marketing_email_consent_revoked_at timestamp with time zone
)
language plpgsql
security definer
set search_path to ''
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
    marketing_email_consent_at = case when p_granted then now() else profiles.marketing_email_consent_at end,
    marketing_email_consent_version = case when p_granted then consent_version else profiles.marketing_email_consent_version end,
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
