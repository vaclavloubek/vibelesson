alter table public.sessions
  add column if not exists live_control_revision bigint not null default 0;

alter table public.sessions
  drop constraint if exists sessions_live_control_revision_nonnegative;

alter table public.sessions
  add constraint sessions_live_control_revision_nonnegative
  check (live_control_revision >= 0);

comment on column public.sessions.live_control_revision is
  'Highest Cloudflare Live Control event revision transactionally reconciled into the primary Supabase state.';

create or replace function public.reconcile_live_control_events(
  p_session_id uuid,
  p_events jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  v_session public.sessions%rowtype;
  v_event jsonb;
  v_payload jsonb;
  v_revision bigint;
  v_cursor bigint;
  v_actor_id uuid;
  v_team_id uuid;
  v_block_id text;
  v_action text;
  v_source text;
  v_event_type text;
  v_actor_role text;
  v_expected_block text;
  v_target_block text;
  v_current_index integer;
  v_target_index integer;
  v_block jsonb;
  v_answer jsonb;
  v_created_at timestamptz;
  v_submitted boolean;
  v_response_id uuid;
  v_team_response_id uuid;
  v_applied integer := 0;
begin
  if auth.uid() is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;

  if jsonb_typeof(p_events) <> 'array' then
    raise exception 'events must be a JSON array' using errcode = '22023';
  end if;

  if jsonb_array_length(p_events) > 500 then
    raise exception 'too many events in one reconciliation batch' using errcode = '22023';
  end if;

  select *
  into v_session
  from public.sessions
  where id = p_session_id
    and teacher_id = auth.uid()
  for update;

  if not found then
    raise exception 'session not found' using errcode = '42501';
  end if;

  v_cursor := coalesce(v_session.live_control_revision, 0);

  for v_event in
    select value
    from jsonb_array_elements(p_events)
    order by
      case
        when coalesce(value->>'revision', '') ~ '^[0-9]+$'
          then (value->>'revision')::bigint
        else 9223372036854775807
      end
  loop
    if coalesce(v_event->>'revision', '') !~ '^[0-9]+$' then
      raise exception 'invalid live event revision' using errcode = '22023';
    end if;

    v_revision := (v_event->>'revision')::bigint;

    if v_revision <= v_cursor then
      continue;
    end if;

    if v_revision <> v_cursor + 1 then
      raise exception 'live event revision gap: expected %, got %', v_cursor + 1, v_revision
        using errcode = '22023';
    end if;

    v_payload := case
      when jsonb_typeof(v_event->'payload') = 'object' then v_event->'payload'
      else '{}'::jsonb
    end;
    v_event_type := coalesce(v_event->>'type', '');
    v_actor_role := coalesce(v_event->>'actorRole', '');
    v_source := coalesce(v_payload->>'source', 'fallback');
    v_created_at := case
      when coalesce(v_event->>'createdAt', '') <> ''
        then (v_event->>'createdAt')::timestamptz
      else now()
    end;

    if v_actor_role = 'teacher' and v_event_type = 'teacher.command' then
      if coalesce(v_event->>'actorId', '') <> auth.uid()::text then
        raise exception 'teacher live event actor mismatch' using errcode = '42501';
      end if;

      -- Primary teacher commands already committed in Supabase. Only fallback
      -- commands need replay; the cursor still advances across primary events.
      if v_source <> 'primary' then
        v_action := coalesce(v_payload->>'action', '');
        v_expected_block := nullif(v_payload->>'expectedActiveBlockId', '');

        if v_action = 'start' then
          if v_session.status = 'lobby' then
            v_target_block := v_session.lesson_snapshot->'blocks'->0->>'id';
            if nullif(v_target_block, '') is not null then
              update public.sessions
              set status = 'live',
                  active_block_id = v_target_block,
                  started_at = coalesce(started_at, v_created_at),
                  timer_status = 'idle',
                  timer_started_at = null,
                  timer_remaining_seconds = null
              where id = p_session_id
              returning * into v_session;
              v_applied := v_applied + 1;
            end if;
          end if;

        elsif v_action in ('next', 'previous') then
          if v_session.status = 'live'
             and v_session.active_block_id is not null
             and (v_expected_block is null or v_expected_block = v_session.active_block_id) then
            select ordinality::integer - 1
            into v_current_index
            from jsonb_array_elements(
              case
                when jsonb_typeof(v_session.lesson_snapshot->'blocks') = 'array'
                  then v_session.lesson_snapshot->'blocks'
                else '[]'::jsonb
              end
            ) with ordinality as block(value, ordinality)
            where value->>'id' = v_session.active_block_id
            limit 1;

            if v_current_index is not null then
              v_target_index := case
                when v_action = 'next' then v_current_index + 1
                else v_current_index - 1
              end;
              v_target_block := v_session.lesson_snapshot->'blocks'->v_target_index->>'id';

              if nullif(v_target_block, '') is not null then
                update public.sessions
                set active_block_id = v_target_block,
                    timer_status = 'idle',
                    timer_started_at = null,
                    timer_remaining_seconds = case
                      when v_session.lesson_snapshot->'blocks'->v_target_index->>'type' = 'timer'
                           and coalesce(v_session.lesson_snapshot->'blocks'->v_target_index->>'durationMinutes', '') ~ '^[0-9]+([.][0-9]+)?$'
                        then greatest(0, round(((v_session.lesson_snapshot->'blocks'->v_target_index->>'durationMinutes')::numeric) * 60)::integer)
                      else null
                    end
                where id = p_session_id
                returning * into v_session;
                v_applied := v_applied + 1;
              end if;
            end if;
          end if;

        elsif v_action = 'end' then
          if v_session.status <> 'ended' then
            update public.sessions
            set status = 'ended',
                ended_at = coalesce(ended_at, v_created_at),
                timer_status = 'idle',
                timer_started_at = null
            where id = p_session_id
            returning * into v_session;
            v_applied := v_applied + 1;
          end if;

        elsif v_action = 'reveal_results' then
          if v_session.active_block_id is not null
             and not (v_session.active_block_id = any(coalesce(v_session.revealed_block_ids, '{}'::text[]))) then
            update public.sessions
            set revealed_block_ids = array_append(coalesce(revealed_block_ids, '{}'::text[]), active_block_id)
            where id = p_session_id
            returning * into v_session;
            v_applied := v_applied + 1;
          end if;

        elsif v_action = 'reveal_scoreboard' then
          if not coalesce(v_session.scoreboard_revealed, false) then
            update public.sessions
            set scoreboard_revealed = true
            where id = p_session_id
            returning * into v_session;
            v_applied := v_applied + 1;
          end if;

        elsif v_action = 'hide_scoreboard' then
          if coalesce(v_session.scoreboard_revealed, false) then
            update public.sessions
            set scoreboard_revealed = false
            where id = p_session_id
            returning * into v_session;
            v_applied := v_applied + 1;
          end if;

        elsif v_action = 'timer_reset' then
          select value
          into v_block
          from jsonb_array_elements(
            case
              when jsonb_typeof(v_session.lesson_snapshot->'blocks') = 'array'
                then v_session.lesson_snapshot->'blocks'
              else '[]'::jsonb
            end
          ) as block(value)
          where value->>'id' = v_session.active_block_id
          limit 1;

          if v_block->>'type' = 'timer'
             and coalesce(v_block->>'durationMinutes', '') ~ '^[0-9]+([.][0-9]+)?$' then
            update public.sessions
            set timer_status = 'idle',
                timer_started_at = null,
                timer_remaining_seconds = greatest(0, round(((v_block->>'durationMinutes')::numeric) * 60)::integer)
            where id = p_session_id
            returning * into v_session;
            v_applied := v_applied + 1;
          end if;

        elsif v_action = 'timer_start' then
          if v_session.status = 'live'
             and v_session.timer_status <> 'running'
             and coalesce(v_session.timer_remaining_seconds, 0) > 0 then
            update public.sessions
            set timer_status = 'running',
                timer_started_at = v_created_at
            where id = p_session_id
            returning * into v_session;
            v_applied := v_applied + 1;
          end if;

        elsif v_action = 'timer_pause' then
          if v_session.timer_status = 'running' and v_session.timer_started_at is not null then
            update public.sessions
            set timer_status = 'paused',
                timer_remaining_seconds = greatest(
                  0,
                  coalesce(timer_remaining_seconds, 0)
                    - greatest(0, floor(extract(epoch from (v_created_at - timer_started_at)))::integer)
                ),
                timer_started_at = null
            where id = p_session_id
            returning * into v_session;
            v_applied := v_applied + 1;
          end if;
        end if;
      end if;

    elsif v_actor_role = 'student' then
      if coalesce(v_event->>'actorId', '') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then
        raise exception 'invalid student actor id' using errcode = '22023';
      end if;
      v_actor_id := (v_event->>'actorId')::uuid;

      if not exists (
        select 1 from public.participants
        where id = v_actor_id and session_id = p_session_id
      ) then
        raise exception 'student live event actor is outside session' using errcode = '42501';
      end if;

      if v_event_type = 'student.joined' then
        -- Student joins currently originate in Supabase and are mirrored to the
        -- live plane only after the primary insert succeeds.
        null;

      elsif v_event_type = 'student.team_selected' then
        if coalesce(v_payload->>'teamId', '') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then
          raise exception 'invalid live team id' using errcode = '22023';
        end if;
        v_team_id := (v_payload->>'teamId')::uuid;
        if not exists (
          select 1 from public.teams
          where id = v_team_id and session_id = p_session_id
        ) then
          raise exception 'live team is outside session' using errcode = '42501';
        end if;

        update public.participants
        set team_id = v_team_id,
            last_seen_at = greatest(coalesce(last_seen_at, v_created_at), v_created_at)
        where id = v_actor_id
          and session_id = p_session_id;
        v_applied := v_applied + 1;

      elsif v_event_type = 'student.response' then
        v_block_id := nullif(v_payload->>'blockId', '');
        v_answer := v_payload->'answer';
        v_submitted := coalesce((v_payload->>'submitted')::boolean, false);

        if v_block_id is null or jsonb_typeof(v_answer) <> 'object' then
          raise exception 'invalid fallback student response' using errcode = '22023';
        end if;

        select value
        into v_block
        from jsonb_array_elements(
          case
            when jsonb_typeof(v_session.lesson_snapshot->'blocks') = 'array'
              then v_session.lesson_snapshot->'blocks'
            else '[]'::jsonb
          end
        ) as block(value)
        where value->>'id' = v_block_id
        limit 1;

        if v_block is null or v_block->>'type' = 'team_task' then
          raise exception 'fallback response block is invalid' using errcode = '22023';
        end if;

        if v_block->>'type' in ('poll', 'quiz') then
          if nullif(v_answer->>'choice', '') is null
             or not exists (
               select 1
               from jsonb_array_elements_text(
                 case when jsonb_typeof(v_block->'options') = 'array' then v_block->'options' else '[]'::jsonb end
               ) option(value)
               where value = v_answer->>'choice'
             ) then
            raise exception 'invalid fallback choice answer' using errcode = '22023';
          end if;

        elsif v_block->>'type' in ('open_text', 'exit_ticket') then
          if length(btrim(coalesce(v_answer->>'text', ''))) not between 1 and 2000 then
            raise exception 'invalid fallback text answer' using errcode = '22023';
          end if;

        elsif v_block->>'type' = 'ranking' then
          if jsonb_typeof(v_answer->'ranking') <> 'array'
             or jsonb_typeof(v_block->'items') <> 'array'
             or jsonb_array_length(v_answer->'ranking') <> jsonb_array_length(v_block->'items')
             or length(btrim(coalesce(v_answer->>'text', ''))) not between 1 and 2000
             or (
               select count(distinct value)
               from jsonb_array_elements_text(v_answer->'ranking') item(value)
             ) <> jsonb_array_length(v_answer->'ranking')
             or exists (
               select 1
               from jsonb_array_elements_text(v_block->'items') expected(value)
               where not exists (
                 select 1
                 from jsonb_array_elements_text(v_answer->'ranking') actual(value)
                 where actual.value = expected.value
               )
             ) then
            raise exception 'invalid fallback ranking answer' using errcode = '22023';
          end if;
        else
          raise exception 'fallback block does not accept an answer' using errcode = '22023';
        end if;

        v_response_id := null;
        insert into public.responses (
          session_id, participant_id, block_id, answer,
          submitted_answer, submitted_at, created_at, updated_at
        ) values (
          p_session_id, v_actor_id, v_block_id, v_answer,
          case when v_submitted then v_answer else null end,
          case when v_submitted then v_created_at else null end,
          v_created_at, v_created_at
        )
        on conflict (session_id, participant_id, block_id)
        do update set
          answer = case
            when excluded.updated_at >= public.responses.updated_at then excluded.answer
            else public.responses.answer
          end,
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
          end,
          updated_at = greatest(public.responses.updated_at, excluded.updated_at)
        returning id into v_response_id;

        if v_submitted and v_response_id is not null then
          perform public.queue_submitted_response_evaluation(v_response_id);
        end if;
        v_applied := v_applied + 1;

      elsif v_event_type = 'student.team_response' then
        v_block_id := nullif(v_payload->>'blockId', '');
        if coalesce(v_payload->>'teamId', '') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then
          raise exception 'invalid fallback team response team id' using errcode = '22023';
        end if;
        v_team_id := (v_payload->>'teamId')::uuid;
        v_submitted := coalesce((v_payload->>'submitted')::boolean, false);

        if v_block_id is null
           or length(btrim(coalesce(v_payload->>'text', ''))) not between 1 and 4000 then
          raise exception 'invalid fallback team response' using errcode = '22023';
        end if;

        if not exists (
          select 1 from public.teams
          where id = v_team_id and session_id = p_session_id
        ) or not exists (
          select 1 from public.participants
          where id = v_actor_id
            and session_id = p_session_id
            and team_id = v_team_id
        ) then
          raise exception 'fallback team response scope mismatch' using errcode = '42501';
        end if;

        select value
        into v_block
        from jsonb_array_elements(
          case
            when jsonb_typeof(v_session.lesson_snapshot->'blocks') = 'array'
              then v_session.lesson_snapshot->'blocks'
            else '[]'::jsonb
          end
        ) as block(value)
        where value->>'id' = v_block_id
        limit 1;

        if v_block is null or v_block->>'type' <> 'team_task' then
          raise exception 'fallback team response block is invalid' using errcode = '22023';
        end if;

        v_team_response_id := null;
        insert into public.team_responses (
          session_id, team_id, block_id, answer, updated_by_participant_id,
          submitted_answer, submitted_at, created_at, updated_at
        ) values (
          p_session_id, v_team_id, v_block_id, jsonb_build_object('text', btrim(v_payload->>'text')), v_actor_id,
          case when v_submitted then jsonb_build_object('text', btrim(v_payload->>'text')) else null end,
          case when v_submitted then v_created_at else null end,
          v_created_at, v_created_at
        )
        on conflict (session_id, team_id, block_id)
        do update set
          answer = case
            when excluded.updated_at >= public.team_responses.updated_at then excluded.answer
            else public.team_responses.answer
          end,
          updated_by_participant_id = case
            when excluded.updated_at >= public.team_responses.updated_at then excluded.updated_by_participant_id
            else public.team_responses.updated_by_participant_id
          end,
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
          end,
          updated_at = greatest(public.team_responses.updated_at, excluded.updated_at)
        returning id into v_team_response_id;

        if v_submitted and v_team_response_id is not null then
          perform public.queue_submitted_team_response_evaluation(v_team_response_id);
        end if;
        v_applied := v_applied + 1;
      end if;
    end if;

    v_cursor := v_revision;
    update public.sessions
    set live_control_revision = v_cursor
    where id = p_session_id;
    v_session.live_control_revision := v_cursor;
  end loop;

  return jsonb_build_object(
    'revision', v_cursor,
    'applied', v_applied
  );
end;
$function$;

revoke all on function public.reconcile_live_control_events(uuid, jsonb) from public;
grant execute on function public.reconcile_live_control_events(uuid, jsonb) to authenticated;
