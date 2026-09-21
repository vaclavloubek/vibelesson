#!/usr/bin/env bash
set -euo pipefail

: "${SUPABASE_DB_URL:?SUPABASE_DB_URL is required}"
: "${NEON_DATABASE_URL:?NEON_DATABASE_URL is required}"

tables=(
  profiles lessons sessions participants responses teams team_responses
  lesson_folders lesson_live_usage lesson_share_links subscriptions
  billing_email_deliveries organization_memberships school_organizations
)

checksum() {
  local url="$1"
  local relation="$2"
  psql "$url" -X -v ON_ERROR_STOP=1 -Atc "
    select case when to_regclass('$relation') is null then 'MISSING' else (
      select count(*)::text || ':' || coalesce(md5(string_agg(row_hash, '' order by row_hash)), md5(''))
      from (select md5(row_to_json(t)::text) row_hash from $relation t) rows
    ) end"
}

failed=0
for table in "${tables[@]}"; do
  source_value="$(checksum "$SUPABASE_DB_URL" "public.$table")"
  target_value="$(checksum "$NEON_DATABASE_URL" "public.$table")"
  if [[ "$source_value" == "$target_value" ]]; then
    echo "PASS public.$table (${source_value%%:*} rows)"
  else
    echo "FAIL public.$table checksum mismatch" >&2
    failed=1
  fi
done

source_users="$(psql "$SUPABASE_DB_URL" -X -v ON_ERROR_STOP=1 -Atc 'select count(*) from auth.users')"
target_users="$(psql "$NEON_DATABASE_URL" -X -v ON_ERROR_STOP=1 -Atc 'select count(*) from app_identity.users')"
if [[ "$source_users" == "$target_users" ]]; then
  echo "PASS identity bridge ($source_users rows)"
else
  echo 'FAIL identity bridge count mismatch' >&2
  failed=1
fi

exit "$failed"
