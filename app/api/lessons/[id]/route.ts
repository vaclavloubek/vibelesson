import { NextResponse } from 'next/server';
import { z } from 'zod';
import { LessonSchema } from '@/lib/schema';
import { getAuthenticatedUserId } from '@/lib/auth';
import { getLessonOrganizationOriginAccess, organizationOriginLockedMessage } from '@/lib/organization-origin-access';
import { requireTrustedDeviceForPaidAccess, trustedDeviceErrorMessage } from '@/lib/trusted-device-access';
import { freeDeviceBudgetMessage } from '@/lib/free-device-budget';
import {
  LessonContentWriteError,
  readLessonContentForWrite,
  writeLessonContent,
} from '@/lib/lesson-content-writer';
import { deleteOwnedLesson, LessonDeleteWriteError } from '@/lib/lesson-delete-writer';
import { duplicateOwnedLesson, LessonDuplicateWriteError } from '@/lib/lesson-duplicate-writer';

const RenameSchema = z.object({
  title: z.string().trim().min(1).max(200),
});

const ReplaceLessonSchema = z.object({
  lesson: LessonSchema,
});

type RouteContext = {
  params: Promise<{ id: string }>;
};

async function schoolLicenseLockResponse(userId: string, lessonId: string) {
  const access = await getLessonOrganizationOriginAccess(userId, lessonId);
  if (!access?.locked) return null;
  return NextResponse.json({
    error: organizationOriginLockedMessage(access.organizationName),
    code: 'organization_origin_access_required',
  }, { status: 403 });
}

async function trustedDeviceLockResponse(userId: string) {
  const gate = await requireTrustedDeviceForPaidAccess(userId);
  if (gate.allowed) return null;
  return NextResponse.json({
    error: trustedDeviceErrorMessage(gate),
    code: gate.code,
  }, { status: 403 });
}

export async function PATCH(req: Request, { params }: RouteContext) {
  const { supabase, userId } = await getAuthenticatedUserId();
  if (!userId) return NextResponse.json({ error: 'Nejdřív se přihlas.' }, { status: 401 });
  const deviceLocked = await trustedDeviceLockResponse(userId);
  if (deviceLocked) return deviceLocked;

  try {
    const { id } = await params;
    const locked = await schoolLicenseLockResponse(userId, id);
    if (locked) return locked;
    const { title } = RenameSchema.parse(await req.json());

    const lesson = LessonSchema.parse(await readLessonContentForWrite(supabase, userId, id));
    const renamedLesson = LessonSchema.parse({ ...lesson, title });
    await writeLessonContent(supabase, userId, id, renamedLesson);
    return NextResponse.json({ lessonId: id, lesson: renamedLesson });
  } catch (error) {
    if (error instanceof LessonContentWriteError && error.code === 'LESSON_NOT_FOUND') {
      return NextResponse.json({ error: 'Lekce nebyla nalezena.' }, { status: 404 });
    }
    console.error('rename lesson failed', error);
    return NextResponse.json({ error: 'Lekci se nepodařilo přejmenovat.' }, { status: 500 });
  }
}

export async function PUT(req: Request, { params }: RouteContext) {
  const { supabase, userId } = await getAuthenticatedUserId();
  if (!userId) return NextResponse.json({ error: 'Nejdřív se přihlas.' }, { status: 401 });
  const deviceLocked = await trustedDeviceLockResponse(userId);
  if (deviceLocked) return deviceLocked;

  try {
    const { id } = await params;
    const locked = await schoolLicenseLockResponse(userId, id);
    if (locked) return locked;
    const { lesson } = ReplaceLessonSchema.parse(await req.json());

    const currentLesson = LessonSchema.parse(await readLessonContentForWrite(supabase, userId, id));

    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('role, multilingual_lessons_enabled')
      .eq('id', userId)
      .maybeSingle();

    if (profileError) throw profileError;
    const allowLanguageChange = Boolean(
      profile && (profile.role === 'admin' || profile.multilingual_lessons_enabled),
    );

    if (!allowLanguageChange && (lesson.language ?? null) !== (currentLesson.language ?? null)) {
      return NextResponse.json(
        { error: 'Ve Free tarifu nelze změnit hlavní jazyk uložené lekce.' },
        { status: 403 },
      );
    }

    await writeLessonContent(supabase, userId, id, lesson);
    return NextResponse.json({ lessonId: id, lesson });
  } catch (error) {
    if (error instanceof LessonContentWriteError && error.code === 'LESSON_NOT_FOUND') {
      return NextResponse.json({ error: 'Lekce nebyla nalezena.' }, { status: 404 });
    }
    console.error('replace lesson failed', error);
    return NextResponse.json({ error: 'Předchozí verzi se nepodařilo obnovit.' }, { status: 500 });
  }
}

export async function POST(_req: Request, { params }: RouteContext) {
  const { supabase, userId } = await getAuthenticatedUserId();
  if (!userId) return NextResponse.json({ error: 'Nejdřív se přihlas.' }, { status: 401 });
  const deviceLocked = await trustedDeviceLockResponse(userId);
  if (deviceLocked) return deviceLocked;

  try {
    const { id } = await params;
    const locked = await schoolLicenseLockResponse(userId, id);
    if (locked) return locked;
    const result = await duplicateOwnedLesson(supabase, userId, id);

    if (!result.allowed) {
      if (result.denialCode === 'lesson_not_found') {
        return NextResponse.json({ error: 'Lekce nebyla nalezena.' }, { status: 404 });
      }
      if (result.denialCode === 'organization_origin_access_required') {
        return NextResponse.json({
          error: organizationOriginLockedMessage(null),
          code: result.denialCode,
        }, { status: 403 });
      }

      const deviceMessage = freeDeviceBudgetMessage(
        result.denialCode,
        'import',
        result.deviceLimit,
      );
      if (deviceMessage) {
        return NextResponse.json({
          error: deviceMessage,
          code: result.denialCode,
        }, { status: result.denialCode === 'free_device_cookie_required' ? 409 : 429 });
      }

      return NextResponse.json({
        error: `Měsíční limit ${result.monthlyLimit ?? 2} importů nebo kopií je vyčerpaný. Další import nebo kopii můžeš vytvořit příští měsíc.`,
        quota: {
          used: result.used ?? result.monthlyLimit ?? 2,
          monthlyLimit: result.monthlyLimit ?? 2,
          remaining: 0,
        },
      }, { status: 429 });
    }

    return NextResponse.json({ lessonId: result.lessonId });
  } catch (error) {
    if (error instanceof LessonDuplicateWriteError && error.code === 'LESSON_NOT_FOUND') {
      return NextResponse.json({ error: 'Lekce nebyla nalezena.' }, { status: 404 });
    }
    console.error('duplicate lesson failed', error);
    return NextResponse.json({ error: 'Lekci se nepodařilo duplikovat.' }, { status: 500 });
  }
}

export async function DELETE(_req: Request, { params }: RouteContext) {
  const { supabase, userId } = await getAuthenticatedUserId();
  if (!userId) return NextResponse.json({ error: 'Nejdřív se přihlas.' }, { status: 401 });

  try {
    const { id } = await params;
    await deleteOwnedLesson(supabase, userId, id);
    return NextResponse.json({ deleted: true });
  } catch (error) {
    if (error instanceof LessonDeleteWriteError && error.code === 'LESSON_NOT_FOUND') {
      return NextResponse.json({ error: 'Lekce nebyla nalezena.' }, { status: 404 });
    }
    console.error('delete lesson failed', error);
    return NextResponse.json({ error: 'Lekci se nepodařilo smazat.' }, { status: 500 });
  }
}
