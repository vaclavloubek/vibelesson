alter table public.organization_orders
  add column if not exists external_checkout_url text;
