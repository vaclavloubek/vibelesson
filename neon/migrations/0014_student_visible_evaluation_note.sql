-- Students see a teacher-confirmed evaluation of their own answer. A teacher
-- note is shown to the student only when the teacher wrote it as a note for
-- the student (new review form). Older notes were written as private and the
-- automatic integrity note is never shown, so both keep the default false.
--
-- 1. Additive column with a constant default (metadata-only, no table rewrite).
-- 2. New 4-argument overload of review_response_evaluation. The 3-argument
--    version stays unchanged for the previous app build during rollout.
-- Idempotent.

alter table public.response_evaluations
  add column if not exists teacher_note_for_student boolean not null default false;

create or replace function public.review_response_evaluation(
  p_evaluation_id uuid,
  p_teacher_score integer,
  p_teacher_note text,
  p_note_for_student boolean
)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_user_id uuid := auth.uid();
  v_max_points integer;
  v_status text;
  v_result jsonb;
begin
  if v_user_id is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;

  select e.max_points, e.status
  into v_max_points, v_status
  from public.response_evaluations e
  where e.id = p_evaluation_id
    and exists (
      select 1 from public.sessions s
      where s.id = e.session_id
        and s.teacher_id = v_user_id
    );

  if not found then
    return null;
  end if;

  if v_status not in ('graded', 'needs_review') then
    raise exception 'Evaluation is not ready for teacher review' using errcode = '22023';
  end if;

  if p_teacher_score < 0 or p_teacher_score > v_max_points then
    raise exception 'Teacher score out of range' using errcode = '22023';
  end if;

  if p_teacher_note is not null and char_length(p_teacher_note) > 1000 then
    raise exception 'Teacher note too long' using errcode = '22023';
  end if;

  update public.response_evaluations e
  set teacher_score = p_teacher_score,
      teacher_confirmed = true,
      teacher_reviewed_at = now(),
      teacher_note = nullif(btrim(p_teacher_note), ''),
      teacher_note_for_student = coalesce(p_note_for_student, false)
        and nullif(btrim(p_teacher_note), '') is not null,
      updated_at = now()
  where e.id = p_evaluation_id
  returning jsonb_build_object(
    'id', e.id,
    'teacher_score', e.teacher_score,
    'teacher_confirmed', e.teacher_confirmed,
    'teacher_reviewed_at', e.teacher_reviewed_at,
    'teacher_note', e.teacher_note
  ) into v_result;

  return v_result;
end;
$function$;

revoke all on function public.review_response_evaluation(uuid, integer, text, boolean) from public, anon, anonymous;
grant execute on function public.review_response_evaluation(uuid, integer, text, boolean) to authenticated;

notify pgrst, 'reload schema';
