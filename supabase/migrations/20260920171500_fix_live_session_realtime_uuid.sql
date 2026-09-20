-- Production hotfix: create_live_session_server receives the realtime key as text
-- from the server route, while public.sessions.realtime_key is a uuid column.
-- PostgreSQL has no implicit text -> uuid cast for this INSERT, so session creation
-- fails before the lobby row is written. Keep the RPC signature stable and cast
-- explicitly at the DB boundary.

create or replace function public.create_live_session_server(
  p_user_id uuid,
  p_lesson_id uuid,
  p_join_code text,
  p_realtime_key text,
  p_device_token_hash text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_lesson public.lessons%rowtype;
  v_session public.sessions%rowtype;
begin
  if p_user_id is null or p_lesson_id is null then
    raise exception 'invalid_session_request' using errcode = '22023';
  end if;

  if not private.trusted_device_hash_valid(p_user_id, p_device_token_hash) then
    raise exception 'trusted_device_required' using errcode = '42501';
  end if;

  select l.*
  into v_lesson
  from public.lessons l
  where l.id = p_lesson_id
    and l.owner_id = p_user_id;

  if not found then
    raise exception 'lesson_not_found' using errcode = 'P0002';
  end if;

  if v_lesson.organization_origin_id is not null
     and not private.organization_origin_access_enabled(
       p_user_id,
       v_lesson.organization_origin_id
     ) then
    raise exception 'organization_origin_access_required' using errcode = '42501';
  end if;

  insert into public.sessions (
    lesson_id, teacher_id, join_code, status, active_block_id,
    lesson_snapshot, realtime_key, started_at, ended_at
  )
  values (
    p_lesson_id, p_user_id, p_join_code, 'lobby', null,
    v_lesson.lesson, p_realtime_key::uuid, null, null
  )
  returning * into v_session;

  return jsonb_build_object(
    'id', v_session.id,
    'join_code', v_session.join_code,
    'status', v_session.status,
    'realtime_key', v_session.realtime_key,
    'lesson_snapshot', v_session.lesson_snapshot
  );
end;
$function$;

revoke all on function public.create_live_session_server(uuid, uuid, text, text, text)
  from public, anon, authenticated;
grant execute on function public.create_live_session_server(uuid, uuid, text, text, text)
  to service_role;

comment on function public.create_live_session_server(uuid, uuid, text, text, text) is
  'Service-role-only live-session creation using DB-authoritative lesson state, trusted-device validation, and explicit realtime UUID conversion.';
