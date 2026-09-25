-- Record marketing lifecycle (Resend) failures for a daily operator digest
-- (audit B6, 2026-09-25).
--
-- Failed calls from lib/marketing-lifecycle.ts used to end only in the Vercel
-- log (some not even there), so the 401 restricted_api_key outage of
-- 22.-23. 9. went unnoticed. resendRequest now counts every failure here per
-- UTC day, operation (method + Resend path pattern, never an email address)
-- and error code. /api/cron/marketing-failures mails the operator the counts
-- not yet reported (failure_count > reported_count) and keeps 90 days.
--
-- Server-only: no grants for API roles. Idempotent.

create table if not exists private.marketing_lifecycle_failures (
  day date not null,
  operation text not null check (operation ~ '^(GET|POST|PATCH|DELETE) /[a-z_/:]{1,48}$'),
  code text not null check (code ~ '^[a-z0-9_]{1,64}$'),
  failure_count integer not null default 1 check (failure_count > 0),
  reported_count integer not null default 0 check (reported_count >= 0),
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  primary key (day, operation, code)
);

alter table private.marketing_lifecycle_failures enable row level security;

revoke all on table private.marketing_lifecycle_failures from public;
revoke all on table private.marketing_lifecycle_failures from anon, anonymous, authenticated, authenticator;
