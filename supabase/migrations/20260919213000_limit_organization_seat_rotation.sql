-- Limit organization seat rotation per paid billing period.
--
-- Two independent limits are enforced:
--   1. simultaneous non-internal-admin active members <= billing_plans.seat_limit
--   2. unique non-internal-admin users during one billing period <=
--      seat_limit + max(1, ceil(seat_limit * 10%))
--
-- A returning user in the same billing period does not consume another replacement.
-- Pending invitations do not consume historical usage, but invitations for people
-- who have not yet used a seat in the period reserve remaining replacement capacity.
-- Syllonaut application admins are excluded from commercial seat accounting.

create table if not exists private.organization_seat_activations (
  organization_id uuid not null
    references public.organizations(id) on delete cascade,
  user_id uuid not null
    references auth.users(id) on delete cascade,
  period_start timestamptz not null,
  period_end timestamptz not null,
  activated_at timestamptz not null default now(),
  primary key (organization_id, user_id, period_start),
  check (period_end > period_start)
);

alter table private.organization_seat_activations enable row level security;
revoke all on table private.organization_seat_activations
  from public, anon, authenticated, service_role;

create index if not exists organization_seat_activations_period_idx
  on private.organization_seat_activations (organization_id, period_start, user_id);

comment on table private.organization_seat_activations is
  'Immutable per-billing-period history of non-internal-admin users who consumed an organization seat.';

create or replace function private.organization_seat_period_bounds(
  p_organization_id uuid,
  out period_start timestamptz,
  out period_end timestamptz
)
returns record
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare
  v_start timestamptz;
  v_end timestamptz;
  v_internal boolean;
begin
  select o.current_period_start, o.current_period_end, o.is_internal_test
  into v_start, v_end, v_internal
  from public.organizations o
  where o.id = p_organization_id;

  if not found then
    period_start := null;
    period_end := null;
    return;
  end if;

  if v_start is not null and v_end is not null and v_end > v_start then
    period_start := v_start;
    period_end := v_end;
    return;
  end if;

  -- The internal Testovací škola has no Stripe billing period. Give it a UTC
  -- calendar-month test period so rotation safeguards remain testable there.
  if coalesce(v_internal, false) then
    period_start := date_trunc('month', now() at time zone 'UTC') at time zone 'UTC';
    period_end := period_start + interval '1 month';
    return;
  end if;

  period_start := null;
  period_end := null;
end;
$function$;

revoke all on function private.organization_seat_period_bounds(uuid)
  from public, anon, authenticated, service_role;

create or replace function private.organization_seat_unique_used(
  p_organization_id uuid,
  p_period_start timestamptz
)
returns integer
language sql
stable
security definer
set search_path = ''
as $function$
  select count(distinct used.user_id)::integer
  from (
    select a.user_id
    from private.organization_seat_activations a
    left join public.profiles p on p.id = a.user_id
    where a.organization_id = p_organization_id
      and a.period_start = p_period_start
      and coalesce(p.role, 'user') <> 'admin'

    union

    -- Active members count in a newly started billing period even before any
    -- membership row is rewritten in that period.
    select m.user_id
    from public.organization_memberships m
    left join public.profiles p on p.id = m.user_id
    where m.organization_id = p_organization_id
      and m.status = 'active'
      and coalesce(p.role, 'user') <> 'admin'
  ) used;
$function$;

revoke all on function private.organization_seat_unique_used(uuid, timestamptz)
  from public, anon, authenticated, service_role;

create or replace function private.organization_pending_new_seat_reservations(
  p_organization_id uuid,
  p_period_start timestamptz
)
returns integer
language sql
stable
security definer
set search_path = ''
as $function$
  select count(distinct i.email_normalized)::integer
  from public.organization_invitations i
  left join auth.users u
    on lower(trim(u.email)) = i.email_normalized
  left join public.profiles p
    on p.id = u.id
  where i.organization_id = p_organization_id
    and i.status = 'pending'
    and i.expires_at > now()
    -- Known internal admins do not reserve commercial capacity. Unknown emails
    -- are conservatively treated as normal users until they authenticate.
    and coalesce(p.role, 'user') <> 'admin'
    and not exists (
      select 1
      from private.organization_seat_activations a
      where u.id is not null
        and a.organization_id = p_organization_id
        and a.user_id = u.id
        and a.period_start = p_period_start
    )
    and not exists (
      select 1
      from public.organization_memberships m
      where u.id is not null
        and m.organization_id = p_organization_id
        and m.user_id = u.id
        and m.status = 'active'
    );
$function$;

revoke all on function private.organization_pending_new_seat_reservations(uuid, timestamptz)
  from public, anon, authenticated, service_role;

create or replace function private.organization_active_seat_count(
  p_organization_id uuid,
  p_exclude_user_id uuid default null
)
returns integer
language sql
stable
security definer
set search_path = ''
as $function$
  select count(*)::integer
  from public.organization_memberships m
  left join public.profiles p on p.id = m.user_id
  where m.organization_id = p_organization_id
    and m.status = 'active'
    and coalesce(p.role, 'user') <> 'admin'
    and (p_exclude_user_id is null or m.user_id <> p_exclude_user_id);
$function$;

revoke all on function private.organization_active_seat_count(uuid, uuid)
  from public, anon, authenticated, service_role;

create or replace function private.organization_pending_seat_count(
  p_organization_id uuid
)
returns integer
language sql
stable
security definer
set search_path = ''
as $function$
  select count(*)::integer
  from public.organization_invitations i
  left join auth.users u
    on lower(trim(u.email)) = i.email_normalized
  left join public.profiles p
    on p.id = u.id
  where i.organization_id = p_organization_id
    and i.status = 'pending'
    and i.expires_at > now()
    and coalesce(p.role, 'user') <> 'admin';
$function$;

revoke all on function private.organization_pending_seat_count(uuid)
  from public, anon, authenticated, service_role;

create or replace function private.enforce_organization_membership_seat_policy()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_app_role text;
  v_seat_limit integer;
  v_active_count integer;
  v_period_start timestamptz;
  v_period_end timestamptz;
  v_unique_used integer;
  v_replacement_allowance integer;
  v_unique_limit integer;
  v_already_used boolean;
begin
  select p.role
  into v_app_role
  from public.profiles p
  where p.id = new.user_id;

  -- Internal Syllonaut admins do not consume commercial seats or replacements.
  if coalesce(v_app_role, 'user') = 'admin' then
    return new;
  end if;

  select bp.seat_limit
  into v_seat_limit
  from public.organizations o
  join public.billing_plans bp on bp.code = o.plan_code
  where o.id = new.organization_id
  for update of o;

  if not found or v_seat_limit is null or v_seat_limit <= 0 then
    raise exception 'organization_plan_invalid' using errcode = 'P0001';
  end if;

  select b.period_start, b.period_end
  into v_period_start, v_period_end
  from private.organization_seat_period_bounds(new.organization_id) b;

  if tg_op = 'UPDATE' then
    -- Preserve current-period history when a member is removed.
    if old.status = 'active' and new.status <> 'active' then
      if v_period_start is not null and v_period_end is not null then
        insert into private.organization_seat_activations (
          organization_id, user_id, period_start, period_end, activated_at
        )
        values (
          new.organization_id,
          new.user_id,
          v_period_start,
          v_period_end,
          greatest(old.joined_at, v_period_start)
        )
        on conflict (organization_id, user_id, period_start) do nothing;
      end if;
      return new;
    end if;

    -- Role-only edits or an already-active member do not consume another activation.
    if old.status = 'active' and new.status = 'active' then
      return new;
    end if;
  end if;

  if new.status <> 'active' then
    return new;
  end if;

  v_active_count := private.organization_active_seat_count(
    new.organization_id,
    new.user_id
  );

  if v_active_count >= v_seat_limit then
    raise exception 'organization_seat_limit_reached' using errcode = 'P0001';
  end if;

  -- Before first paid activation there is no billing period to rotate within.
  -- The simultaneous seat cap still applies.
  if v_period_start is null or v_period_end is null then
    return new;
  end if;

  select exists (
    select 1
    from private.organization_seat_activations a
    where a.organization_id = new.organization_id
      and a.user_id = new.user_id
      and a.period_start = v_period_start
  )
  into v_already_used;

  v_unique_used := private.organization_seat_unique_used(
    new.organization_id,
    v_period_start
  );
  v_replacement_allowance := greatest(
    1,
    ceil(v_seat_limit::numeric * 0.10)::integer
  );
  v_unique_limit := v_seat_limit + v_replacement_allowance;

  if not v_already_used and v_unique_used >= v_unique_limit then
    raise exception 'organization_replacement_limit_reached' using errcode = 'P0001';
  end if;

  insert into private.organization_seat_activations (
    organization_id,
    user_id,
    period_start,
    period_end
  )
  values (
    new.organization_id,
    new.user_id,
    v_period_start,
    v_period_end
  )
  on conflict (organization_id, user_id, period_start) do nothing;

  return new;
end;
$function$;

revoke all on function private.enforce_organization_membership_seat_policy()
  from public, anon, authenticated, service_role;

drop trigger if exists organization_memberships_enforce_seat_policy
  on public.organization_memberships;
create trigger organization_memberships_enforce_seat_policy
before insert or update of status on public.organization_memberships
for each row
execute function private.enforce_organization_membership_seat_policy();

-- Backfill current-period history from the membership interval we already know.
with organization_periods as (
  select
    o.id as organization_id,
    case
      when o.current_period_start is not null
       and o.current_period_end is not null
       and o.current_period_end > o.current_period_start
        then o.current_period_start
      when o.is_internal_test
        then date_trunc('month', now() at time zone 'UTC') at time zone 'UTC'
      else null
    end as period_start,
    case
      when o.current_period_start is not null
       and o.current_period_end is not null
       and o.current_period_end > o.current_period_start
        then o.current_period_end
      when o.is_internal_test
        then (date_trunc('month', now() at time zone 'UTC') at time zone 'UTC') + interval '1 month'
      else null
    end as period_end
  from public.organizations o
)
insert into private.organization_seat_activations (
  organization_id,
  user_id,
  period_start,
  period_end,
  activated_at
)
select
  m.organization_id,
  m.user_id,
  op.period_start,
  op.period_end,
  greatest(m.joined_at, op.period_start)
from public.organization_memberships m
join organization_periods op
  on op.organization_id = m.organization_id
left join public.profiles p
  on p.id = m.user_id
where op.period_start is not null
  and op.period_end is not null
  and coalesce(p.role, 'user') <> 'admin'
  and m.joined_at < op.period_end
  and coalesce(m.revoked_at, 'infinity'::timestamptz) >= op.period_start
on conflict (organization_id, user_id, period_start) do nothing;

create or replace function public.create_organization_invitation(
  p_organization_id uuid,
  p_created_by uuid,
  p_email_normalized text,
  p_role text,
  p_locale text,
  p_token_hash text,
  p_expires_at timestamptz
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_seat_limit integer;
  v_active_count integer;
  v_pending_count integer;
  v_invite_id uuid;
  v_period_start timestamptz;
  v_period_end timestamptz;
  v_unique_used integer;
  v_pending_new integer;
  v_replacement_allowance integer;
  v_unique_limit integer;
  v_existing_user_id uuid;
  v_existing_app_role text;
  v_candidate_already_used boolean := false;
  v_candidate_consumes_seat boolean := true;
  v_email text := lower(trim(p_email_normalized));
begin
  if p_role not in ('admin', 'teacher') then
    raise exception 'invalid_invitation_role';
  end if;
  if p_locale not in ('cs', 'en') then
    raise exception 'invalid_locale';
  end if;

  if not exists (
    select 1
    from public.organization_memberships om
    where om.organization_id = p_organization_id
      and om.user_id = p_created_by
      and om.status = 'active'
      and om.role in ('owner', 'admin')
  ) then
    raise exception 'organization_admin_required';
  end if;

  select bp.seat_limit
  into v_seat_limit
  from public.organizations o
  join public.billing_plans bp on bp.code = o.plan_code
  where o.id = p_organization_id
  for update of o;

  if not found or v_seat_limit is null then
    raise exception 'organization_plan_invalid';
  end if;

  update public.organization_invitations
  set status = 'expired', updated_at = now()
  where organization_id = p_organization_id
    and status = 'pending'
    and expires_at <= now();

  select u.id
  into v_existing_user_id
  from auth.users u
  where lower(trim(u.email)) = v_email
  limit 1;

  if v_existing_user_id is not null then
    select p.role
    into v_existing_app_role
    from public.profiles p
    where p.id = v_existing_user_id;

    if coalesce(v_existing_app_role, 'user') = 'admin' then
      v_candidate_consumes_seat := false;
    end if;
  end if;

  v_active_count := private.organization_active_seat_count(p_organization_id, null);
  v_pending_count := private.organization_pending_seat_count(p_organization_id);

  if v_candidate_consumes_seat
     and v_active_count + v_pending_count >= v_seat_limit then
    raise exception 'organization_seat_limit_reached';
  end if;

  select b.period_start, b.period_end
  into v_period_start, v_period_end
  from private.organization_seat_period_bounds(p_organization_id) b;

  if v_candidate_consumes_seat
     and v_period_start is not null
     and v_period_end is not null then
    if v_existing_user_id is not null then
      select
        exists (
          select 1
          from private.organization_seat_activations a
          where a.organization_id = p_organization_id
            and a.user_id = v_existing_user_id
            and a.period_start = v_period_start
        )
        or exists (
          select 1
          from public.organization_memberships m
          where m.organization_id = p_organization_id
            and m.user_id = v_existing_user_id
            and m.status = 'active'
        )
      into v_candidate_already_used;
    end if;

    if not v_candidate_already_used then
      v_unique_used := private.organization_seat_unique_used(
        p_organization_id,
        v_period_start
      );
      v_pending_new := private.organization_pending_new_seat_reservations(
        p_organization_id,
        v_period_start
      );
      v_replacement_allowance := greatest(
        1,
        ceil(v_seat_limit::numeric * 0.10)::integer
      );
      v_unique_limit := v_seat_limit + v_replacement_allowance;

      if v_unique_used + v_pending_new >= v_unique_limit then
        raise exception 'organization_replacement_limit_reached';
      end if;
    end if;
  end if;

  insert into public.organization_invitations (
    organization_id,
    email_normalized,
    role,
    locale,
    token_hash,
    created_by,
    expires_at
  )
  values (
    p_organization_id,
    v_email,
    p_role,
    p_locale,
    p_token_hash,
    p_created_by,
    p_expires_at
  )
  returning id into v_invite_id;

  return v_invite_id;
end;
$function$;

revoke all on function public.create_organization_invitation(
  uuid, uuid, text, text, text, text, timestamptz
) from public, anon, authenticated;
grant execute on function public.create_organization_invitation(
  uuid, uuid, text, text, text, text, timestamptz
) to service_role;

create or replace function public.accept_organization_invitation(
  p_user_id uuid,
  p_email_normalized text,
  p_token_hash text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_invite public.organization_invitations%rowtype;
  v_seat_limit integer;
  v_active_count integer;
  v_app_role text;
begin
  select *
  into v_invite
  from public.organization_invitations
  where token_hash = p_token_hash
  for update;

  if not found then raise exception 'invitation_not_found'; end if;
  if v_invite.status <> 'pending' then raise exception 'invitation_not_pending'; end if;

  if v_invite.expires_at <= now() then
    update public.organization_invitations
    set status = 'expired', updated_at = now()
    where id = v_invite.id;
    raise exception 'invitation_expired';
  end if;

  if v_invite.email_normalized <> lower(trim(p_email_normalized)) then
    raise exception 'invitation_email_mismatch';
  end if;

  if exists (
    select 1
    from public.organization_memberships om
    where om.user_id = p_user_id
      and om.status = 'active'
      and om.organization_id <> v_invite.organization_id
  ) then
    raise exception 'active_organization_membership_exists';
  end if;

  select bp.seat_limit
  into v_seat_limit
  from public.organizations o
  join public.billing_plans bp on bp.code = o.plan_code
  where o.id = v_invite.organization_id
  for update of o;

  if not found or v_seat_limit is null then
    raise exception 'organization_plan_invalid';
  end if;

  select p.role
  into v_app_role
  from public.profiles p
  where p.id = p_user_id;

  if coalesce(v_app_role, 'user') <> 'admin' then
    v_active_count := private.organization_active_seat_count(
      v_invite.organization_id,
      p_user_id
    );

    if v_active_count >= v_seat_limit then
      raise exception 'organization_seat_limit_reached';
    end if;
  end if;

  insert into public.organization_memberships (
    organization_id,
    user_id,
    role,
    status,
    revoked_at
  )
  values (
    v_invite.organization_id,
    p_user_id,
    v_invite.role,
    'active',
    null
  )
  on conflict (organization_id, user_id)
  do update set
    role = excluded.role,
    status = 'active',
    revoked_at = null,
    joined_at = now(),
    updated_at = now();

  -- The membership trigger above performs the unique-user-period check
  -- atomically under the same organization row lock.
  update public.organization_invitations
  set status = 'accepted',
      accepted_by = p_user_id,
      accepted_at = now(),
      updated_at = now()
  where id = v_invite.id;

  return jsonb_build_object(
    'organizationId', v_invite.organization_id,
    'role', v_invite.role
  );
end;
$function$;

revoke all on function public.accept_organization_invitation(uuid, text, text)
  from public, anon, authenticated;
grant execute on function public.accept_organization_invitation(uuid, text, text)
  to service_role;

create or replace function public.get_organization_seat_usage(
  p_organization_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare
  v_seat_limit integer;
  v_active_count integer;
  v_pending_count integer;
  v_period_start timestamptz;
  v_period_end timestamptz;
  v_unique_used integer := 0;
  v_pending_new integer := 0;
  v_replacement_allowance integer;
  v_unique_limit integer;
begin
  select bp.seat_limit
  into v_seat_limit
  from public.organizations o
  join public.billing_plans bp on bp.code = o.plan_code
  where o.id = p_organization_id;

  if not found or v_seat_limit is null then
    raise exception 'organization_plan_invalid';
  end if;

  v_active_count := private.organization_active_seat_count(p_organization_id, null);
  v_pending_count := private.organization_pending_seat_count(p_organization_id);

  select b.period_start, b.period_end
  into v_period_start, v_period_end
  from private.organization_seat_period_bounds(p_organization_id) b;

  v_replacement_allowance := greatest(
    1,
    ceil(v_seat_limit::numeric * 0.10)::integer
  );
  v_unique_limit := v_seat_limit + v_replacement_allowance;

  if v_period_start is not null and v_period_end is not null then
    v_unique_used := private.organization_seat_unique_used(
      p_organization_id,
      v_period_start
    );
    v_pending_new := private.organization_pending_new_seat_reservations(
      p_organization_id,
      v_period_start
    );
  end if;

  return jsonb_build_object(
    'active', v_active_count,
    'pending', v_pending_count,
    'limit', v_seat_limit,
    'periodUniqueUsed', v_unique_used,
    'periodUniqueLimit', v_unique_limit,
    'replacementAllowance', v_replacement_allowance,
    'pendingNewReservations', v_pending_new,
    'periodStart', v_period_start,
    'periodEnd', v_period_end
  );
end;
$function$;

revoke all on function public.get_organization_seat_usage(uuid)
  from public, anon, authenticated;
grant execute on function public.get_organization_seat_usage(uuid)
  to service_role;

comment on function private.enforce_organization_membership_seat_policy() is
  'Atomically enforces simultaneous organization seats and the per-billing-period unique-user replacement allowance.';
comment on function public.get_organization_seat_usage(uuid) is
  'Service-role-only organization seat and replacement-capacity summary for the school administration UI.';
