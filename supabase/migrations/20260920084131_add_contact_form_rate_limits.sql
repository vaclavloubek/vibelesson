create table if not exists private.contact_form_rate_limits (
  id uuid primary key default gen_random_uuid(),
  client_hash text not null,
  email_hash text not null,
  window_bucket bigint not null,
  created_at timestamptz not null default now()
);

alter table private.contact_form_rate_limits enable row level security;

create unique index if not exists contact_form_rate_limits_client_window_uidx
  on private.contact_form_rate_limits (client_hash, window_bucket);

create unique index if not exists contact_form_rate_limits_email_window_uidx
  on private.contact_form_rate_limits (email_hash, window_bucket);

create index if not exists contact_form_rate_limits_created_at_idx
  on private.contact_form_rate_limits (created_at);

revoke all on table private.contact_form_rate_limits from anon, authenticated;
