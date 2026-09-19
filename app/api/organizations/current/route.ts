import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getAuthenticatedUserId } from '@/lib/auth';
import { createAdminClient } from '@/lib/supabase/admin';
import { canManageOrganization, getCurrentOrganizationForUser } from '@/lib/organizations';
import { ORGANIZATION_PLANS } from '@/lib/organization-billing-catalog';

export const dynamic = 'force-dynamic';

const PatchSchema = z.object({
  name: z.string().trim().min(2).max(160).optional(),
  legalName: z.string().trim().max(200).nullable().optional(),
  registrationNumber: z.string().trim().max(80).nullable().optional(),
  vatId: z.string().trim().max(80).nullable().optional(),
  billingEmail: z.string().trim().email().max(254).optional(),
});

export async function GET() {
  const { userId } = await getAuthenticatedUserId();
  if (!userId) {
    return NextResponse.json({ error: 'authentication_required' }, { status: 401 });
  }

  let organization;
  try {
    organization = await getCurrentOrganizationForUser(userId);
  } catch (error) {
    console.error('organization current lookup failed', error);
    return NextResponse.json({ error: 'organization_lookup_failed' }, { status: 500 });
  }

  if (!organization) return NextResponse.json({ organization: null });

  const admin = createAdminClient();
  const plan = ORGANIZATION_PLANS[organization.planCode];
  const manager = canManageOrganization(organization.role);
  const monthStart = new Date();
  monthStart.setUTCDate(1);
  monthStart.setUTCHours(0, 0, 0, 0);

  const membersResult = await admin
    .from('organization_memberships')
    .select('user_id, role, joined_at')
    .eq('organization_id', organization.id)
    .eq('status', 'active')
    .order('joined_at', { ascending: true });

  const invitesResult = manager
    ? await admin
      .from('organization_invitations')
      .select('id, email_normalized, role, expires_at, created_at')
      .eq('organization_id', organization.id)
      .eq('status', 'pending')
      .gt('expires_at', new Date().toISOString())
      .order('created_at', { ascending: false })
    : { data: [], error: null };

  const requestsResult = await admin
    .from('generation_requests')
    .select('action, status')
    .eq('organization_id', organization.id)
    .gte('created_at', monthStart.toISOString())
    .in('status', ['pending', 'succeeded']);

  const ordersResult = manager
    ? await admin
      .from('organization_orders')
      .select('id, status, payment_method, amount_minor, currency, billing_period, created_at, paid_at')
      .eq('organization_id', organization.id)
      .order('created_at', { ascending: false })
    : { data: [], error: null };

  if (membersResult.error || invitesResult.error || requestsResult.error || ordersResult.error) {
    console.error('organization summary lookup failed', {
      members: membersResult.error?.code,
      invites: invitesResult.error?.code,
      requests: requestsResult.error?.code,
      orders: ordersResult.error?.code,
    });
    return NextResponse.json({ error: 'organization_summary_failed' }, { status: 500 });
  }

  const memberRows = membersResult.data ?? [];
  const members = manager
    ? await Promise.all(memberRows.map(async (row) => {
      const { data } = await admin.auth.admin.getUserById(row.user_id);
      return {
        userId: row.user_id,
        email: data.user?.email ?? null,
        role: row.role,
        joinedAt: row.joined_at,
      };
    }))
    : memberRows
      .filter((row) => row.user_id === userId)
      .map((row) => ({
        userId: row.user_id,
        email: null,
        role: row.role,
        joinedAt: row.joined_at,
      }));

  const requestRows = requestsResult.data ?? [];
  const lessonUsed = requestRows.filter((row) => row.action === 'generate_lesson').length;
  const revisionUsed = requestRows.filter(
    (row) => row.action === 'revise_lesson' || row.action === 'revise_block',
  ).length;

  return NextResponse.json({
    organization: {
      ...organization,
      plan,
      manager,
      seats: {
        active: memberRows.length,
        pending: (invitesResult.data ?? []).length,
        limit: plan.seatLimit,
      },
      usage: {
        lessonUsed,
        lessonLimit: plan.monthlyLessonLimit,
        revisionUsed,
        revisionLimit: plan.monthlyRevisionLimit,
        shared: true,
      },
      members,
      invitations: invitesResult.data ?? [],
      orders: ordersResult.data ?? [],
    },
  }, { headers: { 'Cache-Control': 'no-store' } });
}

export async function PATCH(request: Request) {
  const { userId } = await getAuthenticatedUserId();
  if (!userId) {
    return NextResponse.json({ error: 'authentication_required' }, { status: 401 });
  }

  let input: z.infer<typeof PatchSchema>;
  try {
    input = PatchSchema.parse(await request.json());
  } catch {
    return NextResponse.json({ error: 'invalid_organization_update' }, { status: 400 });
  }

  const organization = await getCurrentOrganizationForUser(userId);
  if (!organization || !canManageOrganization(organization.role)) {
    return NextResponse.json({ error: 'organization_admin_required' }, { status: 403 });
  }

  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (input.name !== undefined) patch.name = input.name;
  if (input.legalName !== undefined) patch.legal_name = input.legalName || null;
  if (input.registrationNumber !== undefined) patch.registration_number = input.registrationNumber || null;
  if (input.vatId !== undefined) patch.vat_id = input.vatId || null;
  if (input.billingEmail !== undefined) patch.billing_email = input.billingEmail.toLowerCase();

  const admin = createAdminClient();
  const { error } = await admin
    .from('organizations')
    .update(patch)
    .eq('id', organization.id);

  if (error) {
    console.error('organization update failed', error.code);
    return NextResponse.json({ error: 'organization_update_failed' }, { status: 500 });
  }

  return NextResponse.json({ updated: true });
}
