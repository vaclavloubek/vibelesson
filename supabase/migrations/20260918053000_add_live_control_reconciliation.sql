alter table public.sessions
  add column if not exists live_updated_at timestamptz not null default now();

alter table public.sessions
  add column if not exists live_control_revision bigint not null default 0;

alter table public.sessions
  drop constraint if exists sessions_live_control_revision_nonnegative;

alter table public.sessions
  add constraint sessions_live_control_revision_nonnegative
  check (live_control_revision >= 0);

alter table public.participants
  add column if not exists team_updated_at timestamptz;

update public.participants
set team_updated_at = coalesce(team_updated_at, joined_at)
where team_id is not null
  and team_updated_at is null;

create or replace function public.reconcile_live_control_snapshot(
  p_session_id uuid,
  p_snapshot jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  v_user_id uuid := auth.uid();
  v_session public.sessions%rowtype;
  v_revision bigint := 0;
  v_snapshot_at timestamptz := now();
  v_status text;
  v_active_block_id text;
  v_revealed text[] := '{}'::text[];
  v_timer jsonb;
  v_timer_status text;
  v_timer_started_at timestamptz;
  v_timer_remaining integer;
  v_item jsonb;
  v_participant_id uuid;
  v_team_id uuid;
  v_block_id text;
  v_updated_at timestamptz;
  v_submitted_at timestamptz;
  v_response_id uuid;
  v_team_response_id uuid;
  v_submitted_answer jsonb;
  v_submitted_text text;
  v_updater_id uuid;
  v_reconciled_responses integer := 0;
  v_reconciled_team_responses integer := 0;
begin
  if v_user_id is null then
    raise exception 'Authentication required.' using errcode = '42501';
  end if;

  if jsonb_typeof(p_snapshot) <> 'object'
     or p_snapshot->>'sessionId' is distinct from p_session_id::text then
    raise exception 'Invalid live snapshot.' using errcode = '22023';
  end if;

  select *
  into v_session
  from public.sessions
  where id = p_session_id
  for update;

  if not found or v_session.teacher_id <> v_user_id then
    raise exception 'Session not found.' using errcode = '42501';
  end if;

  begin
    v_revision := greatest(0, coalesce((p_snapshot->>'revision')::bigint, 0));
  exception when others then
    raise exception 'Invalid live snapshot revision.' using errcode = '22023';
  end;

  if v_revision <= coalesce(v_session.live_control_revision, 0) then
    return jsonb_build_object(
      'ok', true,
      'skipped', true,
      'revision', v_session.live_control_revision,
      'responses', 0,
      'teamResponses', 0
    );
  end if;

  begin
    if nullif(p_snapshot->>'updatedAt', '') is not null then
      v_snapshot_at := (p_snapshot->>'updatedAt')::timestamptz;
    end if;
  exception when others then
    v_snapshot_at := now();
  end;

  v_status := p_snapshot->>'status';
  if v_status not in ('lobby', 'live', 'ended') then
    raise exception 'Invalid session status.' using errcode = '22023';
  end if;

  v_active_block_id := nullif(p_snapshot->>'activeBlockId', '');
  if v_active_block_id is not null and not exists (
    select 1
    from jsonb_array_elements(
      case
        when jsonb_typeof(v_session.lesson_snapshot->'blocks') = 'array'
          then v_session.lesson_snapshot->'blocks'
        else '[]'::jsonb
      end
    ) block
    where block->>'id' = v_active_block_id
  ) then
    raise exception 'Active block is not part of the lesson snapshot.' using errcode = '22023';
  end if;

  if jsonb_typeof(p_snapshot->'revealedBlockIds') = 'array' then
    select coalesce(array_agg(value), '{}'::text[])
    into v_revealed
    from jsonb_array_elements_text(p_snapshot->'revealedBlockIds') value
    where exists (
      select 1
      from jsonb_array_elements(
        case
          when jsonb_typeof(v_session.lesson_snapshot->'blocks') = 'array'
            then v_session.lesson_snapshot->'blocks'
          else '[]'::jsonb
        end
      ) block
      where block->>'id' = value
    );
  end if;

  v_timer := p_snapshot->'timer';
  if jsonb_typeof(v_timer) = 'object' then
    v_timer_status := v_timer->>'status';
    if v_timer_status not in ('idle', 'running', 'paused') then
      v_timer_status := 'idle';
    end if;
    begin
      v_timer_started_at := nullif(v_timer->>'startedAt', '')::timestamptz;
    exception when others then
      v_timer_started_at := null;
    end;
    begin
      v_timer_remaining := greatest(0, coalesce((v_timer->>'remainingSeconds')::integer, 0));
    exception when others then
      v_timer_remaining := 0;
    end;
  else
    v_timer_status := 'idle';
    v_timer_started_at := null;
    v_timer_remaining := null;
  end if;

  if v_snapshot_at >= v_session.live_updated_at then
    update public.sessions
    set status = v_status,
        active_block_id = v_active_block_id,
        revealed_block_ids = v_revealed,
        scoreboard_revealed = case
          when jsonb_typeof(p_snapshot->'scoreboardRevealed') = 'boolean'
            then (p_snapshot->>'scoreboardRevealed')::boolean
          else scoreboard_revealed
        end,
        timer_status = v_timer_status,
        timer_started_at = v_timer_started_at,
        timer_remaining_seconds = v_timer_remaining,
        started_at = case
          when v_status in ('live', 'ended') then coalesce(started_at, v_snapshot_at)
          else started_at
        end,
        ended_at = case
          when v_status = 'ended' then coalesce(ended_at, v_snapshot_at)
          else ended_at
        end,
        live_updated_at = v_snapshot_at
    where id = p_session_id;
  end if;

  if jsonb_typeof(p_snapshot->'participants') = 'array' then
    for v_item in select value from jsonb_array_elements(p_snapshot->'participants')
    loop
      if coalesce(v_item->>'id', '') !~* '^[0-9a-f-]{36}$' then continue; end if;
      v_participant_id := (v_item->>'id')::uuid;
      if not exists (
        select 1 from public.participants
        where id = v_participant_id and session_id = p_session_id
      ) then continue; end if;

      begin
        v_updated_at := nullif(v_item->>'teamUpdatedAt', '')::timestamptz;
      exception when others then
        v_updated_at := null;
      end;
      if v_updated_at is null then continue; end if;

      v_team_id := null;
      if nullif(v_item->>'teamId', '') is not null
         and (v_item->>'teamId') ~* '^[0-9a-f-]{36}$'
         and exists (
           select 1 from public.teams
           where id = (v_item->>'teamId')::uuid and session_id = p_session_id
         ) then
        v_team_id := (v_item->>'teamId')::uuid;
      end if;

      update public.participants
      set team_id = v_team_id,
          team_updated_at = v_updated_at
      where id = v_participant_id
        and session_id = p_session_id
        and (team_updated_at is null or v_updated_at >= team_updated_at);
    end loop;
  end if;

  if jsonb_typeof(p_snapshot->'responses') = 'array' then
    for v_item in select value from jsonb_array_elements(p_snapshot->'responses')
    loop
      if coalesce(v_item->>'participantId', '') !~* '^[0-9a-f-]{36}$' then continue; end if;
      v_participant_id := (v_item->>'participantId')::uuid;
      if not exists (
        select 1 from public.participants
        where id = v_participant_id and session_id = p_session_id
      ) then continue; end if;

      v_block_id := nullif(v_item->>'blockId', '');
      if v_block_id is null or not exists (
        select 1
        from jsonb_array_elements(
          case
            when jsonb_typeof(v_session.lesson_snapshot->'blocks') = 'array'
              then v_session.lesson_snapshot->'blocks'
            else '[]'::jsonb
          end
        ) block
        where block->>'id' = v_block_id
      ) then continue; end if;

      if jsonb_typeof(v_item->'answer') <> 'object' then continue; end if;

      begin
        v_updated_at := coalesce(nullif(v_item->>'updatedAt', '')::timestamptz, v_snapshot_at);
      exception when others then
        v_updated_at := v_snapshot_at;
      end;

      v_submitted_answer := case
        when jsonb_typeof(v_item->'submittedAnswer') = 'object' then v_item->'submittedAnswer'
        else null
      end;
      begin
        v_submitted_at := nullif(v_item->>'submittedAt', '')::timestamptz;
      exception when others then
        v_submitted_at := null;
      end;

      insert into public.responses (
        session_id, participant_id, block_id, answer, updated_at, submitted_answer, submitted_at
      ) values (
        p_session_id, v_participant_id, v_block_id, v_item->'answer', v_updated_at,
        v_submitted_answer, v_submitted_at
      )
      on conflict (session_id, participant_id, block_id) do update
      set answer = case
            when excluded.updated_at >= public.responses.updated_at then excluded.answer
            else public.responses.answer
          end,
          updated_at = greatest(public.responses.updated_at, excluded.updated_at),
          submitted_answer = case
            when excluded.submitted_at is not null
             and (public.responses.submitted_at is null or excluded.submitted_at >= public.responses.submitted_at)
              then excluded.submitted_answer
            else public.responses.submitted_answer
          end,
          submitted_at = case
            when excluded.submitted_at is not null
             and (public.responses.submitted_at is null or excluded.submitted_at >= public.responses.submitted_at)
              then excluded.submitted_at
            else public.responses.submitted_at
          end
      returning id into v_response_id;

      if v_submitted_at is not null and v_item->>'submissionSource' = 'fallback' then
        perform public.queue_submitted_response_evaluation(v_response_id);
      end if;
      v_reconciled_responses := v_reconciled_responses + 1;
    end loop;
  end if;

  if jsonb_typeof(p_snapshot->'teamResponses') = 'array' then
    for v_item in select value from jsonb_array_elements(p_snapshot->'teamResponses')
    loop
      if coalesce(v_item->>'teamId', '') !~* '^[0-9a-f-]{36}$' then continue; end if;
      v_team_id := (v_item->>'teamId')::uuid;
      if not exists (
        select 1 from public.teams where id = v_team_id and session_id = p_session_id
      ) then continue; end if;

      v_block_id := nullif(v_item->>'blockId', '');
      if v_block_id is null or not exists (
        select 1
        from jsonb_array_elements(
          case
            when jsonb_typeof(v_session.lesson_snapshot->'blocks') = 'array'
              then v_session.lesson_snapshot->'blocks'
            else '[]'::jsonb
          end
        ) block
        where block->>'id' = v_block_id and block->>'type' = 'team_task'
      ) then continue; end if;

      if nullif(btrim(v_item->>'text'), '') is null then continue; end if;

      begin
        v_updated_at := coalesce(nullif(v_item->>'updatedAt', '')::timestamptz, v_snapshot_at);
      exception when others then
        v_updated_at := v_snapshot_at;
      end;
      v_submitted_text := nullif(v_item->>'submittedText', '');
      begin
        v_submitted_at := nullif(v_item->>'submittedAt', '')::timestamptz;
      exception when others then
        v_submitted_at := null;
      end;

      v_updater_id := null;
      if nullif(v_item->>'updatedByParticipantId', '') is not null
         and (v_item->>'updatedByParticipantId') ~* '^[0-9a-f-]{36}$'
         and exists (
           select 1 from public.participants
           where id = (v_item->>'updatedByParticipantId')::uuid
             and session_id = p_session_id
             and team_id = v_team_id
         ) then
        v_updater_id := (v_item->>'updatedByParticipantId')::uuid;
      end if;

      insert into public.team_responses (
        session_id, team_id, block_id, answer, updated_by_participant_id,
        updated_at, submitted_answer, submitted_at
      ) values (
        p_session_id, v_team_id, v_block_id, jsonb_build_object('text', v_item->>'text'),
        v_updater_id, v_updated_at,
        case when v_submitted_text is not null then jsonb_build_object('text', v_submitted_text) else null end,
        v_submitted_at
      )
      on conflict (session_id, team_id, block_id) do update
      set answer = case
            when excluded.updated_at >= public.team_responses.updated_at then excluded.answer
            else public.team_responses.answer
          end,
          updated_by_participant_id = case
            when excluded.updated_at >= public.team_responses.updated_at then excluded.updated_by_participant_id
            else public.team_responses.updated_by_participant_id
          end,
          updated_at = greatest(public.team_responses.updated_at, excluded.updated_at),
          submitted_answer = case
            when excluded.submitted_at is not null
             and (public.team_responses.submitted_at is null or excluded.submitted_at >= public.team_responses.submitted_at)
              then excluded.submitted_answer
            else public.team_responses.submitted_answer
          end,
          submitted_at = case
            when excluded.submitted_at is not null
             and (public.team_responses.submitted_at is null or excluded.submitted_at >= public.team_responses.submitted_at)
              then excluded.submitted_at
            else public.team_responses.submitted_at
          end
      returning id into v_team_response_id;

      if v_submitted_at is not null and v_item->>'submissionSource' = 'fallback' then
        perform public.queue_submitted_team_response_evaluation(v_team_response_id);
      end if;
      v_reconciled_team_responses := v_reconciled_team_responses + 1;
    end loop;
  end if;

  update public.sessions
  set live_control_revision = v_revision
  where id = p_session_id;

  return jsonb_build_object(
    'ok', true,
    'skipped', false,
    'revision', v_revision,
    'sessionId', p_session_id,
    'snapshotAt', v_snapshot_at,
    'responses', v_reconciled_responses,
    'teamResponses', v_reconciled_team_responses
  );
end;
$function$;

revoke all on function public.reconcile_live_control_snapshot(uuid, jsonb) from public;
revoke all on function public.reconcile_live_control_snapshot(uuid, jsonb) from anon;
grant execute on function public.reconcile_live_control_snapshot(uuid, jsonb) to authenticated;
