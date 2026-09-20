import { createAdminClient } from '@/lib/supabase/admin';

export async function matchOrganizationBankTransaction(input: {
  variableSymbol: string;
  amountMinor: number;
  currency: 'czk' | 'eur' | 'usd';
  bankReference: string;
  receivedAt: Date;
}) {
  const admin = createAdminClient();
  const { data, error } = await admin.rpc('match_organization_bank_payment', {
    p_variable_symbol: input.variableSymbol,
    p_amount_minor: input.amountMinor,
    p_currency: input.currency,
    p_bank_reference: input.bankReference,
    p_received_at: input.receivedAt.toISOString(),
  });

  if (error) {
    throw new Error(error.message || 'organization_bank_match_failed');
  }

  return data as {
    processed?: boolean;
    reason?: string;
    organizationId?: string;
    orderId?: string;
    status?: string;
    currentPeriodStart?: string;
    currentPeriodEnd?: string;
  } | null;
}
