#!/usr/bin/env bash
set -euo pipefail
umask 077

if [[ "${1:-}" != "--execute" ]]; then
  cat <<'EOF'
Preview only; nothing was changed.

Execution performs these steps:
  1. read-only preflight against Supabase and Neon
  2. schema pre-data dump of public/private
  3. UUID identity bridge import (never password hashes or tokens)
  4. table data import
  5. constraints, indexes and triggers import
  6. compatibility migrations and deterministic checksums

Required explicit gate:
  NEON_MIGRATION_APPROVED=I_UNDERSTAND_THIS_WRITES_TO_NEON npm run neon:migrate -- --execute
EOF
  exit 0
fi

if [[ "${NEON_MIGRATION_APPROVED:-}" != "I_UNDERSTAND_THIS_WRITES_TO_NEON" ]]; then
  echo 'Refusing to write: NEON_MIGRATION_APPROVED is not set to the required value.' >&2
  exit 2
fi

: "${SUPABASE_DB_URL:?SUPABASE_DB_URL is required}"
TARGET_DATABASE_URL="${NEON_DATABASE_URL_UNPOOLED:-${NEON_DATABASE_URL:-}}"
: "${TARGET_DATABASE_URL:?NEON_DATABASE_URL_UNPOOLED or NEON_DATABASE_URL is required}"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_DIR="$(cd "$SCRIPT_DIR/../.." && pwd)"
WORK_DIR="$(mktemp -d "${TMPDIR:-/tmp}/syllonaut-neon.XXXXXX")"
trap 'rm -rf -- "$WORK_DIR"' EXIT

node "$SCRIPT_DIR/preflight.mjs" --execute

target_application_tables="$(psql "$TARGET_DATABASE_URL" -X -v ON_ERROR_STOP=1 -Atc "
  select count(*)
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname in ('public', 'private', 'app_identity')
    and c.relkind in ('r', 'p')")"
if [[ "$target_application_tables" != "0" ]]; then
  echo "Refusing to migrate into a non-empty target ($target_application_tables application tables). Create a fresh Neon branch." >&2
  exit 3
fi

pg_dump "$SUPABASE_DB_URL" -Fp --section=pre-data --no-owner --no-acl \
  --schema=public --schema=private --file="$WORK_DIR/pre-data.sql"
pg_dump "$SUPABASE_DB_URL" -Fp --data-only --no-owner --no-acl \
  --schema=public --schema=private --file="$WORK_DIR/data.sql"
pg_dump "$SUPABASE_DB_URL" -Fp --section=post-data --no-owner --no-acl \
  --schema=public --schema=private --file="$WORK_DIR/post-data.sql"

for sql_file in "$WORK_DIR/pre-data.sql" "$WORK_DIR/post-data.sql"; do
  perl -0pi -e 's/auth\.users/app_identity.users/g; s/CREATE SCHEMA public;/CREATE SCHEMA IF NOT EXISTS public;/g; s/CREATE SCHEMA private;/CREATE SCHEMA IF NOT EXISTS private;/g' "$sql_file"
done

psql "$TARGET_DATABASE_URL" -X -v ON_ERROR_STOP=1 -f "$REPO_DIR/neon/migrations/0001_prerequisites.sql"
psql "$TARGET_DATABASE_URL" -X -v ON_ERROR_STOP=1 -f "$WORK_DIR/pre-data.sql"

psql "$SUPABASE_DB_URL" -X -v ON_ERROR_STOP=1 --csv -c \
  "select id,email,coalesce(raw_user_meta_data,'{}'::jsonb) as raw_user_meta_data,created_at,updated_at,deleted_at from auth.users order by id" \
  > "$WORK_DIR/auth-users.csv"
psql "$TARGET_DATABASE_URL" -X -v ON_ERROR_STOP=1 -c \
  "\copy app_identity.users(id,email,raw_user_meta_data,created_at,updated_at,deleted_at) from '$WORK_DIR/auth-users.csv' csv header"

psql "$TARGET_DATABASE_URL" -X -v ON_ERROR_STOP=1 -f "$WORK_DIR/data.sql"
psql "$TARGET_DATABASE_URL" -X -v ON_ERROR_STOP=1 -f "$WORK_DIR/post-data.sql"
SUPABASE_DB_URL="$SUPABASE_DB_URL" NEON_DATABASE_URL="$TARGET_DATABASE_URL" \
  "$SCRIPT_DIR/verify.sh"

echo 'Migration copy and verification completed. Supabase was not modified.'
echo 'Next: migrate/validate Neon Auth, run auth-preflight.sh, then apply 0002_neon_auth_identity_sync.sql.'
echo 'Do not cut over Vercel until every staging gate in docs/NEON_MIGRATION.md passes.'
