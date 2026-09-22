-- Import a public lesson share and account for Free account/device limits in
-- one transaction. The function is called only through a server-side direct
-- Postgres connection; no browser/Data API role receives EXECUTE.

create or replace function public.import_shared_lesson_neon_server(
  p_user_id uuid,
  p_token text,
  p_device_token_hash text
)
returns table(
  lesson_id uuid,
  allowed boolean,
  used integer,
  monthly_limit integer,
  denial_code text,
  device_used integer,
  device_limit integer,
  already_imported boolean
)
language plpgsql
security invoker
set search_path = ''
as $function$
declare
  v_share public.lesson_shares%rowtype;
  v_lesson_id uuid;
  v_request_id uuid;
  v_allowed boolean;
  v_used integer;
  v_monthly_limit integer;
  v_denial_code text;
  v_device_used integer;
  v_device_limit integer;
  v_finished boolean;
begin
  if p_user_id is null then
    raise exception 'user_required' using errcode = '22023';
  end if;

  if p_token is null or p_token !~ '^[0-9a-f]{48}$' then
    return query select
      null::uuid, false, null::integer, null::integer,
      'share_not_found'::text, null::integer, null::integer, false;
    return;
  end if;

  select s.*
  into v_share
  from public.lesson_shares s
  where s.token = p_token
    and s.status = 'active'
    and s.organization_origin_id is null
  for share;

  if not found then
    return query select
      null::uuid, false, null::integer, null::integer,
      'share_not_found'::text, null::integer, null::integer, false;
    return;
  end if;

  select l.id
  into v_lesson_id
  from public.lessons l
  where l.owner_id = p_user_id
    and l.source_share_id = v_share.id;

  if found then
    return query select
      v_lesson_id, true, null::integer, null::integer,
      null::text, null::integer, null::integer, true;
    return;
  end if;

  if not private.lesson_reuse_enabled(p_user_id) then
    select
      r.request_id,
      r.allowed,
      r.used,
      r.monthly_limit,
      r.denial_code,
      r.device_used,
      r.device_limit
    into
      v_request_id,
      v_allowed,
      v_used,
      v_monthly_limit,
      v_denial_code,
      v_device_used,
      v_device_limit
    from public.reserve_lesson_import_server(
      p_user_id,
      p_device_token_hash
    ) r;

    if not coalesce(v_allowed, false) then
      return query select
        null::uuid, false, v_used, v_monthly_limit,
        v_denial_code, v_device_used, v_device_limit, false;
      return;
    end if;
  end if;

  insert into public.lessons (
    owner_id,
    title,
    source_prompt,
    lesson,
    source_share_id,
    source_lesson_id
  )
  values (
    p_user_id,
    left(coalesce(v_share.snapshot ->> 'title', 'Shared lesson'), 200),
    'Imported from a shared lesson.',
    v_share.snapshot,
    v_share.id,
    v_share.lesson_id
  )
  on conflict (owner_id, source_share_id) where source_share_id is not null
  do nothing
  returning id into v_lesson_id;

  if v_lesson_id is null then
    if v_request_id is not null then
      select public.finish_generation_request_server(
        p_user_id,
        v_request_id,
        'failed',
        0,
        null
      ) into v_finished;

      if not coalesce(v_finished, false) then
        raise exception 'shared_lesson_import_quota_cleanup_failed' using errcode = 'P0001';
      end if;
    end if;

    select l.id
    into v_lesson_id
    from public.lessons l
    where l.owner_id = p_user_id
      and l.source_share_id = v_share.id;

    if v_lesson_id is null then
      raise exception 'shared_lesson_import_conflict_without_row' using errcode = 'P0001';
    end if;

    return query select
      v_lesson_id, true, v_used, v_monthly_limit,
      null::text, v_device_used, v_device_limit, true;
    return;
  end if;

  if v_request_id is not null then
    select public.finish_generation_request_server(
      p_user_id,
      v_request_id,
      'succeeded',
      0,
      v_lesson_id
    ) into v_finished;

    if not coalesce(v_finished, false) then
      raise exception 'shared_lesson_import_quota_completion_failed' using errcode = 'P0001';
    end if;
  end if;

  return query select
    v_lesson_id, true, v_used, v_monthly_limit,
    null::text, v_device_used, v_device_limit, false;
end;
$function$;

revoke all on function public.import_shared_lesson_neon_server(uuid, text, text)
  from public, anon, authenticated, service_role;

comment on function public.import_shared_lesson_neon_server(uuid, text, text) is
  'Server-only atomic public-share import: active-share validation, idempotency, Free account/device reservation, lesson insert and reservation completion in one transaction.';
