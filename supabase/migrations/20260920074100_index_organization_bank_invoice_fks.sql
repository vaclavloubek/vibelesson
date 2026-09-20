-- Index foreign keys introduced by organization bank invoices.

create index if not exists organization_bank_payment_confirmations_organization_idx
  on public.organization_bank_payment_confirmations(organization_id);

create index if not exists organization_bank_payment_confirmations_actor_idx
  on public.organization_bank_payment_confirmations(actor_user_id)
  where actor_user_id is not null;

create index if not exists organization_orders_payment_confirmed_by_idx
  on public.organization_orders(payment_confirmed_by)
  where payment_confirmed_by is not null;
