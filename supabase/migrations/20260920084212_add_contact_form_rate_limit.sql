create table public.contact_form_rate_limits (
  id uuid primary key default gen_random_uuid(),
  client_hash text not null check (char_length(client_hash) = 64),
  email_hash text not null check (char_length(email_hash) = 64),
  window_bucket bigint not null,
  created_at timestamptz not null default now(),
  unique (client_hash, window_bucket),
  unique (email_hash, window_bucket)
);

comment on table public.contact_form_rate_limits is
  'Privacy-minimal anti-abuse ledger for the public landing inquiry form. Stores only HMAC hashes and a 10-minute window bucket; never raw IP, email, or message content.';

alter table public.contact_form_rate_limits enable row level security;

revoke all on table public.contact_form_rate_limits from anon, authenticated;
grant select, insert, delete on table public.contact_form_rate_limits to service_role;
