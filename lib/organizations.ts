import { createAdminClient } from '@/lib/supabase/admin';
import { ORGANIZATION_PLANS, type OrganizationPlanCode } from '@/lib/organization-billing-catalog';
import { assertApprovedNeonCutover, getDatabaseBackend } from '@/lib/neon/config';
import { createNeonSql } from '@/lib/neon/server';

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
  let membership: { organization_id: string; role: string } | null;
  let organization: Record<string, unknown> | null;

  if (getDatabaseBackend() === 'neon') {
    assertApprovedNeonCutover();
    const sql = createNeonSql();
    const rows = await sql`
      select
        membership.organization_id::text as organization_id,
        membership.role,
        organization.id::text as id,
        organization.name,
        organization.legal_name,
        organization.registration_number,
        organization.vat_id,
        organization.billing_email,
        organization.billing_country,
        organization.billing_period,
        organization.currency,
        organization.plan_code,
        organization.status,
        organization.current_period_start::text as current_period_start,
        organization.current_period_end::text as current_period_end,
        organization.cancel_at_period_end,
        organization.renewal_mode,
        organization.is_internal_test
      from public.organization_memberships membership
      left join public.organizations organization on organization.id = membership.organization_id
      where membership.user_id = ${userId}::uuid
        and membership.status = 'active'
        and membership.revoked_at is null
      limit 2
    `;
    if (rows.length > 1) throw new Error('organization_membership_lookup_failed');
    if (rows.length === 0) return null;
    membership = {
      organization_id: rows[0].organization_id as string,
      role: rows[0].role as string,
    };
    organization = rows[0] as Record<string, unknown>;
  } else {
    const admin = createAdminClient();

    const membershipResult = await admin
      .from('organization_memberships')
      .select('organization_id, role')
      .eq('user_id', userId)
      .eq('status', 'active')
      .maybeSingle();

    if (membershipResult.error) throw new Error('organization_membership_lookup_failed');
    if (!membershipResult.data) return null;
    membership = membershipResult.data;

    const organizationResult = await admin
      .from('organizations')
      .select(
        'id, name, legal_name, registration_number, vat_id, billing_email, billing_country, billing_period, currency, plan_code, status, current_period_start, current_period_end, cancel_at_period_end, renewal_mode, is_internal_test',
      )
      .eq('id', membership.organization_id)
      .maybeSingle();
    if (organizationResult.error) throw new Error('organization_lookup_failed');
    organization = organizationResult.data;
  }

  if (!organization || !organization.id) throw new Error('organization_lookup_failed');
  if (typeof organization.plan_code !== 'string' || !(organization.plan_code in ORGANIZATION_PLANS)) {
    throw new Error('organization_plan_invalid');
  }

  return {
    id: organization.id as string,
    name: organization.name as string,
    legalName: organization.legal_name as string | null,
    registrationNumber: organization.registration_number as string | null,
    vatId: organization.vat_id as string | null,
    billingEmail: organization.billing_email as string,
    billingCountry: organization.billing_country as string,
    billingPeriod: organization.billing_period as 'monthly' | 'annual',
    currency: organization.currency as 'czk' | 'eur' | 'usd',
    planCode: organization.plan_code as OrganizationPlanCode,
    status: organization.status as OrganizationStatus,
    currentPeriodStart: organization.current_period_start as string | null,
    currentPeriodEnd: organization.current_period_end as string | null,
    cancelAtPeriodEnd: Boolean(organization.cancel_at_period_end),
    renewalMode: organization.renewal_mode as 'automatic_card' | 'manual_invoice',
    isInternalTest: Boolean(organization.is_internal_test),
    role: membership.role as OrganizationRole,
  };
}

export function canManageOrganization(role: OrganizationRole) {
  return role === 'owner' || role === 'admin';
}
