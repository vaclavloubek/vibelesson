-- A full refund pauses AI only while the user still has a live individual
-- subscription (2026-09-26).
--
-- Before: any open full refund in private.individual_billing_refunds returned
-- 'refund', even after the subscription had ended. A user on Free then kept
-- paused AI (and the "payment was refunded" banner) permanently. Terms
-- article 6 only allow restricting new *paid* AI operations.
--
-- Only the 'refund' branch changes: it now also requires a LIVE Stripe
-- subscription of an individual plan in trialing/active/past_due, the same
-- lookup as the 'past_due' branch. Branch order, the admin, organization,
-- dispute and past_due branches, signature, SECURITY DEFINER, search_path and
-- grants stay as they were. Refund rows are not touched.
--
-- Idempotent (create or replace).

create or replace function private.individual_ai_billing_pause_reason(p_user_id uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $function$
  select case
    when exists (
      select 1
      from public.profiles p
      where p.id = p_user_id
        and p.role = 'admin'
    ) then null
    when exists (
      select 1
      from public.organization_memberships m
      join public.organizations o on o.id = m.organization_id
      where m.user_id = p_user_id
        and m.status = 'active'
        and m.revoked_at is null
        and o.status = 'active'
    ) then null
    when exists (
      select 1
      from private.individual_billing_disputes d
      where d.provider = 'stripe'
        and d.livemode = true
        and d.user_id = p_user_id
        and d.released_at is null
    ) then 'dispute'
    when exists (
      select 1
      from private.individual_billing_refunds r
      where r.provider = 'stripe'
        and r.livemode = true
        and r.user_id = p_user_id
        and r.full_refund
        and r.released_at is null
    ) and exists (
      select 1
      from public.billing_subscriptions bs
      join public.billing_plans bp on bp.code = bs.plan_code
      where bs.user_id = p_user_id
        and bs.provider = 'stripe'
        and bs.livemode = true
        and bs.status in ('trialing', 'active', 'past_due')
        and bp.audience = 'individual'
    ) then 'refund'
    when coalesce((
      select bs.status = 'past_due'
      from public.billing_subscriptions bs
      join public.billing_plans bp on bp.code = bs.plan_code
      where bs.user_id = p_user_id
        and bs.provider = 'stripe'
        and bs.livemode = true
        and bs.status in ('trialing', 'active', 'past_due')
        and bp.audience = 'individual'
      order by bp.access_rank desc, bs.updated_at desc
      limit 1
    ), false) then 'past_due'
    else null
  end;
$function$;

revoke all on function private.individual_ai_billing_pause_reason(uuid)
  from public, anon, authenticated, service_role;
