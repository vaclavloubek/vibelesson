export const WITHDRAWAL_CALCULATION_METHOD = 'pro_rata_temporis_v1' as const;
export const WITHDRAWAL_WINDOW_MS = 14 * 24 * 60 * 60 * 1000;

export type WithdrawalCalculationReason =
  | 'eligible'
  | 'withdrawal_window_expired';

export type IndividualWithdrawalCalculation = {
  eligible: boolean;
  reason: WithdrawalCalculationReason;
  calculationMethod: typeof WITHDRAWAL_CALCULATION_METHOD;
  withdrawalDeadline: string;
  contractAmountMinor: number;
  paymentAmountMinor: number;
  priorRefundedMinor: number;
  retainedAmountMinor: number;
  targetTotalRefundMinor: number;
  refundNowMinor: number;
  periodStart: string;
  periodEnd: string;
  serviceStartedAt: string;
  withdrawalReceivedAt: string;
  immediatePerformanceRequested: boolean;
};

function asMillis(value: string, field: string) {
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) throw new Error(`withdrawal_${field}_invalid`);
  return parsed;
}

function assertMinorUnits(value: number, field: string, allowZero = true) {
  if (!Number.isSafeInteger(value) || value < 0 || (!allowZero && value === 0)) {
    throw new Error(`withdrawal_${field}_invalid`);
  }
}

export function calculateIndividualWithdrawal(input: {
  contractAmountMinor: number;
  paymentAmountMinor: number;
  priorRefundedMinor: number;
  contractConcludedAt: string;
  serviceStartedAt: string;
  periodStart: string;
  periodEnd: string;
  withdrawalReceivedAt: string;
  immediatePerformanceRequested: boolean;
}): IndividualWithdrawalCalculation {
  assertMinorUnits(input.contractAmountMinor, 'contract_amount', false);
  assertMinorUnits(input.paymentAmountMinor, 'payment_amount', false);
  assertMinorUnits(input.priorRefundedMinor, 'prior_refunded');
  if (input.priorRefundedMinor > input.paymentAmountMinor) {
    throw new Error('withdrawal_prior_refunded_invalid');
  }

  const contractConcludedAt = asMillis(input.contractConcludedAt, 'contract_concluded_at');
  const serviceStartedAt = asMillis(input.serviceStartedAt, 'service_started_at');
  const periodStart = asMillis(input.periodStart, 'period_start');
  const periodEnd = asMillis(input.periodEnd, 'period_end');
  const withdrawalReceivedAt = asMillis(input.withdrawalReceivedAt, 'withdrawal_received_at');

  if (periodEnd <= periodStart) throw new Error('withdrawal_period_invalid');
  if (serviceStartedAt < periodStart || serviceStartedAt >= periodEnd) {
    throw new Error('withdrawal_service_start_invalid');
  }

  const withdrawalDeadline = contractConcludedAt + WITHDRAWAL_WINDOW_MS;
  const common = {
    calculationMethod: WITHDRAWAL_CALCULATION_METHOD,
    withdrawalDeadline: new Date(withdrawalDeadline).toISOString(),
    contractAmountMinor: input.contractAmountMinor,
    paymentAmountMinor: input.paymentAmountMinor,
    priorRefundedMinor: input.priorRefundedMinor,
    periodStart: new Date(periodStart).toISOString(),
    periodEnd: new Date(periodEnd).toISOString(),
    serviceStartedAt: new Date(serviceStartedAt).toISOString(),
    withdrawalReceivedAt: new Date(withdrawalReceivedAt).toISOString(),
    immediatePerformanceRequested: input.immediatePerformanceRequested,
  };

  if (withdrawalReceivedAt > withdrawalDeadline) {
    return {
      ...common,
      eligible: false,
      reason: 'withdrawal_window_expired',
      retainedAmountMinor: 0,
      targetTotalRefundMinor: 0,
      refundNowMinor: 0,
    };
  }

  const totalPeriodMs = periodEnd - periodStart;
  const elapsedServiceMs = Math.max(0, Math.min(withdrawalReceivedAt, periodEnd) - serviceStartedAt);

  // The statutory pro-rata amount is time-based. We round the retained amount
  // down to the smallest currency unit so rounding never disadvantages the consumer.
  const retainedAmountMinor = input.immediatePerformanceRequested
    ? Math.floor((input.contractAmountMinor * elapsedServiceMs) / totalPeriodMs)
    : 0;

  const cappedRetained = Math.min(retainedAmountMinor, input.paymentAmountMinor);
  const targetTotalRefundMinor = Math.max(0, input.paymentAmountMinor - cappedRetained);
  const refundNowMinor = Math.max(0, targetTotalRefundMinor - input.priorRefundedMinor);

  return {
    ...common,
    eligible: true,
    reason: 'eligible',
    retainedAmountMinor: cappedRetained,
    targetTotalRefundMinor,
    refundNowMinor,
  };
}
