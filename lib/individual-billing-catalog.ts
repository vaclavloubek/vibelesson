import type { BillingPeriod, IndividualPlanCode } from '@/lib/subscription-change-policy';

export type IndividualBillingCurrency = 'czk' | 'eur' | 'usd';

export const AI_GRADING_ALLOWANCES = {
  teacher_pro: 60,
  school: 300,
  campus: 750,
} as const;

export const INDIVIDUAL_PLAN_ALLOWANCES: Record<
  IndividualPlanCode,
  { lessonGenerations: number; aiEdits: number; aiGradings: number | null }
> = {
  teacher: { lessonGenerations: 10, aiEdits: 20, aiGradings: null },
  teacher_pro: { lessonGenerations: 25, aiEdits: 40, aiGradings: AI_GRADING_ALLOWANCES.teacher_pro },
};

const DISPLAY_PRICES: Record<
  IndividualPlanCode,
  Record<BillingPeriod, Record<IndividualBillingCurrency, number>>
> = {
  teacher: {
    monthly: { czk: 199, eur: 7.99, usd: 8.99 },
    annual: { czk: 1990, eur: 79.9, usd: 89 },
  },
  teacher_pro: {
    monthly: { czk: 329, eur: 13.99, usd: 14.99 },
    annual: { czk: 3290, eur: 139.9, usd: 149 },
  },
};

export function individualDisplayPrice(
  planCode: IndividualPlanCode,
  billingPeriod: BillingPeriod,
  currency: IndividualBillingCurrency,
) {
  return DISPLAY_PRICES[planCode][billingPeriod][currency];
}

export function individualMinorUnitPrice(
  planCode: IndividualPlanCode,
  billingPeriod: BillingPeriod,
  currency: IndividualBillingCurrency,
) {
  return Math.round(individualDisplayPrice(planCode, billingPeriod, currency) * 100);
}

export function pricingPagePrice(planCode: IndividualPlanCode) {
  return {
    monthlyCzk: DISPLAY_PRICES[planCode].monthly.czk,
    annualCzk: DISPLAY_PRICES[planCode].annual.czk,
    monthlyEur: DISPLAY_PRICES[planCode].monthly.eur,
    annualEur: DISPLAY_PRICES[planCode].annual.eur,
    monthlyUsd: DISPLAY_PRICES[planCode].monthly.usd,
    annualUsd: DISPLAY_PRICES[planCode].annual.usd,
  };
}
