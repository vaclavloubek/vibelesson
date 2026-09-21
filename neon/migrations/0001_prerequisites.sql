-- Run as the Neon database owner before restoring the Supabase application schemas.
-- This file is additive and idempotent.

create schema if not exists app_identity;
create schema if not exists extensions;

create extension if not exists pgcrypto with schema extensions;

do $block$
declare
  extension_schema text;
begin
  select n.nspname into extension_schema
  from pg_extension e
  join pg_namespace n on n.oid = e.extnamespace
  where e.extname = 'pgcrypto';

  if extension_schema <> 'extensions' then
    alter extension pgcrypto set schema extensions;
  end if;
end
$block$;

create table if not exists app_identity.users (
  id uuid primary key,
  email text,
  email_verified boolean,
  raw_user_meta_data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz,
  deleted_at timestamptz
);

alter table app_identity.users
  add column if not exists email_verified boolean;

comment on table app_identity.users is
  'Stable UUID identity bridge. Imported from Supabase Auth and retained while Neon Auth is validated.';

do $block$
begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then
    create role anon nologin noinherit;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then
    create role service_role nologin noinherit;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'app_service') then
    create role app_service nologin inherit;
  end if;
end
$block$;

revoke all on schema app_identity from public;
revoke all on app_identity.users from public;

-- Data API creates these roles. Fail early if it was not enabled first.
do $block$
begin
  if not exists (select 1 from pg_roles where rolname = 'authenticated')
    or not exists (select 1 from pg_roles where rolname = 'anonymous') then
    raise exception 'Enable Neon Data API before applying the compatibility migration';
  end if;
end
$block$;

-- Preserve the meaning of existing grants/policies during the staged port.
-- Neither compatibility role can log in. Neon Data API assumes `anonymous`;
-- trusted application SQL assumes `app_service` after a dedicated login is
-- provisioned outside this repository.
grant anon to anonymous;
grant service_role to app_service;
