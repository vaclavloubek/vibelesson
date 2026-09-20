-- Phase 2: activate after the application registers organization devices through
-- register_trusted_device_access. This extends the existing DB write-boundary
-- validator from individual Teacher/Teacher Pro accounts to active organization members.

create or replace function private.personal_trusted_device_hash_valid(
  p_user_id uuid,
  p_token_hash text
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $function$
  with ctx as (
    select
      p.role,
      private.active_trusted_device_organization(p.id) as organization_id
    from public.profiles p
    where p.id = p_user_id
  )
  select coalesce((
    select case
      when ctx.role = 'admin' then true
      when ctx.organization_id is not null then (
        coalesce(p_token_hash ~ '^[0-9a-f]{64}$', false)
        and exists (
          select 1
          from private.organization_user_trusted_devices d
          where d.organization_id = ctx.organization_id
            and d.user_id = p_user_id
            and d.token_hash = p_token_hash
            and d.revoked_at is null
        )
      )
      when not private.personal_trusted_device_policy_required(p_user_id) then true
      else (
        coalesce(p_token_hash ~ '^[0-9a-f]{64}$', false)
        and exists (
          select 1
          from private.user_trusted_devices d
          where d.user_id = p_user_id
            and d.token_hash = p_token_hash
            and d.revoked_at is null
        )
      )
    end
    from ctx
  ), false);
$function$;

revoke all on function private.personal_trusted_device_hash_valid(uuid, text)
  from public, anon, authenticated, service_role;

comment on function private.personal_trusted_device_hash_valid(uuid, text) is
  'DB-authoritative trusted-device validator used by paid write boundaries. Validates organization-scoped devices for active organization members, individual devices for Teacher/Teacher Pro, and exempts internal admins.';
