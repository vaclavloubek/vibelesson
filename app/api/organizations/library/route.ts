import { NextResponse } from 'next/server';
import { z } from 'zod';
import { LessonSchema } from '@/lib/schema';
import { getAuthenticatedUserId } from '@/lib/auth';
import { ORGANIZATION_PLANS } from '@/lib/organization-billing-catalog';
import { getCurrentOrganizationForUser } from '@/lib/organizations';
import { createAdminClient } from '@/lib/supabase/admin';
import { assertApprovedNeonCutover, getDatabaseBackend } from '@/lib/neon/config';
import { createNeonSql } from '@/lib/neon/server';

const InputSchema = z.object({
  lessonId: z.string().uuid(),
});

export async function POST(request: Request) {
  const { userId } = await getAuthenticatedUserId();
  if (!userId) {
    return NextResponse.json({ error: 'authentication_required' }, { status: 401 });
  }

  let input: z.infer<typeof InputSchema>;
  try {
    input = InputSchema.parse(await request.json());
  } catch {
    return NextResponse.json({ error: 'invalid_library_publish_request' }, { status: 400 });
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
      { error: 'organization_library_publish_requires_active_license' },
      { status: 409 },
    );
  }

  const { data: lesson, error: lessonError } = getDatabaseBackend() === 'neon'
    ? await (async () => {
      assertApprovedNeonCutover();
      const rows = await createNeonSql()`
        select id, title, lesson, organization_origin_id
        from public.lessons where id = ${input.lessonId}::uuid
          and owner_id = ${userId}::uuid limit 1
      `;
      return { data: rows[0] ?? null, error: null };
    })()
    : await createAdminClient().from('lessons')
      .select('id, title, lesson, organization_origin_id')
      .eq('id', input.lessonId).eq('owner_id', userId).maybeSingle();

  if (lessonError) {
    return NextResponse.json({ error: 'lesson_lookup_failed' }, { status: 500 });
  }
  if (!lesson) {
    return NextResponse.json({ error: 'lesson_not_found' }, { status: 404 });
  }
  if (
    lesson.organization_origin_id
    && lesson.organization_origin_id !== organization.id
  ) {
    return NextResponse.json({ error: 'organization_origin_mismatch' }, { status: 409 });
  }

  let snapshot;
  try {
    snapshot = LessonSchema.parse(lesson.lesson);
  } catch {
    return NextResponse.json({ error: 'lesson_snapshot_invalid' }, { status: 409 });
  }

  const subject = snapshot.subject?.replace(/\s+/g, ' ').trim() || null;
  const { data: created, error } = getDatabaseBackend() === 'neon'
    ? await (async () => {
      try {
        assertApprovedNeonCutover();
        const rows = await createNeonSql()`
          insert into public.organization_lesson_library
            (organization_id, source_lesson_id, published_by, title, subject, snapshot)
          values (${organization.id}::uuid, ${String(lesson.id)}::uuid,
            ${userId}::uuid, ${String(lesson.title)}, ${subject}, ${JSON.stringify(snapshot)}::jsonb)
          returning id, title, subject, published_by, created_at
        `;
        return { data: rows[0] ?? null, error: null };
      } catch (cause) {
        return { data: null, error: { code: cause && typeof cause === 'object' && 'code' in cause
          ? String(cause.code) : 'neon_library_publish_failed' } };
      }
    })()
    : await createAdminClient().from('organization_lesson_library')
      .insert({
        organization_id: organization.id,
        source_lesson_id: lesson.id,
        published_by: userId,
        title: lesson.title,
        subject,
        snapshot,
      })
      .select('id, title, subject, published_by, created_at').single();

  if (error?.code === '23505') {
    return NextResponse.json({ error: 'lesson_already_in_school_library' }, { status: 409 });
  }
  if (error || !created) {
    console.error('organization library publish failed', error);
    return NextResponse.json({ error: 'organization_library_publish_failed' }, { status: 500 });
  }

  return NextResponse.json({ entry: created }, { status: 201 });
}
