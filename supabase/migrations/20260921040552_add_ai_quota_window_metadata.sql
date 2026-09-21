create or replace function public.get_ai_quota_v2()
returns table(
  lesson_used integer,
  lesson_limit integer,
  lesson_remaining integer,
  revision_used integer,
  revision_limit integer,
  revision_remaining integer,
  lesson_unlimited boolean,
  revision_unlimited boolean,
  quota_window_start timestamptz,
  quota_window_end timestamptz,
  quota_source text
)
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_user_id uuid := auth.uid();
  v_org_id uuid;
  v_lesson_limit integer;
  v_revision_limit integer;
  v_lesson_used integer;
  v_revision_used integer;
  v_window_start timestamptz;
  v_window_end timestamptz;
  v_quota_source text;
begin
  if v_user_id is null then raise exception 'not_authenticated'; end if;

  select cao.organization_id, cao.monthly_lesson_limit, cao.monthly_revision_limit
  into v_org_id, v_lesson_limit, v_revision_limit
  from private.current_active_organization(v_user_id) cao;

  if v_org_id is not null then
    v_window_start := date_trunc('month', now() at time zone 'UTC') at time zone 'UTC';
    v_window_end := (date_trunc('month', now() at time zone 'UTC') + interval '1 month') at time zone 'UTC';
    v_quota_source := 'calendar_utc';

    select count(*)::integer into v_lesson_used
    from public.generation_requests g
    where g.organization_id = v_org_id
      and g.action = 'generate_lesson'
      and g.status in ('pending', 'succeeded')
      and g.created_at >= v_window_start
      and g.created_at < v_window_end;

    select count(*)::integer into v_revision_used
    from public.generation_requests g
    where g.organization_id = v_org_id
      and g.action in ('revise_lesson', 'revise_block')
      and g.status in ('pending', 'succeeded')
      and g.created_at >= v_window_start
      and g.created_at < v_window_end;
  else
    select p.monthly_lesson_limit, p.monthly_revision_limit
    into v_lesson_limit, v_revision_limit
    from public.profiles p
    where p.id = v_user_id;

    if not found then raise exception 'profile_not_found'; end if;

    select q.window_start, q.window_end, q.quota_source
    into v_window_start, v_window_end, v_quota_source
    from private.individual_ai_quota_window(v_user_id, now()) q;

    select count(*)::integer into v_lesson_used
    from public.generation_requests g
    where g.user_id = v_user_id
      and g.organization_id is null
      and g.action = 'generate_lesson'
      and g.status in ('pending', 'succeeded')
      and g.created_at >= v_window_start
      and g.created_at < v_window_end;

    select count(*)::integer into v_revision_used
    from public.generation_requests g
    where g.user_id = v_user_id
      and g.organization_id is null
      and g.action in ('revise_lesson', 'revise_block')
      and g.status in ('pending', 'succeeded')
      and g.created_at >= v_window_start
      and g.created_at < v_window_end;
  end if;

  return query select
    v_lesson_used,
    v_lesson_limit,
    case when v_lesson_limit is null then null else greatest(v_lesson_limit - v_lesson_used, 0) end,
    v_revision_used,
    v_revision_limit,
    case when v_revision_limit is null then null else greatest(v_revision_limit - v_revision_used, 0) end,
    v_lesson_limit is null,
    v_revision_limit is null,
    v_window_start,
    v_window_end,
    v_quota_source;
end;
$function$;

revoke all on function public.get_ai_quota_v2() from public, anon, authenticated, service_role;
grant execute on function public.get_ai_quota_v2() to authenticated, service_role;
