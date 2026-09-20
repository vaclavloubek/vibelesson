import type { BillingCurrency } from '@/lib/billing-region';

export type OrganizationPlanCode = 'team' | 'school' | 'campus';
export type OrganizationBillingPeriod = 'monthly' | 'annual';

export type OrganizationPlan = {
  code: OrganizationPlanCode;
  name: string;
  seatLimit: number;
  monthlyLessonLimit: number;
  monthlyRevisionLimit: number;
  libraryEnabled: boolean;
  prices: Record<OrganizationBillingPeriod, Record<BillingCurrency, number>>;
};

export const ORGANIZATION_PLANS: Record<OrganizationPlanCode, OrganizationPlan> = {
  team: {
    code: 'team',
    name: 'Team',
    seatLimit: 10,
    monthlyLessonLimit: 40,
    monthlyRevisionLimit: 80,
    libraryEnabled: false,
    prices: {
      monthly: { czk: 890, eur: 37.99, usd: 39.99 },
      annual: { czk: 8900, eur: 379.9, usd: 399 },
    },
  },
  school: {
    code: 'school',
    name: 'School',
    seatLimit: 30,
    monthlyLessonLimit: 120,
    monthlyRevisionLimit: 240,
    libraryEnabled: true,
    prices: {
      monthly: { czk: 2390, eur: 99.99, usd: 109.99 },
      annual: { czk: 23900, eur: 999.9, usd: 1099 },
    },
  },
  campus: {
    code: 'campus',
    name: 'Campus',
    seatLimit: 100,
    monthlyLessonLimit: 300,
    monthlyRevisionLimit: 600,
    libraryEnabled: true,
    prices: {
      monthly: { czk: 5990, eur: 249.99, usd: 269.99 },
      annual: { czk: 59900, eur: 2499.9, usd: 2699 },
    },
  },
};

export function isOrganizationPlanCode(value: string): value is OrganizationPlanCode {
  return value === 'team' || value === 'school' || value === 'campus';
}

export function organizationMinorUnitPrice(
  plan: OrganizationPlanCode,
  period: OrganizationBillingPeriod,
  currency: BillingCurrency,
) {
  return Math.round(ORGANIZATION_PLANS[plan].prices[period][currency] * 100);
}
