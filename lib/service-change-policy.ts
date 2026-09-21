export const SERVICE_CHANGE_POLICY_VERSION = 'hybrid-v1';
export const MATERIAL_CHANGE_NOTICE_DAYS = 30;

export type ServiceChangeClassification =
  | 'conformity_or_security'
  | 'beneficial_or_minor'
  | 'material_adverse';

export type ServiceChangeStrategy = 'apply' | 'grandfather' | 'durable_notice';

export type ServiceChangePolicyInput = {
  classification: ServiceChangeClassification;
  legacyAvailable: boolean;
  announcedAt: string;
  effectiveAt: string;
  paidPeriodEnd?: string | null;
};

function instant(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/.test(value)) {
    throw new Error('service_change_timestamp_invalid');
  }
  const parsed = Date.parse(value);
  if (!Number.isSafeInteger(parsed)) throw new Error('service_change_timestamp_invalid');
  return parsed;
}

export function classifyServiceChangePolicy(input: ServiceChangePolicyInput) {
  const announcedAtMs = instant(input.announcedAt);
  const effectiveAtMs = instant(input.effectiveAt);
  if (effectiveAtMs < announcedAtMs) throw new Error('service_change_effective_time_invalid');

  if (input.classification !== 'material_adverse') {
    return {
      policyVersion: SERVICE_CHANGE_POLICY_VERSION,
      strategy: 'apply' as const,
      durableNoticeRequired: false,
      terminationRight: false,
      legacyUntil: null,
      terminationDeadline: null,
    };
  }

  if (input.legacyAvailable) {
    if (!input.paidPeriodEnd) throw new Error('service_change_paid_period_required');
    const paidPeriodEndMs = instant(input.paidPeriodEnd);
    if (paidPeriodEndMs <= announcedAtMs) throw new Error('service_change_paid_period_invalid');
    return {
      policyVersion: SERVICE_CHANGE_POLICY_VERSION,
      strategy: 'grandfather' as const,
      durableNoticeRequired: true,
      terminationRight: false,
      legacyUntil: new Date(Math.max(paidPeriodEndMs, effectiveAtMs)).toISOString(),
      terminationDeadline: null,
    };
  }

  const minimumLeadMs = MATERIAL_CHANGE_NOTICE_DAYS * 24 * 60 * 60 * 1000;
  if (effectiveAtMs - announcedAtMs < minimumLeadMs) throw new Error('service_change_notice_too_short');
  return {
    policyVersion: SERVICE_CHANGE_POLICY_VERSION,
    strategy: 'durable_notice' as const,
    durableNoticeRequired: true,
    terminationRight: true,
    legacyUntil: null,
    terminationDeadline: new Date(effectiveAtMs + minimumLeadMs).toISOString(),
  };
}

export function calculateUnusedServiceChangeRefund(input: {
  amountMinor: number;
  periodStart: string;
  periodEnd: string;
  terminatedAt: string;
  previouslyRefundedMinor: number;
}) {
  const start = instant(input.periodStart);
  const end = instant(input.periodEnd);
  const terminated = instant(input.terminatedAt);
  if (end <= start || !Number.isSafeInteger(input.amountMinor) || input.amountMinor < 0
    || !Number.isSafeInteger(input.previouslyRefundedMinor) || input.previouslyRefundedMinor < 0
    || input.previouslyRefundedMinor > input.amountMinor) throw new Error('service_change_refund_input_invalid');
  const elapsed = Math.max(0, Math.min(terminated, end) - start);
  const retainedMinor = Number(BigInt(input.amountMinor) * BigInt(elapsed) / BigInt(end - start));
  const totalRefundEntitlementMinor = input.amountMinor - retainedMinor;
  return {
    methodVersion: 'unused-period-v1',
    retainedMinor,
    totalRefundEntitlementMinor,
    refundDueMinor: Math.max(0, totalRefundEntitlementMinor - input.previouslyRefundedMinor),
    rounding: 'retained_floor_minor_unit' as const,
  };
}
