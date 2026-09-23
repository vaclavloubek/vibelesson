import { NextResponse } from 'next/server';
import { getAuthenticatedUserId } from '@/lib/auth';
import { ORGANIZATION_PLANS } from '@/lib/organization-billing-catalog';
import { getCurrentOrganizationForUser } from '@/lib/organizations';
import { createAdminClient } from '@/lib/supabase/admin';
import { assertApprovedNeonCutover, getDatabaseBackend } from '@/lib/neon/config';
import { createNeonSql } from '@/lib/neon/server';

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
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)) {
    return NextResponse.json({ error: 'organization_library_entry_not_found' }, { status: 404 });
  }
  const admin = getDatabaseBackend() === 'neon' ? null : createAdminClient();

  const { data: entry, error: entryError } = getDatabaseBackend() === 'neon'
    ? await (async () => {
      assertApprovedNeonCutover();
      const rows = await createNeonSql()`
        select id, title, snapshot, source_lesson_id
        from public.organization_lesson_library
        where id = ${id}::uuid and organization_id = ${organization.id}::uuid limit 1
      `;
      return { data: rows[0] ?? null, error: null };
    })()
    : await admin!.from('organization_lesson_library')
      .select('id, title, snapshot, source_lesson_id')
      .eq('id', id).eq('organization_id', organization.id).maybeSingle();

  if (entryError) {
    return NextResponse.json({ error: 'organization_library_lookup_failed' }, { status: 500 });
  }
  if (!entry) {
    return NextResponse.json({ error: 'organization_library_entry_not_found' }, { status: 404 });
  }

  const { data: existing, error: existingError } = getDatabaseBackend() === 'neon'
    ? await (async () => {
      assertApprovedNeonCutover();
      const rows = await createNeonSql()`
        select id from public.lessons
        where owner_id = ${userId}::uuid
          and source_organization_library_id = ${id}::uuid limit 1
      `;
      return { data: rows[0] ?? null, error: null };
    })()
    : await admin!.from('lessons').select('id').eq('owner_id', userId)
      .eq('source_organization_library_id', entry.id).maybeSingle();

  if (existingError) {
    return NextResponse.json({ error: 'organization_library_import_lookup_failed' }, { status: 500 });
  }
  if (existing) {
    return NextResponse.json({ lessonId: existing.id, imported: false });
  }

  const { data: created, error: createError } = getDatabaseBackend() === 'neon'
    ? await (async () => {
      try {
        assertApprovedNeonCutover();
        const rows = await createNeonSql()`
          insert into public.lessons
            (owner_id, title, source_prompt, lesson, source_lesson_id,
              source_organization_library_id)
          values (${userId}::uuid, ${String(entry.title)},
            'Imported from school library.', ${JSON.stringify(entry.snapshot)}::jsonb,
            ${entry.source_lesson_id ? String(entry.source_lesson_id) : null}::uuid, ${id}::uuid)
          on conflict (owner_id, source_organization_library_id)
            where source_organization_library_id is not null do nothing
          returning id
        `;
        return { data: rows[0] ?? null, error: rows.length ? null : { code: '23505' } };
      } catch (cause) {
        return { data: null, error: { code: cause && typeof cause === 'object' && 'code' in cause
          ? String(cause.code) : 'neon_library_import_failed' } };
      }
    })()
    : await admin!.from('lessons').insert({
      owner_id: userId,
      title: entry.title,
      source_prompt: 'Imported from school library.',
      lesson: entry.snapshot,
      source_lesson_id: entry.source_lesson_id,
      source_organization_library_id: entry.id,
    }).select('id').single();

  if (createError?.code === '23505') {
    const { data: raced } = getDatabaseBackend() === 'neon'
      ? await (async () => {
        const rows = await createNeonSql()`
          select id from public.lessons
          where owner_id = ${userId}::uuid
            and source_organization_library_id = ${id}::uuid limit 1
        `;
        return { data: rows[0] ?? null };
      })()
      : await admin!.from('lessons').select('id')
        .eq('owner_id', userId).eq('source_organization_library_id', entry.id).maybeSingle();

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
