import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getAuthenticatedUserId } from '@/lib/auth';
import { canManageOrganization, getCurrentOrganizationForUser } from '@/lib/organizations';
import { createAdminClient } from '@/lib/supabase/admin';

const ParamsSchema = z.object({
  invitationId: z.string().uuid(),
});

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ invitationId: string }> },
) {
  const { userId } = await getAuthenticatedUserId();
  if (!userId) {
    return NextResponse.json({ error: 'authentication_required' }, { status: 401 });
  }

  let invitationId: string;
  try {
    invitationId = ParamsSchema.parse(await params).invitationId;
  } catch {
    return NextResponse.json({ error: 'invalid_invitation_id' }, { status: 400 });
  }

  const organization = await getCurrentOrganizationForUser(userId);
  if (!organization || !canManageOrganization(organization.role)) {
    return NextResponse.json({ error: 'organization_admin_required' }, { status: 403 });
  }

  const admin = createAdminClient();
  const { data: invitation, error: lookupError } = await admin
    .from('organization_invitations')
    .select('id')
    .eq('id', invitationId)
    .eq('organization_id', organization.id)
    .eq('status', 'pending')
    .maybeSingle();

  if (lookupError) {
    console.error('organization invitation revoke lookup failed', lookupError.code);
    return NextResponse.json({ error: 'invitation_lookup_failed' }, { status: 500 });
  }
  if (!invitation) {
    return NextResponse.json({ error: 'pending_invitation_not_found' }, { status: 404 });
  }

  const now = new Date().toISOString();
  const { data: revokedInvitation, error } = await admin
    .from('organization_invitations')
    .update({ status: 'revoked', updated_at: now })
    .eq('id', invitationId)
    .eq('organization_id', organization.id)
    .eq('status', 'pending')
    .select('id')
    .maybeSingle();

  if (error) {
    console.error('organization invitation revoke failed', error.code);
    return NextResponse.json({ error: 'invitation_revoke_failed' }, { status: 500 });
  }
  if (!revokedInvitation) {
    return NextResponse.json({ error: 'pending_invitation_not_found' }, { status: 409 });
  }

  return NextResponse.json({ revoked: true });
}
