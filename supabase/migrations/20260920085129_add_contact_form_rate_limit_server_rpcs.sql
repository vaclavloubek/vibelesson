create or replace function public.reserve_contact_form_rate_limit_server(
  p_client_hash text,
  p_email_hash text,
  p_window_bucket bigint
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_id uuid;
begin
  if p_client_hash is null or char_length(p_client_hash) <> 64 then
    raise exception 'invalid_client_hash';
  end if;
  if p_email_hash is null or char_length(p_email_hash) <> 64 then
    raise exception 'invalid_email_hash';
  end if;
  if p_window_bucket is null or p_window_bucket < 0 then
    raise exception 'invalid_window_bucket';
  end if;

  delete from private.contact_form_rate_limits
  where created_at < now() - interval '30 days';

  begin
    insert into private.contact_form_rate_limits (
      client_hash,
      email_hash,
      window_bucket
    )
    values (
      p_client_hash,
      p_email_hash,
      p_window_bucket
    )
    returning id into v_id;
  exception
    when unique_violation then
      return null;
  end;

  return v_id;
end;
$function$;

revoke all on function public.reserve_contact_form_rate_limit_server(text, text, bigint)
  from public, anon, authenticated;
grant execute on function public.reserve_contact_form_rate_limit_server(text, text, bigint)
  to service_role;

create or replace function public.release_contact_form_rate_limit_server(
  p_reservation_id uuid
)
returns void
language sql
security definer
set search_path = ''
as $function$
  delete from private.contact_form_rate_limits
  where id = p_reservation_id;
$function$;

revoke all on function public.release_contact_form_rate_limit_server(uuid)
  from public, anon, authenticated;
grant execute on function public.release_contact_form_rate_limit_server(uuid)
  to service_role;
