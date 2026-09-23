-- Apply only after Neon Auth users have been imported and the auth-preflight
-- gate passes. Existing Syllonaut foreign keys require the original Supabase
-- UUID to be preserved as neon_auth.user.id.

do $block$
begin
  if to_regclass('neon_auth."user"') is null then
    raise exception 'Enable Neon Auth before applying identity synchronization';
  end if;

  if exists (
    select 1
    from neon_auth."user" u
    where coalesce(to_jsonb(u) ->> 'id', '') !~*
      '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
  ) then
    raise exception 'Neon Auth contains non-UUID user IDs; aborting identity bridge setup';
  end if;
end
$block$;

create or replace function app_identity.sync_neon_auth_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare
  payload jsonb := to_jsonb(new);
  resolved_id uuid := (payload ->> 'id')::uuid;
  resolved_email text := nullif(payload ->> 'email', '');
  resolved_name text := nullif(payload ->> 'name', '');
  resolved_email_verified boolean := coalesce((payload ->> 'emailVerified')::boolean, false);
begin
  insert into app_identity.users (
    id,
    email,
    email_verified,
    raw_user_meta_data,
    created_at,
    updated_at
  )
  values (
    resolved_id,
    resolved_email,
    resolved_email_verified,
    case when resolved_name is null then '{}'::jsonb else jsonb_build_object('full_name', resolved_name) end,
    now(),
    now()
  )
  on conflict (id) do update
    set email = coalesce(excluded.email, app_identity.users.email),
        email_verified = excluded.email_verified,
        raw_user_meta_data = case
          when resolved_name is null then app_identity.users.raw_user_meta_data
          else app_identity.users.raw_user_meta_data || jsonb_build_object('full_name', resolved_name)
        end,
        updated_at = now();

  return new;
end;
$function$;

revoke all on function app_identity.sync_neon_auth_user() from public, anonymous, authenticated;

drop trigger if exists syllonaut_sync_app_identity on neon_auth."user";
create trigger syllonaut_sync_app_identity
after insert or update of id, email, name, "emailVerified" on neon_auth."user"
for each row execute function app_identity.sync_neon_auth_user();

insert into app_identity.users (
  id,
  email,
  email_verified,
  raw_user_meta_data,
  created_at,
  updated_at
)
select
  (to_jsonb(u) ->> 'id')::uuid,
  nullif(to_jsonb(u) ->> 'email', ''),
  coalesce((to_jsonb(u) ->> 'emailVerified')::boolean, false),
  case
    when nullif(to_jsonb(u) ->> 'name', '') is null then '{}'::jsonb
    else jsonb_build_object('full_name', to_jsonb(u) ->> 'name')
  end,
  now(),
  now()
from neon_auth."user" u
on conflict (id) do update
  set email = coalesce(excluded.email, app_identity.users.email),
      email_verified = excluded.email_verified,
      updated_at = now();
