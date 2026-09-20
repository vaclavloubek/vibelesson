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
  const devicePolicyActive = organization.status === 'active';
  const monthStart = new Date();
  monthStart.setUTCDate(1);
  monthStart.setUTCHours(0, 0, 0, 0);

  const lifecycleResult = await admin
    .from('organizations')
    .select('renewal_mode, cancel_at_period_end, past_due_at')
    .eq('id', organization.id)
    .maybeSingle();

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
    .select('user_id, action, status')
    .eq('organization_id', organization.id)
    .gte('created_at', monthStart.toISOString())
    .in('status', ['pending', 'succeeded']);

  const libraryResult = plan.libraryEnabled
    ? await admin
      .from('organization_lesson_library')
      .select('id, title, subject, published_by, created_at')
      .eq('organization_id', organization.id)
      .order('created_at', { ascending: false })
    : { data: [], error: null };

  const ownLessonsResult = plan.libraryEnabled
    ? await admin
      .from('lessons')
      .select('id, title, updated_at')
      .eq('owner_id', userId)
      .order('updated_at', { ascending: false })
      .limit(200)
    : { data: [], error: null };

  const seatUsageResult = await admin.rpc('get_organization_seat_usage', {
    p_organization_id: organization.id,
  });

  const deviceUsageResult = manager && devicePolicyActive
    ? await admin.rpc('get_organization_member_device_usage_server', {
      p_actor_id: userId,
      p_organization_id: organization.id,
    })
    : { data: [], error: null };

  const ordersResult = manager
    ? await admin
      .from('organization_orders')
      .select('id, status, payment_method, amount_minor, currency, billing_period, created_at, paid_at, hosted_invoice_url, invoice_pdf_url, external_subscription_id, livemode, invoice_number, invoice_issued_at, invoice_due_date, payment_confirmation_source, bank_transaction_reference')
      .eq('organization_id', organization.id)
      .order('created_at', { ascending: false })
    : { data: [], error: null };

  if (
    lifecycleResult.error
    || !lifecycleResult.data
    || membersResult.error
    || invitesResult.error
    || requestsResult.error
    || libraryResult.error
    || ownLessonsResult.error
    || seatUsageResult.error
    || deviceUsageResult.error
    || ordersResult.error
  ) {
    console.error('organization summary lookup failed', {
      lifecycle: lifecycleResult.error?.code,
      members: membersResult.error?.code,
      invites: invitesResult.error?.code,
      requests: requestsResult.error?.code,
      library: libraryResult.error?.code,
      ownLessons: ownLessonsResult.error?.code,
      seats: seatUsageResult.error?.code,
      devices: deviceUsageResult.error?.code,
      orders: ordersResult.error?.code,
    });
    return NextResponse.json({ error: 'organization_summary_failed' }, { status: 500 });
  }

  const memberRows = membersResult.data ?? [];
  const deviceUsageRows = Array.isArray(deviceUsageResult.data)
    ? deviceUsageResult.data as Array<{
      userId?: string;
      activeCount?: number;
      maxActive?: number;
      newIn30Days?: number;
      maxNewIn30Days?: number;
    }>
    : [];
  const deviceUsageByUser = new Map(
    deviceUsageRows
      .filter((row): row is typeof row & { userId: string } => typeof row.userId === 'string')
      .map((row) => [row.userId, row]),
  );

  const members = manager
    ? await Promise.all(memberRows.map(async (row) => {
      const { data } = await admin.auth.admin.getUserById(row.user_id);
      const devices = deviceUsageByUser.get(row.user_id);
      return {
        userId: row.user_id,
        email: data.user?.email ?? null,
        role: row.role,
        joinedAt: row.joined_at,
        devices: devicePolicyActive ? {
          activeCount: devices?.activeCount ?? 0,
          maxActive: devices?.maxActive ?? 5,
          newIn30Days: devices?.newIn30Days ?? 0,
          maxNewIn30Days: devices?.maxNewIn30Days ?? 10,
        } : null,
      };
    }))
    : memberRows
      .filter((row) => row.user_id === userId)
      .map((row) => ({
        userId: row.user_id,
        email: null,
        role: row.role,
        joinedAt: row.joined_at,
        devices: null,
      }));

  const requestRows = requestsResult.data ?? [];
  const lessonUsed = requestRows.filter((row) => row.action === 'generate_lesson').length;
  const revisionUsed = requestRows.filter(
    (row) => row.action === 'revise_lesson' || row.action === 'revise_block',
  ).length;

  const usageByMember = manager
    ? memberRows.map((member) => {
      const memberRequests = requestRows.filter((row) => row.user_id === member.user_id);
      const memberInfo = members.find((item) => item.userId === member.user_id);
      return {
        userId: member.user_id,
        email: memberInfo?.email ?? null,
        lessonUsed: memberRequests.filter((row) => row.action === 'generate_lesson').length,
        revisionUsed: memberRequests.filter(
          (row) => row.action === 'revise_lesson' || row.action === 'revise_block',
        ).length,
      };
    })
    : [];

  const seatUsage = seatUsageResult.data as {
    active?: number;
    pending?: number;
    limit?: number;
    periodUniqueUsed?: number;
    periodUniqueLimit?: number;
    replacementAllowance?: number;
    pendingNewReservations?: number;
    periodStart?: string | null;
    periodEnd?: string | null;
  } | null;

  return NextResponse.json({
    organization: {
      ...organization,
      plan,
      manager,
      renewalMode: lifecycleResult.data.renewal_mode,
      cancelAtPeriodEnd: lifecycleResult.data.cancel_at_period_end,
      pastDueAt: lifecycleResult.data.past_due_at,
      seats: {
        active: seatUsage?.active ?? memberRows.length,
        pending: seatUsage?.pending ?? (invitesResult.data ?? []).length,
        limit: seatUsage?.limit ?? plan.seatLimit,
        periodUniqueUsed: seatUsage?.periodUniqueUsed ?? 0,
        periodUniqueLimit: seatUsage?.periodUniqueLimit ?? (
          plan.seatLimit + Math.max(1, Math.ceil(plan.seatLimit * 0.10))
        ),
        replacementAllowance: seatUsage?.replacementAllowance ?? Math.max(
          1,
          Math.ceil(plan.seatLimit * 0.10),
        ),
        pendingNewReservations: seatUsage?.pendingNewReservations ?? 0,
        periodStart: seatUsage?.periodStart ?? null,
        periodEnd: seatUsage?.periodEnd ?? null,
      },
      usage: {
        lessonUsed,
        lessonLimit: plan.monthlyLessonLimit,
        revisionUsed,
        revisionLimit: plan.monthlyRevisionLimit,
        shared: true,
      },
      usageByMember,
      libraryEnabled: plan.libraryEnabled,
      library: libraryResult.data ?? [],
      ownLessons: ownLessonsResult.data ?? [],
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
