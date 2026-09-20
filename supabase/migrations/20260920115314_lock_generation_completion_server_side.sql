create or replace function public.finish_generation_request_server(
  p_user_id uuid,
  p_request_id uuid,
  p_status text,
  p_cost_usd numeric default null,
  p_lesson_id uuid default null
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_updated boolean := false;
begin
  if p_user_id is null then
    raise exception 'user_required' using errcode = '22023';
  end if;

  if p_request_id is null then
    raise exception 'request_required' using errcode = '22023';
  end if;

  if p_status not in ('succeeded', 'failed') then
    raise exception 'invalid_generation_status' using errcode = '22023';
  end if;

  if p_cost_usd is not null and p_cost_usd < 0 then
    raise exception 'invalid_generation_cost' using errcode = '22023';
  end if;

  update public.generation_requests
  set status = p_status,
      cost_usd = p_cost_usd,
      lesson_id = p_lesson_id,
      completed_at = now()
  where id = p_request_id
    and user_id = p_user_id
    and status = 'pending';

  v_updated := found;

  if v_updated then
    perform private.complete_free_device_budget_request(
      p_request_id,
      p_user_id,
      p_status
    );
  end if;

  return v_updated;
end;
$function$;

revoke all on function public.finish_generation_request_server(uuid,uuid,text,numeric,uuid)
  from public, anon, authenticated;
grant execute on function public.finish_generation_request_server(uuid,uuid,text,numeric,uuid)
  to service_role;

revoke all on function public.finish_generation_request(uuid,text,numeric,uuid)
  from public, anon, authenticated, service_role;
