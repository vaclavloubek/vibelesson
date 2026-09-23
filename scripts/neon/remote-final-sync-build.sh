#!/usr/bin/env bash
# Temporary cutover build hook. Runs scripts/neon/final-sync.mjs only in a Preview
# build of the migration branch when NEON_FINAL_SYNC_MODE is set; otherwise a
# normal build. Remove from vercel.json before merging to main.
set -euo pipefail
umask 077

if [[ -n "${NEON_FINAL_SYNC_MODE:-}" ]]; then
  if [[ "${VERCEL_ENV:-}" != "preview" || "${VERCEL_GIT_COMMIT_REF:-}" != "codex/neon-staging-import-20260921-v2" ]]; then
    echo 'Refusing final sync outside the migration Preview branch.' >&2
    exit 2
  fi
  node scripts/neon/probe-target.mjs || true
  node scripts/neon/final-sync.mjs
fi

if [[ -n "${NEON_GRANT_MIRROR_MODE:-}" ]]; then
  if [[ "${VERCEL_ENV:-}" != "preview" || "${VERCEL_GIT_COMMIT_REF:-}" != "codex/neon-staging-import-20260921-v2" ]]; then
    echo 'Refusing grant mirror outside the migration Preview branch.' >&2
    exit 2
  fi
  node scripts/neon/mirror-authenticated-grants.mjs
fi

npm run build
