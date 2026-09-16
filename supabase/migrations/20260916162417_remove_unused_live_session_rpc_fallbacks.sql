drop trigger if exists sessions_realtime_invalidation on public.sessions;
drop trigger if exists participants_realtime_invalidation on public.participants;

drop function if exists public.broadcast_live_session_invalidation();
drop function if exists public.get_live_student_state(uuid, text);
drop function if exists public.join_live_session(text, text, text);
drop function if exists public.control_live_session(uuid, text);
drop function if exists public.create_live_session(uuid, text);
