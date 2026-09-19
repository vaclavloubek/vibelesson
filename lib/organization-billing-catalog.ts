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
    monthlyLessonLimit: 200,
    monthlyRevisionLimit: 800,
    libraryEnabled: false,
    prices: {
      monthly: { czk: 1290, eur: 54.99, usd: 59.99 },
      annual: { czk: 12900, eur: 549.9, usd: 599 },
    },
  },
  school: {
    code: 'school',
    name: 'School',
    seatLimit: 30,
    monthlyLessonLimit: 600,
    monthlyRevisionLimit: 2400,
    libraryEnabled: true,
    prices: {
      monthly: { czk: 3190, eur: 139.99, usd: 149.99 },
      annual: { czk: 31900, eur: 1399.9, usd: 1499 },
    },
  },
  campus: {
    code: 'campus',
    name: 'Campus',
    seatLimit: 100,
    monthlyLessonLimit: 2000,
    monthlyRevisionLimit: 8000,
    libraryEnabled: true,
    prices: {
      monthly: { czk: 8490, eur: 369.99, usd: 399.99 },
      annual: { czk: 84900, eur: 3699.9, usd: 3999 },
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
