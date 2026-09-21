/** Pure monetary policy. Eligibility and payment ownership are checked separately. */
export const WITHDRAWAL_METHOD_VERSION = 'time-pro-rata-v1';

export type WithdrawalCalculationInput = {
  amountMinor: number;
  currency: 'czk' | 'eur' | 'usd';
  periodStart: string;
  periodEnd: string;
  serviceStartedAt: string;
  withdrawalReceivedAt: string;
  immediatePerformanceRequested: boolean;
  proportionateChargeDisclosed: boolean;
  previouslyRefundedMinor: number;
};

function timestamp(value: string) {
  // Require an unambiguous instant; local dates depend on the server timezone.
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/.test(value)) {
    throw new Error('withdrawal_timestamp_invalid');
  }
  const result = Date.parse(value);
  if (!Number.isSafeInteger(result)) throw new Error('withdrawal_timestamp_invalid');
  return result;
}

export function calculateWithdrawal(input: WithdrawalCalculationInput) {
  if (!['czk', 'eur', 'usd'].includes(input.currency)) throw new Error('withdrawal_currency_invalid');
  if (!Number.isSafeInteger(input.amountMinor) || input.amountMinor < 0
    || !Number.isSafeInteger(input.previouslyRefundedMinor) || input.previouslyRefundedMinor < 0
    || input.previouslyRefundedMinor > input.amountMinor) throw new Error('withdrawal_amount_invalid');
  if (typeof input.immediatePerformanceRequested !== 'boolean'
    || typeof input.proportionateChargeDisclosed !== 'boolean') throw new Error('withdrawal_consent_invalid');
  const start = timestamp(input.periodStart);
  const end = timestamp(input.periodEnd);
  const activated = timestamp(input.serviceStartedAt);
  const received = timestamp(input.withdrawalReceivedAt);
  const duration = end - start;
  if (!Number.isSafeInteger(duration) || duration <= 0 || activated < start || activated > end) {
    throw new Error('withdrawal_period_invalid');
  }
  const elapsed = Math.max(0, Math.min(received, end) - activated);
  // Exact integer arithmetic, rounded once DOWN in favour of the consumer.
  // AI usage is deliberately absent from the input and the monetary calculation.
  const retainedMinor = input.immediatePerformanceRequested && input.proportionateChargeDisclosed
    ? Number(BigInt(input.amountMinor) * BigInt(elapsed) / BigInt(duration))
    : 0;
  const totalRefundEntitlementMinor = input.amountMinor - retainedMinor;
  return {
    methodVersion: WITHDRAWAL_METHOD_VERSION,
    ...input,
    durationMs: duration,
    elapsedMs: elapsed,
    rounding: 'retained_floor_minor_unit' as const,
    retainedMinor,
    totalRefundEntitlementMinor,
    refundDueMinor: Math.max(0, totalRefundEntitlementMinor - input.previouslyRefundedMinor),
  };
}
