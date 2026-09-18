alter table public.sessions
  add column if not exists live_control_revision bigint not null default 0;

alter table public.sessions
  drop constraint if exists sessions_live_control_revision_nonnegative;

alter table public.sessions
  add constraint sessions_live_control_revision_nonnegative
  check (live_control_revision >= 0);

create or replace function public.reconcile_live_control_events(
  p_session_id uuid,
  p_events jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_session public.sessions%rowtype;
  v_event jsonb;
  v_payload jsonb;
  v_revision bigint;
  v_cursor bigint;
  v_source text;
  v_type text;
  v_action text;
  v_operation_id uuid;
  v_actor_id uuid;
  v_created_at timestamptz;
  v_expected_block_id text;
  v_block_id text;
  v_target_block_id text;
  v_current_ordinal bigint;
  v_target_ordinal bigint;
  v_duration_seconds integer;
  v_team_id uuid;
  v_answer jsonb;
  v_text text;
  v_submitted boolean;
  v_response_id uuid;
  v_team_response_id uuid;
  v_participant_team_id uuid;
begin
  if auth.uid() is null then
    raise exception 'AUTH_REQUIRED' using errcode = '42501';
  end if;

  if jsonb_typeof(p_events) <> 'array' then
    raise exception 'EVENTS_MUST_BE_ARRAY' using errcode = '22023';
  end if;

  select *
    into v_session
  from public.sessions
  where id = p_session_id
    and teacher_id = auth.uid()
  for update;

  if not found then
    raise exception 'SESSION_NOT_FOUND' using errcode = '42501';
  end if;

  v_cursor := v_session.live_control_revision;

  for v_event in
    select value
    from jsonb_array_elements(p_events)
    order by (value->>'revision')::bigint
  loop
    v_revision := (v_event->>'revision')::bigint;
    if v_revision <= v_cursor then
      continue;
    end if;

    if v_revision <> v_cursor + 1 then
      raise exception 'LIVE_CONTROL_REVISION_GAP expected %, got %', v_cursor + 1, v_revision
        using errcode = '22023';
    end if;

    v_payload := coalesce(v_event->'payload', '{}'::jsonb);
    v_source := coalesce(v_payload->>'source', '');
    v_type := coalesce(v_event->>'type', '');
    v_created_at := coalesce((v_event->>'createdAt')::timestamptz, now());
    v_operation_id := nullif(v_event->>'operationId', '')::uuid;
    v_actor_id := nullif(v_event->>'actorId', '')::uuid;

    if v_source = 'fallback' then
      if v_type = 'teacher.command' then
        v_action := v_payload->>'action';
        v_expected_block_id := nullif(v_payload->>'expectedActiveBlockId', '');

        if v_action = 'start' and v_session.status = 'lobby' then
          select block->>'id'
            into v_target_block_id
          from jsonb_array_elements(v_session.lesson_snapshot->'blocks') with ordinality as x(block, ord)
          order by ord
          limit 1;

          if v_target_block_id is not null then
            update public.sessions
            set status = 'live',
                active_block_id = v_target_block_id,
                started_at = coalesce(started_at, v_created_at),
                timer_status = 'idle',
                timer_started_at = null
            where id = p_session_id;
          end if;

        elsif v_action in ('next', 'previous') and v_session.status = 'live' then
          if v_expected_block_id is null or v_session.active_block_id = v_expected_block_id then
            select ord
              into v_current_ordinal
            from jsonb_array_elements(v_session.lesson_snapshot->'blocks') with ordinality as x(block, ord)
            where block->>'id' = v_session.active_block_id
            limit 1;

            if v_current_ordinal is not null then
              v_target_ordinal := case when v_action = 'next' then v_current_ordinal + 1 else v_current_ordinal - 1 end;
              select block->>'id',
                     case
                       when block->>'type' = 'timer'
                         then greatest(0, floor(coalesce((block->>'durationMinutes')::numeric, 0) * 60)::integer)
                       else null
                     end
                into v_target_block_id, v_duration_seconds
              from jsonb_array_elements(v_session.lesson_snapshot->'blocks') with ordinality as x(block, ord)
              where ord = v_target_ordinal
              limit 1;

              if v_target_block_id is not null then
                update public.sessions
                set active_block_id = v_target_block_id,
                    timer_status = 'idle',
                    timer_started_at = null,
                    timer_remaining_seconds = v_duration_seconds
                where id = p_session_id;
              end if;
            end if;
          end if;

        elsif v_action = 'end' and v_session.status <> 'ended' then
          update public.sessions
          set status = 'ended',
              ended_at = coalesce(ended_at, v_created_at),
              timer_status = 'idle',
              timer_started_at = null
          where id = p_session_id;

        elsif v_action = 'reveal_results' and v_session.active_block_id is not null then
          update public.sessions
          set revealed_block_ids = case
            when v_session.active_block_id = any(revealed_block_ids) then revealed_block_ids
            else array_append(revealed_block_ids, v_session.active_block_id)
          end
          where id = p_session_id;

        elsif v_action = 'reveal_scoreboard' then
          update public.sessions set scoreboard_revealed = true where id = p_session_id;

        elsif v_action = 'hide_scoreboard' then
          update public.sessions set scoreboard_revealed = false where id = p_session_id;

        elsif v_action = 'timer_start'
          and v_session.status = 'live'
          and v_session.timer_status <> 'running' then
          update public.sessions
          set timer_status = 'running',
              timer_started_at = v_created_at
          where id = p_session_id;

        elsif v_action = 'timer_pause'
          and v_session.status = 'live'
          and v_session.timer_status = 'running' then
          update public.sessions
          set timer_status = 'paused',
              timer_remaining_seconds = greatest(
                0,
                coalesce(v_session.timer_remaining_seconds, 0)
                - greatest(0, floor(extract(epoch from (v_created_at - v_session.timer_started_at)))::integer)
              ),
              timer_started_at = null
          where id = p_session_id;

        elsif v_action = 'timer_reset'
          and v_session.status = 'live'
          and v_session.active_block_id is not null then
          select greatest(0, floor(coalesce((block->>'durationMinutes')::numeric, 0) * 60)::integer)
            into v_duration_seconds
          from jsonb_array_elements(v_session.lesson_snapshot->'blocks') as x(block)
          where block->>'id' = v_session.active_block_id
            and block->>'type' = 'timer'
          limit 1;

          if v_duration_seconds is not null then
            update public.sessions
            set timer_status = 'idle',
                timer_started_at = null,
                timer_remaining_seconds = v_duration_seconds
            where id = p_session_id;
          end if;
        end if;

        select *
          into v_session
        from public.sessions
        where id = p_session_id
        for update;

      elsif v_type = 'student.team_selected' and v_actor_id is not null then
        v_team_id := nullif(v_payload->>'teamId', '')::uuid;
        if v_team_id is not null
          and exists (select 1 from public.teams where id = v_team_id and session_id = p_session_id) then
          select team_id
            into v_participant_team_id
          from public.participants
          where id = v_actor_id and session_id = p_session_id
          for update;

          if found and (
            v_session.status = 'lobby'
            or v_participant_team_id is null
            or v_participant_team_id = v_team_id
          ) then
            update public.participants
            set team_id = v_team_id,
                last_seen_at = greatest(coalesce(last_seen_at, v_created_at), v_created_at)
            where id = v_actor_id
              and session_id = p_session_id;
          end if;
        end if;

      elsif v_type = 'student.response' and v_actor_id is not null then
        v_block_id := nullif(v_payload->>'blockId', '');
        v_answer := v_payload->'answer';
        v_submitted := coalesce((v_payload->>'submitted')::boolean, false);

        if v_block_id is not null
          and jsonb_typeof(v_answer) = 'object'
          and exists (
            select 1
            from public.participants
            where id = v_actor_id and session_id = p_session_id
          )
          and exists (
            select 1
            from jsonb_array_elements(v_session.lesson_snapshot->'blocks') as x(block)
            where block->>'id' = v_block_id
              and block->>'type' <> 'team_task'
          ) then
          insert into public.responses (
            session_id,
            participant_id,
            block_id,
            answer,
            created_at,
            updated_at,
            submitted_answer,
            submitted_at
          )
          values (
            p_session_id,
            v_actor_id,
            v_block_id,
            v_answer,
            v_created_at,
            v_created_at,
            case when v_submitted then v_answer else null end,
            case when v_submitted then v_created_at else null end
          )
          on conflict (session_id, participant_id, block_id)
          do update set
            answer = excluded.answer,
            updated_at = excluded.updated_at,
            submitted_answer = case
              when v_submitted then excluded.answer
              else public.responses.submitted_answer
            end,
            submitted_at = case
              when v_submitted then excluded.updated_at
              else public.responses.submitted_at
            end
          where public.responses.updated_at <= excluded.updated_at
          returning id into v_response_id;

          if v_submitted and v_response_id is not null then
            perform public.queue_submitted_response_evaluation(v_response_id);
          end if;
        end if;

      elsif v_type = 'student.team_response' and v_actor_id is not null then
        v_team_id := nullif(v_payload->>'teamId', '')::uuid;
        v_block_id := nullif(v_payload->>'blockId', '');
        v_text := nullif(btrim(v_payload->>'text'), '');
        v_submitted := coalesce((v_payload->>'submitted')::boolean, false);

        select team_id
          into v_participant_team_id
        from public.participants
        where id = v_actor_id and session_id = p_session_id;

        if v_team_id is not null
          and v_block_id is not null
          and v_text is not null
          and length(v_text) <= 4000
          and v_participant_team_id = v_team_id
          and exists (select 1 from public.teams where id = v_team_id and session_id = p_session_id)
          and exists (
            select 1
            from jsonb_array_elements(v_session.lesson_snapshot->'blocks') as x(block)
            where block->>'id' = v_block_id
              and block->>'type' = 'team_task'
          ) then
          insert into public.team_responses (
            session_id,
            team_id,
            block_id,
            answer,
            updated_by_participant_id,
            created_at,
            updated_at,
            submitted_answer,
            submitted_at
          )
          values (
            p_session_id,
            v_team_id,
            v_block_id,
            jsonb_build_object('text', v_text),
            v_actor_id,
            v_created_at,
            v_created_at,
            case when v_submitted then jsonb_build_object('text', v_text) else null end,
            case when v_submitted then v_created_at else null end
          )
          on conflict (session_id, team_id, block_id)
          do update set
            answer = excluded.answer,
            updated_by_participant_id = excluded.updated_by_participant_id,
            updated_at = excluded.updated_at,
            submitted_answer = case
              when v_submitted then excluded.answer
              else public.team_responses.submitted_answer
            end,
            submitted_at = case
              when v_submitted then excluded.updated_at
              else public.team_responses.submitted_at
            end
          where public.team_responses.updated_at <= excluded.updated_at
          returning id into v_team_response_id;

          if v_submitted and v_team_response_id is not null then
            perform public.queue_submitted_team_response_evaluation(v_team_response_id);
          end if;
        end if;
      end if;
    end if;

    v_cursor := v_revision;
  end loop;

  update public.sessions
  set live_control_revision = v_cursor
  where id = p_session_id;

  return jsonb_build_object(
    'ok', true,
    'revision', v_cursor
  );
end;
$$;

revoke all on function public.reconcile_live_control_events(uuid, jsonb) from public;
grant execute on function public.reconcile_live_control_events(uuid, jsonb) to authenticated;

comment on column public.sessions.live_control_revision is
  'Highest Cloudflare Live Control event revision transactionally reconciled into Supabase.';

comment on function public.reconcile_live_control_events(uuid, jsonb) is
  'Teacher-owned transactional reconciliation of monotonic live-control events. Primary mirrored events only advance the cursor; fallback events are applied idempotently.';
