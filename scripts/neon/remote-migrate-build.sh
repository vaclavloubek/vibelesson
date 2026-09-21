#!/usr/bin/env bash
set -euo pipefail
umask 077

if [[ "${VERCEL_ENV:-}" != "preview" ]]; then
  echo 'Refusing to migrate outside a Vercel Preview build.' >&2
  exit 2
fi

if [[ "${NEON_MIGRATION_APPROVED:-}" != "I_UNDERSTAND_THIS_WRITES_TO_NEON" ]]; then
  echo 'Refusing to write: NEON_MIGRATION_APPROVED is not set to the required value.' >&2
  exit 2
fi

: "${SUPABASE_DB_URL:?SUPABASE_DB_URL is required}"

TARGET_DATABASE_URL="${DATABASE_URL_UNPOOLED:-${NEON_DATABASE_URL_UNPOOLED:-${NEON_DATABASE_DATABASE_URL_UNPOOLED:-${DATABASE_URL:-}}}}"
: "${TARGET_DATABASE_URL:?An unpooled Neon database URL is required}"

node - "$SUPABASE_DB_URL" "$TARGET_DATABASE_URL" <<'NODE'
const [source, target] = process.argv.slice(2).map((value) => new URL(value));
const sourceIsSessionPooler =
  source.hostname.endsWith('.pooler.supabase.com') && source.port === '5432';
if (!sourceIsSessionPooler) {
  throw new Error('Source must use the Supabase Session pooler on port 5432');
}
if (!target.hostname.endsWith('.neon.tech')) {
  throw new Error('Target is not a Neon database');
}
if (`${source.hostname}/${source.pathname}` === `${target.hostname}/${target.pathname}`) {
  throw new Error('Source and target resolve to the same database');
}
NODE

TOOLS_DIR="$(mktemp -d "${TMPDIR:-/tmp}/syllonaut-postgresql-tools.XXXXXX")"
trap 'rm -rf -- "$TOOLS_DIR"' EXIT

python3 -m pip install \
  --disable-pip-version-check \
  --no-input \
  --no-deps \
  --target "$TOOLS_DIR/python" \
  'postgresql-binaries==18.4.0'

PG_BIN="$(PYTHONPATH="$TOOLS_DIR/python" python3 -c 'import postgresql_binaries; print(postgresql_binaries.bin())')"
export PATH="$PG_BIN:$PATH"

psql --version
pg_dump --version

export NEON_DATABASE_URL_UNPOOLED="$TARGET_DATABASE_URL"
export NEON_DATABASE_URL="$TARGET_DATABASE_URL"

bash scripts/neon/migrate.sh --execute
npm run build
