import { NextResponse } from 'next/server';
import { z } from 'zod';
import { LessonSchema } from '@/lib/schema';
import { getAuthenticatedUserId } from '@/lib/auth';
import { ORGANIZATION_PLANS } from '@/lib/organization-billing-catalog';
import { getCurrentOrganizationForUser } from '@/lib/organizations';
import { createAdminClient } from '@/lib/supabase/admin';

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

  const admin = createAdminClient();
  const { data: lesson, error: lessonError } = await admin
    .from('lessons')
    .select('id, title, lesson')
    .eq('id', input.lessonId)
    .eq('owner_id', userId)
    .maybeSingle();

  if (lessonError) {
    return NextResponse.json({ error: 'lesson_lookup_failed' }, { status: 500 });
  }
  if (!lesson) {
    return NextResponse.json({ error: 'lesson_not_found' }, { status: 404 });
  }

  let snapshot;
  try {
    snapshot = LessonSchema.parse(lesson.lesson);
  } catch {
    return NextResponse.json({ error: 'lesson_snapshot_invalid' }, { status: 409 });
  }

  const { data: created, error } = await admin
    .from('organization_lesson_library')
    .insert({
      organization_id: organization.id,
      source_lesson_id: lesson.id,
      published_by: userId,
      title: lesson.title,
      snapshot,
    })
    .select('id, title, published_by, created_at')
    .single();

  if (error?.code === '23505') {
    return NextResponse.json({ error: 'lesson_already_in_school_library' }, { status: 409 });
  }
  if (error || !created) {
    console.error('organization library publish failed', error);
    return NextResponse.json({ error: 'organization_library_publish_failed' }, { status: 500 });
  }

  return NextResponse.json({ entry: created }, { status: 201 });
}
