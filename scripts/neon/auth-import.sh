#!/usr/bin/env bash
set -euo pipefail
umask 077

if [[ "${1:-}" != "--execute" ]]; then
  cat <<'EOF'
Preview only; no users were created.

Execution refreshes email-verification state from Supabase, imports the stable
UUID/email/name identity bridge into Neon Auth, verifies the anonymous identity
fingerprint, and installs the identity synchronization trigger.

Password hashes and sessions are never copied. Migrated users must use the
forgot-password flow once to create a Neon-compatible credential account.

Required explicit gate:
  NEON_AUTH_IMPORT_APPROVED=I_UNDERSTAND_THIS_CREATES_NEON_AUTH_USERS bash scripts/neon/auth-import.sh --execute
EOF
  exit 0
fi

if [[ "${NEON_AUTH_IMPORT_APPROVED:-}" != "I_UNDERSTAND_THIS_CREATES_NEON_AUTH_USERS" ]]; then
  echo 'Refusing to write: NEON_AUTH_IMPORT_APPROVED is not set to the required value.' >&2
  exit 2
fi

: "${SUPABASE_DB_URL:?SUPABASE_DB_URL is required}"
TARGET_DATABASE_URL="${NEON_DATABASE_URL_UNPOOLED:-${NEON_DATABASE_URL:-}}"
: "${TARGET_DATABASE_URL:?NEON_DATABASE_URL_UNPOOLED or NEON_DATABASE_URL is required}"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_DIR="$(cd "$SCRIPT_DIR/../.." && pwd)"
WORK_DIR="$(mktemp -d "${TMPDIR:-/tmp}/syllonaut-neon-auth.XXXXXX")"
trap 'rm -rf -- "$WORK_DIR"' EXIT

source_count="$(psql "$SUPABASE_DB_URL" -X -v ON_ERROR_STOP=1 -Atc \
  'select count(*) from auth.users where deleted_at is null')"
source_unverified_count="$(psql "$SUPABASE_DB_URL" -X -v ON_ERROR_STOP=1 -Atc \
  'select count(*) from auth.users where deleted_at is null and email_confirmed_at is null')"

psql "$SUPABASE_DB_URL" -X -v ON_ERROR_STOP=1 --csv -c \
  "select id, (email_confirmed_at is not null) as email_verified from auth.users where deleted_at is null order by id" \
  > "$WORK_DIR/email-verification.csv"

psql "$TARGET_DATABASE_URL" -X -v ON_ERROR_STOP=1 \
  -f "$REPO_DIR/neon/migrations/0001_prerequisites.sql"

cat > "$WORK_DIR/refresh-verification.sql" <<SQL
begin;
create temporary table source_email_verification (
  id uuid primary key,
  email_verified boolean not null
) on commit drop;
\copy source_email_verification(id,email_verified) from '$WORK_DIR/email-verification.csv' csv header

do \$block\$
begin
  if (select count(*) from source_email_verification) <> $source_count then
    raise exception 'Source verification export count changed during Auth import';
  end if;
  if (select count(*) from app_identity.users where deleted_at is null) <> $source_count then
    raise exception 'Identity bridge count differs from active Supabase users';
  end if;
  if exists (
    select 1
    from source_email_verification source
    full join app_identity.users bridge on bridge.id = source.id and bridge.deleted_at is null
    where source.id is null or bridge.id is null
  ) then
    raise exception 'Identity bridge UUIDs differ from active Supabase users';
  end if;
end
\$block\$;

update app_identity.users bridge
set email_verified = source.email_verified
from source_email_verification source
where bridge.id = source.id and bridge.deleted_at is null;
commit;
SQL

psql "$TARGET_DATABASE_URL" -X -v ON_ERROR_STOP=1 \
  -f "$WORK_DIR/refresh-verification.sql"
psql "$TARGET_DATABASE_URL" -X -v ON_ERROR_STOP=1 \
  -f "$REPO_DIR/neon/migrations/0002_neon_auth_user_import.sql"

SUPABASE_DB_URL="$SUPABASE_DB_URL" NEON_DATABASE_URL="$TARGET_DATABASE_URL" \
  "$SCRIPT_DIR/auth-preflight.sh"

psql "$TARGET_DATABASE_URL" -X -v ON_ERROR_STOP=1 \
  -f "$REPO_DIR/neon/migrations/0003_neon_auth_identity_sync.sql"

target_credential_count="$(psql "$TARGET_DATABASE_URL" -X -v ON_ERROR_STOP=1 -Atc \
  'select count(*) from neon_auth.account where "providerId" = '\''credential'\''')"

echo "Imported Neon Auth users: $source_count"
echo "Source users requiring email verification: $source_unverified_count"
echo "Credential accounts imported: $target_credential_count"
echo 'PASS: UUID/email identities were imported without passwords, sessions, or outgoing email.'
echo 'Next: one user initiates the forgot-password flow and completes the interactive staging acceptance test.'
