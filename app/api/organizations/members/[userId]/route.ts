import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getAuthenticatedUserId } from '@/lib/auth';
import { canManageOrganization, getCurrentOrganizationForUser } from '@/lib/organizations';
import { createAdminClient } from '@/lib/supabase/admin';

const PatchSchema = z.object({ role: z.enum(['admin', 'teacher']) });

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ userId: string }> },
) {
  const { userId: actorId } = await getAuthenticatedUserId();
  if (!actorId) {
    return NextResponse.json({ error: 'authentication_required' }, { status: 401 });
  }
  const { userId: targetId } = await params;

  let input: z.infer<typeof PatchSchema>;
  try {
    input = PatchSchema.parse(await request.json());
  } catch {
    return NextResponse.json({ error: 'invalid_member_update' }, { status: 400 });
  }

  const organization = await getCurrentOrganizationForUser(actorId);
  if (!organization || !canManageOrganization(organization.role)) {
    return NextResponse.json({ error: 'organization_admin_required' }, { status: 403 });
  }

  const admin = createAdminClient();
  const { data: target, error: lookupError } = await admin
    .from('organization_memberships')
    .select('role')
    .eq('organization_id', organization.id)
    .eq('user_id', targetId)
    .eq('status', 'active')
    .maybeSingle();

  if (lookupError || !target) {
    return NextResponse.json({ error: 'member_not_found' }, { status: 404 });
  }
  if (target.role === 'owner') {
    return NextResponse.json({ error: 'owner_role_locked' }, { status: 409 });
  }

  const { error } = await admin
    .from('organization_memberships')
    .update({ role: input.role, updated_at: new Date().toISOString() })
    .eq('organization_id', organization.id)
    .eq('user_id', targetId)
    .eq('status', 'active');

  if (error) {
    console.error('organization member update failed', error.code);
    return NextResponse.json({ error: 'member_update_failed' }, { status: 500 });
  }
  return NextResponse.json({ updated: true });
}

export async function DELETE(
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
  const { data: target, error: lookupError } = await admin
    .from('organization_memberships')
    .select('role')
    .eq('organization_id', organization.id)
    .eq('user_id', targetId)
    .eq('status', 'active')
    .maybeSingle();

  if (lookupError || !target) {
    return NextResponse.json({ error: 'member_not_found' }, { status: 404 });
  }
  if (target.role === 'owner') {
    return NextResponse.json({ error: 'owner_cannot_be_removed' }, { status: 409 });
  }

  const { error } = await admin
    .from('organization_memberships')
    .update({
      status: 'revoked',
      revoked_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('organization_id', organization.id)
    .eq('user_id', targetId)
    .eq('status', 'active');

  if (error) {
    console.error('organization member removal failed', error.code);
    return NextResponse.json({ error: 'member_remove_failed' }, { status: 500 });
  }
  return NextResponse.json({ removed: true });
}
