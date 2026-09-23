import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getAuthenticatedUserId } from '@/lib/auth';
import { canManageOrganization, getCurrentOrganizationForUser } from '@/lib/organizations';
import { createAdminClient } from '@/lib/supabase/admin';
import { assertApprovedNeonCutover, getDatabaseBackend } from '@/lib/neon/config';
import { createNeonSql } from '@/lib/neon/server';

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

  const { data: invitation, error: lookupError } = getDatabaseBackend() === 'neon'
    ? await (async () => {
      assertApprovedNeonCutover();
      const rows = await createNeonSql()`
        select id from public.organization_invitations
        where id = ${invitationId}::uuid
          and organization_id = ${organization.id}::uuid
          and status = 'pending'
        limit 1
      `;
      return { data: rows[0] ?? null, error: null };
    })()
    : await createAdminClient().from('organization_invitations')
      .select('id').eq('id', invitationId)
      .eq('organization_id', organization.id).eq('status', 'pending').maybeSingle();

  if (lookupError) {
    console.error('organization invitation revoke lookup failed', lookupError.code);
    return NextResponse.json({ error: 'invitation_lookup_failed' }, { status: 500 });
  }
  if (!invitation) {
    return NextResponse.json({ error: 'pending_invitation_not_found' }, { status: 404 });
  }

  const { data: revokedInvitation, error } = getDatabaseBackend() === 'neon'
    ? await (async () => {
      assertApprovedNeonCutover();
      const rows = await createNeonSql()`
        update public.organization_invitations
        set status = 'revoked', updated_at = now()
        where id = ${invitationId}::uuid
          and organization_id = ${organization.id}::uuid
          and status = 'pending'
        returning id
      `;
      return { data: rows[0] ?? null, error: null };
    })()
    : await createAdminClient().from('organization_invitations')
      .update({ status: 'revoked', updated_at: new Date().toISOString() })
      .eq('id', invitationId).eq('organization_id', organization.id)
      .eq('status', 'pending').select('id').maybeSingle();

  if (error) {
    console.error('organization invitation revoke failed', error.code);
    return NextResponse.json({ error: 'invitation_revoke_failed' }, { status: 500 });
  }
  if (!revokedInvitation) {
    return NextResponse.json({ error: 'pending_invitation_not_found' }, { status: 409 });
  }

  return NextResponse.json({ revoked: true });
}
