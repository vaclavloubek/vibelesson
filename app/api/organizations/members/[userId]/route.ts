import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getAuthenticatedUserId } from '@/lib/auth';
import { canManageOrganization, getCurrentOrganizationForUser } from '@/lib/organizations';
import { createAdminClient } from '@/lib/supabase/admin';
import { assertApprovedNeonCutover, getDatabaseBackend } from '@/lib/neon/config';
import { createNeonSql } from '@/lib/neon/server';

const PatchSchema = z.object({ role: z.enum(['admin', 'teacher']) });
const UuidSchema = z.string().uuid();

async function readActiveMember(organizationId: string, targetId: string) {
  if (getDatabaseBackend() === 'neon') {
    assertApprovedNeonCutover();
    const rows = await createNeonSql()`
      select role from public.organization_memberships
      where organization_id = ${organizationId}::uuid
        and user_id = ${targetId}::uuid and status = 'active' limit 1
    `;
    return { data: rows[0] ?? null, error: null };
  }
  return createAdminClient().from('organization_memberships')
    .select('role').eq('organization_id', organizationId)
    .eq('user_id', targetId).eq('status', 'active').maybeSingle();
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ userId: string }> },
) {
  const { userId: actorId } = await getAuthenticatedUserId();
  if (!actorId) {
    return NextResponse.json({ error: 'authentication_required' }, { status: 401 });
  }
  const { userId: targetId } = await params;
  if (!UuidSchema.safeParse(targetId).success) {
    return NextResponse.json({ error: 'member_not_found' }, { status: 404 });
  }

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

  const { data: target, error: lookupError } = await readActiveMember(organization.id, targetId);

  if (lookupError || !target) {
    return NextResponse.json({ error: 'member_not_found' }, { status: 404 });
  }
  if (target.role === 'owner') {
    return NextResponse.json({ error: 'owner_role_locked' }, { status: 409 });
  }

  const { error } = getDatabaseBackend() === 'neon'
    ? await (async () => {
      assertApprovedNeonCutover();
      const rows = await createNeonSql()`
        update public.organization_memberships
        set role = ${input.role}, updated_at = now()
        where organization_id = ${organization.id}::uuid
          and user_id = ${targetId}::uuid and status = 'active' and role <> 'owner'
        returning user_id
      `;
      return { error: rows.length === 1 ? null : { code: 'member_not_found' } };
    })()
    : await createAdminClient().from('organization_memberships')
      .update({ role: input.role, updated_at: new Date().toISOString() })
      .eq('organization_id', organization.id).eq('user_id', targetId).eq('status', 'active');

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
  if (!UuidSchema.safeParse(targetId).success) {
    return NextResponse.json({ error: 'member_not_found' }, { status: 404 });
  }

  const organization = await getCurrentOrganizationForUser(actorId);
  if (!organization || !canManageOrganization(organization.role)) {
    return NextResponse.json({ error: 'organization_admin_required' }, { status: 403 });
  }

  const { data: target, error: lookupError } = await readActiveMember(organization.id, targetId);

  if (lookupError || !target) {
    return NextResponse.json({ error: 'member_not_found' }, { status: 404 });
  }
  if (target.role === 'owner') {
    return NextResponse.json({ error: 'owner_cannot_be_removed' }, { status: 409 });
  }

  const { error } = getDatabaseBackend() === 'neon'
    ? await (async () => {
      assertApprovedNeonCutover();
      const rows = await createNeonSql()`
        update public.organization_memberships
        set status = 'revoked', revoked_at = now(), updated_at = now()
        where organization_id = ${organization.id}::uuid
          and user_id = ${targetId}::uuid and status = 'active' and role <> 'owner'
        returning user_id
      `;
      return { error: rows.length === 1 ? null : { code: 'member_not_found' } };
    })()
    : await createAdminClient().from('organization_memberships')
      .update({
        status: 'revoked',
        revoked_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('organization_id', organization.id).eq('user_id', targetId).eq('status', 'active');

  if (error) {
    console.error('organization member removal failed', error.code);
    return NextResponse.json({ error: 'member_remove_failed' }, { status: 500 });
  }
  return NextResponse.json({ removed: true });
}
