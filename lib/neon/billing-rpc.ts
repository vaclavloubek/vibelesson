import 'server-only';

import { assertApprovedNeonCutover, getDatabaseBackend } from '@/lib/neon/config';
import { createNeonSql } from '@/lib/neon/server';
import { createAdminClient } from '@/lib/supabase/admin';

// Only Stripe webhook RPCs are allowed here. All identifiers are fixed source
// literals; values are passed as bind parameters, never interpolated into SQL.
const RPC_ARGUMENTS = {
  sync_organization_invoice_event: ['p_event_id', 'p_event_type', 'p_livemode', 'p_organization_id', 'p_order_id', 'p_invoice_id'],
  sync_organization_invoice_payment_event_v2: ['p_event_id', 'p_livemode', 'p_organization_id', 'p_order_id', 'p_invoice_id', 'p_payment_intent_id', 'p_paid_at', 'p_amount_paid', 'p_currency', 'p_billing_reason'],
  sync_organization_subscription_event: ['p_event_id', 'p_event_type', 'p_livemode', 'p_organization_id', 'p_order_id', 'p_subscription_id', 'p_status'],
  sync_stripe_invoice_payment_event_v2: ['p_event_id', 'p_livemode', 'p_user_id', 'p_subscription_id', 'p_invoice_id', 'p_payment_intent_id', 'p_paid_at', 'p_amount_paid', 'p_currency', 'p_billing_reason'],
  sync_stripe_dispute_event: ['p_event_id', 'p_event_type', 'p_livemode', 'p_dispute_id', 'p_payment_intent_id', 'p_status', 'p_event_at'],
  sync_organization_stripe_dispute_event: ['p_event_id', 'p_event_type', 'p_livemode', 'p_dispute_id', 'p_payment_intent_id', 'p_status', 'p_amount_disputed', 'p_currency', 'p_event_at'],
  sync_stripe_refund_state: ['p_event_id', 'p_event_type', 'p_livemode', 'p_charge_id', 'p_payment_intent_id', 'p_amount_total', 'p_amount_refunded', 'p_fully_refunded', 'p_event_at'],
  sync_organization_stripe_refund_state: ['p_event_id', 'p_event_type', 'p_livemode', 'p_charge_id', 'p_payment_intent_id', 'p_amount_total', 'p_amount_refunded', 'p_fully_refunded', 'p_event_at'],
  sync_stripe_subscription_event: ['p_event_id', 'p_event_type', 'p_livemode', 'p_user_id', 'p_customer_id', 'p_subscription_id', 'p_price_id', 'p_merchant_of_record', 'p_status', 'p_cancel_at_period_end', 'p_current_period_start', 'p_current_period_end', 'p_canceled_at', 'p_billing_country'],
} as const;

export type BillingRpcName = keyof typeof RPC_ARGUMENTS;
type RpcResult = { data: unknown; error: { code?: string; message?: string } | null };

export async function syncStripeBillingRpc(name: BillingRpcName, args: Record<string, unknown>): Promise<RpcResult> {
  if (getDatabaseBackend() !== 'neon') {
    const admin = createAdminClient() as unknown as {
      rpc: (functionName: string, parameters: Record<string, unknown>) => Promise<RpcResult>;
    };
    return admin.rpc(name, args);
  }

  assertApprovedNeonCutover();
  const names = RPC_ARGUMENTS[name];
  const provided = Object.keys(args);
  if (provided.length !== names.length || names.some((key) => !Object.hasOwn(args, key))) {
    throw new Error('Stripe billing RPC arguments do not match the audited signature.');
  }

  const sql = createNeonSql();
  const placeholders = names.map((_, index) => `$${index + 1}`).join(', ');
  const values = names.map((key) => args[key] ?? null);
  try {
    const rows = await sql.query(`select public.${name}(${placeholders}) as data`, values);
    if (rows.length !== 1) throw new Error('unexpected_billing_rpc_result');
    return { data: rows[0].data, error: null };
  } catch (error) {
    return {
      data: null,
      error: {
        code: error && typeof error === 'object' && 'code' in error ? String(error.code) : 'neon_rpc_failed',
        message: error instanceof Error ? error.message : 'Neon billing RPC failed.',
      },
    };
  }
}
