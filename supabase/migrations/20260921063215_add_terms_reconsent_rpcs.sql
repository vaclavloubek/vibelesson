create or replace function public.has_current_terms_acceptance_for_service(p_user_id uuid)
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
      and tae.acceptance_key = '2026-09-21-v1'
  );
$function$;

revoke execute on function public.has_current_terms_acceptance_for_service(uuid) from public, anon, authenticated;
grant execute on function public.has_current_terms_acceptance_for_service(uuid) to service_role;

create or replace function public.record_current_terms_reconsent_for_service(p_user_id uuid)
returns timestamptz
language plpgsql
security definer
set search_path = ''
as $function$
declare
  accepted timestamptz;
begin
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
    '1.0',
    '2026-09-21-v1',
    'reconsent'
  )
  on conflict (user_id, acceptance_key, source) do nothing;

  select tae.accepted_at
  into accepted
  from private.terms_acceptance_events tae
  where tae.user_id = p_user_id
    and tae.acceptance_key = '2026-09-21-v1'
    and tae.source = 'reconsent'
  order by tae.accepted_at asc
  limit 1;

  return accepted;
end;
$function$;

revoke execute on function public.record_current_terms_reconsent_for_service(uuid) from public, anon, authenticated;
grant execute on function public.record_current_terms_reconsent_for_service(uuid) to service_role;
