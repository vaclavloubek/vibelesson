import { NextResponse } from 'next/server';
import { getAuthenticatedUserId } from '@/lib/auth';
import { ORGANIZATION_PLANS } from '@/lib/organization-billing-catalog';
import { getCurrentOrganizationForUser } from '@/lib/organizations';
import { createAdminClient } from '@/lib/supabase/admin';

export async function POST(
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
  if (organization.status !== 'active') {
    return NextResponse.json(
      { error: 'organization_library_import_requires_active_license' },
      { status: 409 },
    );
  }

  const { id } = await params;
  const admin = createAdminClient();

  const { data: entry, error: entryError } = await admin
    .from('organization_lesson_library')
    .select('id, title, snapshot, source_lesson_id')
    .eq('id', id)
    .eq('organization_id', organization.id)
    .maybeSingle();

  if (entryError) {
    return NextResponse.json({ error: 'organization_library_lookup_failed' }, { status: 500 });
  }
  if (!entry) {
    return NextResponse.json({ error: 'organization_library_entry_not_found' }, { status: 404 });
  }

  const { data: existing, error: existingError } = await admin
    .from('lessons')
    .select('id')
    .eq('owner_id', userId)
    .eq('source_organization_library_id', entry.id)
    .maybeSingle();

  if (existingError) {
    return NextResponse.json({ error: 'organization_library_import_lookup_failed' }, { status: 500 });
  }
  if (existing) {
    return NextResponse.json({ lessonId: existing.id, imported: false });
  }

  const { data: created, error: createError } = await admin
    .from('lessons')
    .insert({
      owner_id: userId,
      title: entry.title,
      source_prompt: 'Imported from school library.',
      lesson: entry.snapshot,
      source_lesson_id: entry.source_lesson_id,
      source_organization_library_id: entry.id,
    })
    .select('id')
    .single();

  if (createError?.code === '23505') {
    const { data: raced } = await admin
      .from('lessons')
      .select('id')
      .eq('owner_id', userId)
      .eq('source_organization_library_id', entry.id)
      .maybeSingle();

    if (raced) {
      return NextResponse.json({ lessonId: raced.id, imported: false });
    }
  }

  if (createError || !created) {
    console.error('organization library import failed', createError);
    return NextResponse.json({ error: 'organization_library_import_failed' }, { status: 500 });
  }

  return NextResponse.json({ lessonId: created.id, imported: true }, { status: 201 });
}
