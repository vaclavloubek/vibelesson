import { NextResponse } from 'next/server';
import { getAuthenticatedUserId } from '@/lib/auth';
import { ORGANIZATION_PLANS } from '@/lib/organization-billing-catalog';
import { canManageOrganization, getCurrentOrganizationForUser } from '@/lib/organizations';
import { createAdminClient } from '@/lib/supabase/admin';
import { assertApprovedNeonCutover, getDatabaseBackend } from '@/lib/neon/config';
import { createNeonSql } from '@/lib/neon/server';

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { userId } = await getAuthenticatedUserId();
  if (!userId) {
    return NextResponse.json({ error: 'authentication_required' }, { status: 401 });
  }

  const organization = await getCurrentOrganizationForUser(userId);
  if (!organization) {
    return NextResponse.json({ error: 'organization_membership_required' }, { status: 403 });
  }

  const plan = ORGANIZATION_PLANS[organization.planCode];
  if (!plan.libraryEnabled) {
    return NextResponse.json({ error: 'organization_library_not_available' }, { status: 403 });
  }

  const { id } = await params;
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)) {
    return NextResponse.json({ error: 'organization_library_entry_not_found' }, { status: 404 });
  }
  const { data: entry, error: lookupError } = getDatabaseBackend() === 'neon'
    ? await (async () => {
      assertApprovedNeonCutover();
      const rows = await createNeonSql()`
        select id, published_by from public.organization_lesson_library
        where id = ${id}::uuid and organization_id = ${organization.id}::uuid limit 1
      `;
      return { data: rows[0] ?? null, error: null };
    })()
    : await createAdminClient().from('organization_lesson_library')
      .select('id, published_by').eq('id', id)
      .eq('organization_id', organization.id).maybeSingle();

  if (lookupError) {
    return NextResponse.json({ error: 'organization_library_lookup_failed' }, { status: 500 });
  }
  if (!entry) {
    return NextResponse.json({ error: 'organization_library_entry_not_found' }, { status: 404 });
  }

  if (!canManageOrganization(organization.role) && entry.published_by !== userId) {
    return NextResponse.json({ error: 'organization_library_remove_forbidden' }, { status: 403 });
  }

  const { error } = getDatabaseBackend() === 'neon'
    ? await (async () => {
      assertApprovedNeonCutover();
      const rows = await createNeonSql()`
        delete from public.organization_lesson_library
        where id = ${id}::uuid and organization_id = ${organization.id}::uuid
        returning id
      `;
      return { error: rows.length === 1 ? null : { code: 'entry_not_found' } };
    })()
    : await createAdminClient().from('organization_lesson_library')
      .delete().eq('id', entry.id).eq('organization_id', organization.id);

  if (error) {
    return NextResponse.json({ error: 'organization_library_remove_failed' }, { status: 500 });
  }

  return NextResponse.json({ removed: true });
}
