-- Protect organization ownership from invitation/member role edge cases.
-- Active members of an organization must not be re-invited, and the designated
-- owner cannot be demoted or removed except through the ownership-transfer RPC.

create or replace function private.protect_organization_designated_owner()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' then
    if old.status = 'active'
       and old.role = 'owner'
       and exists (
         select 1
         from public.organizations o
         where o.id = old.organization_id
           and o.owner_user_id = old.user_id
       ) then
      raise exception 'owner_cannot_be_removed' using errcode = '23514';
    end if;
    return old;
  end if;

  if old.status = 'active'
     and old.role = 'owner'
     and (
       new.status is distinct from old.status
       or new.role is distinct from old.role
     )
     and exists (
       select 1
       from public.organizations o
       where o.id = old.organization_id
         and o.owner_user_id = old.user_id
     ) then
    raise exception 'owner_role_locked' using errcode = '23514';
  end if;

  return new;
end;
$$;

revoke all on function private.protect_organization_designated_owner()
from public, anon, authenticated;

drop trigger if exists organization_memberships_protect_designated_owner
on public.organization_memberships;

create trigger organization_memberships_protect_designated_owner
before update of role, status or delete
on public.organization_memberships
for each row
execute function private.protect_organization_designated_owner();

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
as $$
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

  if v_existing_user_id is not null
     and exists (
       select 1
       from public.organization_memberships om
       where om.organization_id = p_organization_id
         and om.user_id = v_existing_user_id
         and om.status = 'active'
     ) then
    raise exception 'organization_member_already_active';
  end if;

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
$$;

create or replace function public.accept_organization_invitation(
  p_user_id uuid,
  p_email_normalized text,
  p_token_hash text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
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
      and om.organization_id = v_invite.organization_id
  ) then
    raise exception 'organization_member_already_active';
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
$$;

create or replace function public.transfer_organization_ownership(
  p_organization_id uuid,
  p_current_owner uuid,
  p_new_owner uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_internal_test boolean;
begin
  select o.is_internal_test
  into v_internal_test
  from public.organizations o
  where o.id = p_organization_id
  for update;

  if not found then
    raise exception 'organization_not_found';
  end if;

  if v_internal_test then
    raise exception 'internal_test_owner_is_locked';
  end if;

  if p_current_owner = p_new_owner then
    raise exception 'new_owner_must_differ';
  end if;

  if not exists (
    select 1
    from public.organization_memberships om
    where om.organization_id = p_organization_id
      and om.user_id = p_current_owner
      and om.status = 'active'
      and om.role = 'owner'
  ) then
    raise exception 'current_owner_required';
  end if;

  if not exists (
    select 1
    from public.organization_memberships om
    where om.organization_id = p_organization_id
      and om.user_id = p_new_owner
      and om.status = 'active'
      and om.role in ('admin', 'teacher')
  ) then
    raise exception 'new_owner_must_be_active_member';
  end if;

  update public.organizations
  set owner_user_id = p_new_owner,
      updated_at = now()
  where id = p_organization_id;

  update public.organization_memberships
  set role = 'admin',
      updated_at = now()
  where organization_id = p_organization_id
    and user_id = p_current_owner
    and status = 'active';

  update public.organization_memberships
  set role = 'owner',
      updated_at = now()
  where organization_id = p_organization_id
    and user_id = p_new_owner
    and status = 'active';
end;
$$;

revoke execute on function public.create_organization_invitation(
  uuid, uuid, text, text, text, text, timestamptz
) from public, anon, authenticated;
grant execute on function public.create_organization_invitation(
  uuid, uuid, text, text, text, text, timestamptz
) to service_role;

revoke execute on function public.accept_organization_invitation(
  uuid, text, text
) from public, anon, authenticated;
grant execute on function public.accept_organization_invitation(
  uuid, text, text
) to service_role;

revoke execute on function public.transfer_organization_ownership(
  uuid, uuid, uuid
) from public, anon, authenticated;
grant execute on function public.transfer_organization_ownership(
  uuid, uuid, uuid
) to service_role;
