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
    monthlyLessonLimit: 60,
    monthlyRevisionLimit: 180,
    libraryEnabled: false,
    prices: {
      monthly: { czk: 990, eur: 42.99, usd: 45.99 },
      annual: { czk: 9900, eur: 429.9, usd: 459.9 },
    },
  },
  school: {
    code: 'school',
    name: 'School',
    seatLimit: 30,
    monthlyLessonLimit: 150,
    monthlyRevisionLimit: 300,
    libraryEnabled: true,
    prices: {
      monthly: { czk: 2690, eur: 119.99, usd: 124.99 },
      annual: { czk: 26900, eur: 1199.9, usd: 1249.9 },
    },
  },
  campus: {
    code: 'campus',
    name: 'Campus',
    seatLimit: 100,
    monthlyLessonLimit: 400,
    monthlyRevisionLimit: 700,
    libraryEnabled: true,
    prices: {
      monthly: { czk: 6490, eur: 279.99, usd: 299.99 },
      annual: { czk: 64900, eur: 2799.9, usd: 2999.9 },
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
