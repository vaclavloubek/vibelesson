import { createAdminClient } from '@/lib/supabase/admin';
import { ORGANIZATION_PLANS, type OrganizationPlanCode } from '@/lib/organization-billing-catalog';

export type OrganizationRole = 'owner' | 'admin' | 'teacher';
export type OrganizationStatus =
  | 'awaiting_payment'
  | 'active'
  | 'past_due'
  | 'suspended'
  | 'expired'
  | 'cancelled';

export type CurrentOrganization = {
  id: string;
  name: string;
  legalName: string | null;
  registrationNumber: string | null;
  vatId: string | null;
  billingEmail: string;
  billingCountry: string;
  billingPeriod: 'monthly' | 'annual';
  currency: 'czk' | 'eur' | 'usd';
  planCode: OrganizationPlanCode;
  status: OrganizationStatus;
  currentPeriodStart: string | null;
  currentPeriodEnd: string | null;
  cancelAtPeriodEnd: boolean;
  renewalMode: 'automatic_card' | 'manual_invoice';
  isInternalTest: boolean;
  role: OrganizationRole;
};

export async function getCurrentOrganizationForUser(userId: string): Promise<CurrentOrganization | null> {
  const admin = createAdminClient();

  const { data: membership, error: membershipError } = await admin
    .from('organization_memberships')
    .select('organization_id, role')
    .eq('user_id', userId)
    .eq('status', 'active')
    .maybeSingle();

  if (membershipError) throw new Error('organization_membership_lookup_failed');
  if (!membership) return null;

  const { data: organization, error: organizationError } = await admin
    .from('organizations')
    .select(
      'id, name, legal_name, registration_number, vat_id, billing_email, billing_country, billing_period, currency, plan_code, status, current_period_start, current_period_end, cancel_at_period_end, renewal_mode, is_internal_test',
    )
    .eq('id', membership.organization_id)
    .maybeSingle();

  if (organizationError || !organization) throw new Error('organization_lookup_failed');
  if (!(organization.plan_code in ORGANIZATION_PLANS)) throw new Error('organization_plan_invalid');

  return {
    id: organization.id,
    name: organization.name,
    legalName: organization.legal_name,
    registrationNumber: organization.registration_number,
    vatId: organization.vat_id,
    billingEmail: organization.billing_email,
    billingCountry: organization.billing_country,
    billingPeriod: organization.billing_period,
    currency: organization.currency,
    planCode: organization.plan_code as OrganizationPlanCode,
    status: organization.status as OrganizationStatus,
    currentPeriodStart: organization.current_period_start,
    currentPeriodEnd: organization.current_period_end,
    cancelAtPeriodEnd: Boolean(organization.cancel_at_period_end),
    renewalMode: organization.renewal_mode as 'automatic_card' | 'manual_invoice',
    isInternalTest: Boolean(organization.is_internal_test),
    role: membership.role as OrganizationRole,
  };
}

export function canManageOrganization(role: OrganizationRole) {
  return role === 'owner' || role === 'admin';
}
