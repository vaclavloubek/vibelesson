-- Activate only after the application uses sync_stripe_invoice_payment_event_v2.
-- Prevent any legacy payment path from unlocking refund/dispute AI locks without
-- authoritative recovery amount metadata.

alter table private.stripe_subscription_payments
  alter column amount_paid set not null,
  alter column currency set not null,
  alter column billing_reason set not null;

revoke execute on function public.sync_stripe_invoice_payment_event(
  text, boolean, uuid, text, text, text, timestamptz
)
  from public, anon, authenticated, service_role;

comment on function public.sync_stripe_invoice_payment_event(
  text, boolean, uuid, text, text, text, timestamptz
) is
  'Legacy invoice payment mapping RPC. Direct execution is disabled after recovery-payment integrity hardening; use sync_stripe_invoice_payment_event_v2.';
