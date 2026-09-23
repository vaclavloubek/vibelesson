import { NextResponse } from 'next/server';
import { getAuthenticatedUserId } from '@/lib/auth';
import { canManageOrganization, getCurrentOrganizationForUser } from '@/lib/organizations';
import { createPrivilegedRpcClient } from '@/lib/neon/privileged-rpc';

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

  const admin = createPrivilegedRpcClient();
  const { data, error } = await admin.rpc('reset_organization_member_devices_server', {
    p_actor_id: actorId,
    p_organization_id: organization.id,
    p_member_user_id: targetId,
  });

  if (error) {
    if (error.message.includes('owner_device_reset_locked')) {
      return NextResponse.json({ error: 'owner_device_reset_locked' }, { status: 409 });
    }
    if (error.message.includes('organization_member_not_found')) {
      return NextResponse.json({ error: 'member_not_found' }, { status: 404 });
    }
    if (error.message.includes('organization_admin_required')) {
      return NextResponse.json({ error: 'organization_admin_required' }, { status: 403 });
    }

    console.error('organization member device reset failed', {
      code: error.code,
      organizationId: organization.id,
      targetId,
    });
    return NextResponse.json({ error: 'member_device_reset_failed' }, { status: 500 });
  }

  return NextResponse.json(data ?? {
    reset: true,
    revokedCount: 0,
    newIn30Days: 0,
    maxNewIn30Days: 10,
  });
}
