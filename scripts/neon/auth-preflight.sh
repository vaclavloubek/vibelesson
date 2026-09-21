#!/usr/bin/env bash
set -euo pipefail

TARGET_DATABASE_URL="${NEON_DATABASE_URL_UNPOOLED:-${NEON_DATABASE_URL:-}}"
: "${TARGET_DATABASE_URL:?NEON_DATABASE_URL_UNPOOLED or NEON_DATABASE_URL is required}"

target_table="$(psql "$TARGET_DATABASE_URL" -X -v ON_ERROR_STOP=1 -Atc "select coalesce(to_regclass('neon_auth.\"user\"')::text, '')")"

if [[ -z "$target_table" ]]; then
  echo 'FAIL: Neon Auth is not enabled on the target branch.' >&2
  exit 1
fi

target_count="$(psql "$TARGET_DATABASE_URL" -X -v ON_ERROR_STOP=1 -Atc 'select count(*) from neon_auth."user"')"
bridge_count="$(psql "$TARGET_DATABASE_URL" -X -v ON_ERROR_STOP=1 -Atc 'select count(*) from app_identity.users where deleted_at is null')"
non_uuid_count="$(psql "$TARGET_DATABASE_URL" -X -v ON_ERROR_STOP=1 -Atc "
  select count(*) from neon_auth.\"user\" u
  where coalesce(to_jsonb(u)->>'id','') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'")"

if [[ "$non_uuid_count" != "0" ]]; then
  echo "FAIL: Neon Auth has $non_uuid_count non-UUID user IDs; existing ownership references would break." >&2
  exit 1
fi

bridge_identity="$(psql "$TARGET_DATABASE_URL" -X -v ON_ERROR_STOP=1 -Atc "
  select count(*)::text || ':' || md5(coalesce(string_agg(id::text || ':' || lower(coalesce(email,'')), ',' order by id),''))
  from app_identity.users where deleted_at is null")"
target_identity="$(psql "$TARGET_DATABASE_URL" -X -v ON_ERROR_STOP=1 -Atc "
  select count(*)::text || ':' || md5(coalesce(string_agg((to_jsonb(u)->>'id') || ':' || lower(coalesce(to_jsonb(u)->>'email','')), ',' order by to_jsonb(u)->>'id'),''))
  from neon_auth.\"user\" u")"

echo "Identity bridge users: $bridge_count"
echo "Neon Auth users: $target_count"
if [[ "$bridge_identity" != "$target_identity" ]]; then
  echo 'FAIL: user UUID/email fingerprint differs. Do not apply the identity trigger or cut over.' >&2
  exit 1
fi

if [[ -n "${SUPABASE_DB_URL:-}" ]]; then
  source_count="$(psql "$SUPABASE_DB_URL" -X -v ON_ERROR_STOP=1 -Atc 'select count(*) from auth.users where deleted_at is null')"
  source_identity="$(psql "$SUPABASE_DB_URL" -X -v ON_ERROR_STOP=1 -Atc "
    select count(*)::text || ':' || md5(coalesce(string_agg(id::text || ':' || lower(coalesce(email,'')), ',' order by id),''))
    from auth.users where deleted_at is null")"
  echo "Supabase active users: $source_count"
  if [[ "$source_identity" != "$bridge_identity" ]]; then
    echo 'FAIL: Supabase and identity-bridge UUID/email fingerprints differ.' >&2
    exit 1
  fi
fi

echo 'PASS: Neon Auth preserves every active user UUID and email.'
echo 'Password and OAuth sign-in still require interactive staging acceptance tests.'
