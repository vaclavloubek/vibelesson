-- Keep Free import/copy quota accounting and the lesson copy in one transaction.
-- The caller is a server-only direct Postgres connection and supplies the
-- authenticated actor explicitly. No browser/Data API role receives EXECUTE.

create or replace function public.duplicate_lesson_server(
  p_user_id uuid,
  p_lesson_id uuid,
  p_device_token_hash text
)
returns table(
  lesson_id uuid,
  allowed boolean,
  used integer,
  monthly_limit integer,
  denial_code text,
  device_used integer,
  device_limit integer
)
language plpgsql
security invoker
set search_path = ''
as $function$
declare
  v_source public.lessons%rowtype;
  v_copy_id uuid;
  v_copy_title text;
  v_copy_document jsonb;
  v_request_id uuid;
  v_allowed boolean;
  v_used integer;
  v_monthly_limit integer;
  v_denial_code text;
  v_device_used integer;
  v_device_limit integer;
  v_finished boolean;
begin
  if p_user_id is null or p_lesson_id is null then
    raise exception 'invalid_lesson_duplicate_request' using errcode = '22023';
  end if;

  select l.*
  into v_source
  from public.lessons l
  where l.id = p_lesson_id
    and l.owner_id = p_user_id
  for key share;

  if not found then
    return query select
      null::uuid, false, null::integer, null::integer,
      'lesson_not_found'::text, null::integer, null::integer;
    return;
  end if;

  if v_source.organization_origin_id is not null
     and not private.organization_origin_access_enabled(
       p_user_id,
       v_source.organization_origin_id
     ) then
    return query select
      null::uuid, false, null::integer, null::integer,
      'organization_origin_access_required'::text,
      null::integer, null::integer;
    return;
  end if;

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
      v_denial_code, v_device_used, v_device_limit;
    return;
  end if;

  if jsonb_typeof(v_source.lesson) <> 'object' then
    raise exception 'invalid_source_lesson_document' using errcode = '22023';
  end if;

  v_copy_title := left(v_source.title || ' – kopie', 200);
  v_copy_document := jsonb_set(
    v_source.lesson,
    '{title}',
    to_jsonb(v_copy_title),
    true
  );

  insert into public.lessons (
    owner_id,
    title,
    source_prompt,
    lesson,
    folder_id,
    source_lesson_id
  )
  values (
    p_user_id,
    v_copy_title,
    v_source.source_prompt,
    v_copy_document,
    v_source.folder_id,
    v_source.id
  )
  returning id into v_copy_id;

  if v_request_id is not null then
    select public.finish_generation_request_server(
      p_user_id,
      v_request_id,
      'succeeded',
      0,
      v_copy_id
    )
    into v_finished;

    if not coalesce(v_finished, false) then
      raise exception 'lesson_duplicate_quota_completion_failed' using errcode = 'P0001';
    end if;
  end if;

  return query select
    v_copy_id, true, v_used, v_monthly_limit,
    null::text, v_device_used, v_device_limit;
end;
$function$;

revoke all on function public.duplicate_lesson_server(uuid, uuid, text)
  from public, anon, authenticated, service_role;

comment on function public.duplicate_lesson_server(uuid, uuid, text) is
  'Server-only atomic lesson copy: owner/license check, Free account/device quota reservation, insert and reservation completion in one transaction.';
