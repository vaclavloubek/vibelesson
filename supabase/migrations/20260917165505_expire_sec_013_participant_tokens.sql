alter table public.participants
  add column participant_token_expires_at timestamptz;

update public.participants
set participant_token_expires_at = joined_at + interval '24 hours'
where participant_token_expires_at is null;

alter table public.participants
  alter column participant_token_expires_at set default (now() + interval '24 hours'),
  alter column participant_token_expires_at set not null;

alter table public.participants
  add constraint participants_token_expiry_window
  check (
    participant_token_expires_at > joined_at
    and participant_token_expires_at <= joined_at + interval '24 hours'
  );

create or replace function public.get_student_public_scoreboard(
  p_session_id uuid,
  p_participant_token_hash text
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_participant_id uuid;
  v_status text;
  v_active_block_id text;
  v_lesson_snapshot jsonb;
  v_scoreboard_revealed boolean;
  v_result jsonb;
begin
  if p_participant_token_hash is null
    or p_participant_token_hash !~ '^[0-9a-f]{64}$'
  then
    return null;
  end if;

  select p.id, s.status, s.active_block_id, s.lesson_snapshot, s.scoreboard_revealed
  into v_participant_id, v_status, v_active_block_id, v_lesson_snapshot, v_scoreboard_revealed
  from public.sessions s
  join public.participants p
    on p.session_id = s.id
   and p.participant_token_hash = p_participant_token_hash
   and p.participant_token_expires_at > now()
  where s.id = p_session_id
  limit 1;

  if not found
    or v_status not in ('live', 'ended')
    or not v_scoreboard_revealed
  then
    return null;
  end if;

  with block_rows as (
    select
      item.block,
      item.ordinality::integer as block_index,
      item.block ->> 'id' as block_id,
      item.block ->> 'type' as block_type,
      case
        when jsonb_typeof(item.block -> 'points') = 'number'
          then (item.block ->> 'points')::integer
        else 0
      end as points,
      item.block ->> 'correctAnswer' as correct_answer
    from jsonb_array_elements(coalesce(v_lesson_snapshot -> 'blocks', '[]'::jsonb))
      with ordinality as item(block, ordinality)
  ),
  active_block as (
    select coalesce(max(block_index), 0) as active_index
    from block_rows
    where block_id = v_active_block_id
  ),
  scored_blocks as (
    select b.*
    from block_rows b
    cross join active_block a
    where (
      (
        b.block_type = 'quiz'
        and b.points > 0
        and nullif(b.correct_answer, '') is not null
      )
      or (
        b.block_type in ('open_text', 'exit_ticket', 'team_task')
        and b.points > 0
        and jsonb_typeof(b.block -> 'gradingRubric') = 'array'
        and jsonb_array_length(b.block -> 'gradingRubric') > 0
        and (
          select coalesce(sum((criterion.value ->> 'maxPoints')::integer), 0)
          from jsonb_array_elements(b.block -> 'gradingRubric') as criterion(value)
        ) = b.points
      )
    )
    and (
      v_status = 'ended'
      or b.block_index <= a.active_index
      or exists (
        select 1
        from public.responses r
        where r.session_id = p_session_id
          and r.block_id = b.block_id
      )
      or exists (
        select 1
        from public.response_evaluations e
        where e.session_id = p_session_id
          and e.block_id = b.block_id
      )
    )
  ),
  participant_scores as (
    select
      participant.id,
      coalesce(sum(
        case
          when block.block_type = 'quiz' then
            case
              when response.answer ->> 'choice' = block.correct_answer then block.points
              else 0
            end
          when block.block_type = 'team_task' then
            case
              when team_evaluation.id is null
                or team_evaluation.status in ('pending', 'grading', 'failed')
                then 0
              else coalesce(team_evaluation.teacher_score, team_evaluation.ai_score, 0)
            end
          else
            case
              when participant_evaluation.id is null
                or participant_evaluation.status in ('pending', 'grading', 'failed')
                then 0
              else coalesce(participant_evaluation.teacher_score, participant_evaluation.ai_score, 0)
            end
        end
      ), 0)::integer as score
    from public.participants participant
    cross join scored_blocks block
    left join public.responses response
      on block.block_type = 'quiz'
     and response.session_id = p_session_id
     and response.participant_id = participant.id
     and response.block_id = block.block_id
    left join public.response_evaluations participant_evaluation
      on block.block_type <> 'team_task'
     and block.block_type <> 'quiz'
     and participant_evaluation.session_id = p_session_id
     and participant_evaluation.participant_id = participant.id
     and participant_evaluation.block_id = block.block_id
    left join public.response_evaluations team_evaluation
      on block.block_type = 'team_task'
     and team_evaluation.session_id = p_session_id
     and team_evaluation.team_id = participant.team_id
     and team_evaluation.block_id = block.block_id
    where participant.session_id = p_session_id
    group by participant.id
  ),
  available as (
    select coalesce(sum(points), 0)::integer as max_points
    from scored_blocks
  ),
  mine as (
    select score
    from participant_scores
    where id = v_participant_id
  )
  select jsonb_build_object(
    'score', coalesce(mine.score, 0),
    'maxPoints', available.max_points,
    'rank', 1 + (
      select count(*)::integer
      from participant_scores other
      where other.score > coalesce(mine.score, 0)
    )
  )
  into v_result
  from available
  left join mine on true;

  return v_result;
end;
$$;

revoke all on function public.get_student_public_scoreboard(uuid, text) from public;
grant execute on function public.get_student_public_scoreboard(uuid, text) to anon, authenticated;
