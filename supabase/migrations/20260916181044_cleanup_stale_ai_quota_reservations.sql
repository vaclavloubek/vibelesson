create or replace function public.reserve_lesson_generation()
returns table(request_id uuid, allowed boolean, used integer, monthly_limit integer)
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_user_id uuid := auth.uid();
  v_limit integer;
  v_used integer;
  v_request_id uuid;
  v_month_start timestamptz := date_trunc('month', now() at time zone 'UTC') at time zone 'UTC';
  v_month_end timestamptz := (date_trunc('month', now() at time zone 'UTC') + interval '1 month') at time zone 'UTC';
begin
  if v_user_id is null then
    raise exception 'not_authenticated';
  end if;

  select p.monthly_lesson_limit
    into v_limit
  from public.profiles p
  where p.id = v_user_id
  for update;

  if not found then
    raise exception 'profile_not_found';
  end if;

  update public.generation_requests
  set status = 'failed',
      completed_at = now()
  where user_id = v_user_id
    and status = 'pending'
    and created_at < now() - interval '10 minutes';

  select count(*)::integer
    into v_used
  from public.generation_requests g
  where g.user_id = v_user_id
    and g.action = 'generate_lesson'
    and g.status in ('pending', 'succeeded')
    and g.created_at >= v_month_start
    and g.created_at < v_month_end;

  if v_limit is not null and v_used >= v_limit then
    return query select null::uuid, false, v_used, v_limit;
    return;
  end if;

  insert into public.generation_requests (user_id, action, status)
  values (v_user_id, 'generate_lesson', 'pending')
  returning id into v_request_id;

  return query select v_request_id, true, v_used + 1, v_limit;
end;
$function$;

create or replace function public.reserve_revision_operation(p_action text)
returns table(request_id uuid, allowed boolean, used integer, monthly_limit integer)
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_user_id uuid := auth.uid();
  v_limit integer;
  v_used integer;
  v_request_id uuid;
  v_month_start timestamptz := date_trunc('month', now() at time zone 'UTC') at time zone 'UTC';
  v_month_end timestamptz := (date_trunc('month', now() at time zone 'UTC') + interval '1 month') at time zone 'UTC';
begin
  if v_user_id is null then
    raise exception 'not_authenticated';
  end if;

  if p_action not in ('revise_lesson', 'revise_block') then
    raise exception 'invalid_revision_action';
  end if;

  select p.monthly_revision_limit
    into v_limit
  from public.profiles p
  where p.id = v_user_id
  for update;

  if not found then
    raise exception 'profile_not_found';
  end if;

  update public.generation_requests
  set status = 'failed',
      completed_at = now()
  where user_id = v_user_id
    and status = 'pending'
    and created_at < now() - interval '10 minutes';

  select count(*)::integer
    into v_used
  from public.generation_requests g
  where g.user_id = v_user_id
    and g.action in ('revise_lesson', 'revise_block')
    and g.status in ('pending', 'succeeded')
    and g.created_at >= v_month_start
    and g.created_at < v_month_end;

  if v_limit is not null and v_used >= v_limit then
    return query select null::uuid, false, v_used, v_limit;
    return;
  end if;

  insert into public.generation_requests (user_id, action, status)
  values (v_user_id, p_action, 'pending')
  returning id into v_request_id;

  return query select v_request_id, true, v_used + 1, v_limit;
end;
$function$;
