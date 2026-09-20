import { NextResponse } from 'next/server';
import { getAuthenticatedUserId } from '@/lib/auth';
import { canManageOrganization, getCurrentOrganizationForUser } from '@/lib/organizations';
import { createAdminClient } from '@/lib/supabase/admin';

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ userId: string }> },
) {
  const { userId: actorId } = await getAuthenticatedUserId();
  if (!actorId) {
    return NextResponse.json({ error: 'authentication_required' }, { status: 401 });
  }

  const { userId: targetId } = await params;
  const organization = await getCurrentOrganizationForUser(actorId);
  if (!organization || !canManageOrganization(organization.role)) {
    return NextResponse.json({ error: 'organization_admin_required' }, { status: 403 });
  }

  const admin = createAdminClient();
  const { data, error } = await admin.rpc('reset_organization_member_trusted_devices', {
    p_actor_user_id: actorId,
    p_organization_id: organization.id,
    p_target_user_id: targetId,
  });

  if (error) {
    console.error('organization device reset failed', {
      organizationId: organization.id,
      targetId,
      code: error.code,
    });
    return NextResponse.json({ error: 'organization_device_reset_failed' }, { status: 500 });
  }

  const result = data as {
    reset?: boolean;
    code?: string | null;
    revokedCount?: number;
    newIn30Days?: number;
    maxNewIn30Days?: number;
  } | null;

  if (!result?.reset) {
    const code = result?.code ?? 'organization_device_reset_denied';
    const status = code === 'member_not_found'
      ? 404
      : code === 'organization_admin_required'
        ? 403
        : 409;
    return NextResponse.json({ error: code }, { status });
  }

  return NextResponse.json({
    reset: true,
    revokedCount: result.revokedCount ?? 0,
    newIn30Days: result.newIn30Days ?? 0,
    maxNewIn30Days: result.maxNewIn30Days ?? 8,
  });
}
