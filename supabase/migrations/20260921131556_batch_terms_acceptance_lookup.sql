-- One round trip for the product-access legal gate. This is additive so the
-- application can safely fall back while environments are rolled forward.
create or replace function public.has_any_terms_acceptance_for_service(
  p_user_id uuid,
  p_acceptance_keys text[]
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $function$
  select exists (
    select 1
    from private.terms_acceptance_events tae
    where tae.user_id = p_user_id
      and tae.acceptance_key = any (p_acceptance_keys)
      and tae.acceptance_key in (
        '2026-09-21-v1',
        '2026-09-21-v2',
        '2026-09-21-v3',
        '2026-09-21-v4',
        '2026-09-21-v5',
        '2026-09-21-v6'
      )
  );
$function$;

revoke execute on function public.has_any_terms_acceptance_for_service(uuid, text[])
  from public, anon, authenticated;
grant execute on function public.has_any_terms_acceptance_for_service(uuid, text[])
  to service_role;
