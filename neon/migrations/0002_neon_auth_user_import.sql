-- Import the stable identity bridge into managed Neon Auth.
-- Run only through scripts/neon/auth-import.sh after the source verification
-- status has been refreshed from Supabase. Password hashes and sessions are
-- deliberately excluded; migrated users must set a new Neon Auth password.

do $block$
begin
  if to_regclass('neon_auth."user"') is null then
    raise exception 'Enable Neon Auth before importing users';
  end if;

  if to_regclass('app_identity.users') is null then
    raise exception 'Import the application identity bridge first';
  end if;

  if not exists (
    select 1 from app_identity.users where deleted_at is null
  ) then
    raise exception 'The application identity bridge has no active users';
  end if;

  if exists (
    select 1
    from app_identity.users
    where deleted_at is null
      and (email is null or email_verified is null)
  ) then
    raise exception 'Every active bridge identity needs an email and explicit verification state';
  end if;

  if exists (
    select 1
    from app_identity.users
    where deleted_at is null
      and id::text !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
  ) then
    raise exception 'The application identity bridge contains a non-UUID user ID';
  end if;

  if exists (
    select 1
    from neon_auth."user" target
    where not exists (
      select 1
      from app_identity.users bridge
      where bridge.deleted_at is null
        and bridge.id = target.id
        and lower(bridge.email) = lower(target.email)
    )
  ) then
    raise exception 'Neon Auth contains an identity outside the verified bridge';
  end if;

  if exists (
    select 1
    from app_identity.users bridge
    join neon_auth."user" target
      on lower(target.email) = lower(bridge.email)
     and target.id <> bridge.id
    where bridge.deleted_at is null
  ) then
    raise exception 'An email is already attached to a different Neon Auth UUID';
  end if;
end
$block$;

insert into neon_auth."user" (
  id,
  name,
  email,
  "emailVerified",
  image,
  "createdAt",
  "updatedAt",
  role,
  banned
)
select
  bridge.id,
  coalesce(
    nullif(bridge.raw_user_meta_data ->> 'full_name', ''),
    nullif(bridge.raw_user_meta_data ->> 'name', ''),
    bridge.email
  ),
  bridge.email,
  bridge.email_verified,
  nullif(bridge.raw_user_meta_data ->> 'avatar_url', ''),
  bridge.created_at,
  coalesce(bridge.updated_at, bridge.created_at, now()),
  'user',
  false
from app_identity.users bridge
where bridge.deleted_at is null
on conflict (id) do update
set name = excluded.name,
    email = excluded.email,
    "emailVerified" = excluded."emailVerified",
    image = coalesce(excluded.image, neon_auth."user".image),
    "updatedAt" = excluded."updatedAt";

-- There is intentionally no neon_auth.account insert. Supabase bcrypt hashes
-- are not compatible with managed Better Auth's scrypt verifier. The forgot-
-- password flow creates the credential account with a fresh compatible hash.
