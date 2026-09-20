-- Phase 2: run only after the application uses the server-only RPCs from phase 1.
-- This closes the remaining authenticated write paths that could skip trusted-device validation.

revoke insert on table public.sessions from authenticated;

revoke execute on function public.requeue_response_evaluation_for_teacher(uuid)
  from public, anon, authenticated, service_role;

comment on function public.requeue_response_evaluation_for_teacher(uuid) is
  'Legacy teacher regrade RPC retained for migration history only; direct API execution is revoked. Use requeue_response_evaluation_server through the trusted server boundary.';
