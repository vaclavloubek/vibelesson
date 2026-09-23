-- Restore the Supabase grants that the remaining user-scoped Data API calls rely on.
-- The import used pg_dump --no-acl, so `authenticated` currently has no table
-- privileges and cannot execute these caller-scoped RPCs. Idempotent.

-- Own-row reads only: RLS policy users_can_view_own_profile (auth.uid() = id).
grant select (id, role, active_plan_code, marketing_email_consent, worksheet_export_enabled)
  on public.profiles to authenticated;

-- SECURITY DEFINER functions that act only on auth.uid(); same grants as Supabase.
grant execute on function public.get_ai_quota() to authenticated;
grant execute on function public.set_ui_locale(text) to authenticated;
grant execute on function public.set_marketing_email_consent(boolean) to authenticated;
