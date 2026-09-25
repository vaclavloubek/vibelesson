-- Drop public.reconcile_live_control_events(uuid, jsonb) (audit B5, 2026-09-25).
--
-- It is the event-based live-control reconciliation from the Supabase era
-- (supabase/migrations/20260918050036). Nothing calls it any more: the teacher
-- view reconciles through /api/sessions/[id]/live-control/reconcile, which uses
-- reconcile_live_control_snapshot, and no other database function refers to it.
-- It was still SECURITY DEFINER and executable by `authenticated` (it only acts
-- on the caller's own session), and its 'start' branch set
-- timer_remaining_seconds to NULL even when the first block is a timer.
--
-- Idempotent. After applying, refresh the Neon Data API schema cache so the
-- dropped function disappears from the RPC surface.

drop function if exists public.reconcile_live_control_events(uuid, jsonb);
