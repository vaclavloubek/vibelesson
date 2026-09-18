revoke execute on function public.reconcile_live_control_snapshot(uuid, jsonb) from public;
revoke execute on function public.reconcile_live_control_snapshot(uuid, jsonb) from anon;
revoke execute on function public.reconcile_live_control_snapshot(uuid, jsonb) from service_role;
grant execute on function public.reconcile_live_control_snapshot(uuid, jsonb) to authenticated;
