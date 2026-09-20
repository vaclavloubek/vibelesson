-- Production follow-up for phase 1: SQL NULL must not be accepted as a valid device hash.
-- Fresh databases already get the corrected helper from the preceding migration; this
-- migration keeps repository history aligned with the production rollout.

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
  select
    exists (
      select 1
      from public.profiles p
      where p.id = p_user_id
    )
    and (
      not private.personal_trusted_device_policy_required(p_user_id)
      or (
        coalesce(p_token_hash ~ '^[0-9a-f]{64}$', false)
        and exists (
          select 1
          from private.user_trusted_devices d
          where d.user_id = p_user_id
            and d.token_hash = p_token_hash
            and d.revoked_at is null
        )
      )
    );
$function$;

revoke all on function private.personal_trusted_device_hash_valid(uuid, text)
  from public, anon, authenticated, service_role;
