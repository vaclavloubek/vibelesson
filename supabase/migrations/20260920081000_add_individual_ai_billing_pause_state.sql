-- Phase 1: expose the current individual AI payment pause state to trusted server code.
-- Entitlements remain paid while past_due; only variable-cost AI is paused.

create or replace function private.individual_ai_billing_paused(
  p_user_id uuid
)
returns boolean
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
    ) then false
    when exists (
      select 1
      from public.organization_memberships m
      join public.organizations o on o.id = m.organization_id
      where m.user_id = p_user_id
        and m.status = 'active'
        and m.revoked_at is null
        and o.status = 'active'
    ) then false
    else coalesce((
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
    ), false)
  end;
$function$;

revoke all on function private.individual_ai_billing_paused(uuid)
  from public, anon, authenticated, service_role;

create or replace function public.get_individual_ai_billing_paused_server(
  p_user_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $function$
  select private.individual_ai_billing_paused(p_user_id);
$function$;

revoke all on function public.get_individual_ai_billing_paused_server(uuid)
  from public, anon, authenticated;
grant execute on function public.get_individual_ai_billing_paused_server(uuid)
  to service_role;

comment on function public.get_individual_ai_billing_paused_server(uuid) is
  'Service-role-only current payment-state gate for individual AI costs. Active organization access and internal admins are exempt.';
