import { NextResponse } from 'next/server';
import { z } from 'zod';
import { LessonSchema } from '@/lib/schema';
import { getAuthenticatedUserId } from '@/lib/auth';
import { getLessonOrganizationOriginAccess, organizationOriginLockedMessage } from '@/lib/organization-origin-access';
import { requireTrustedDeviceForPaidAccess, trustedDeviceErrorMessage } from '@/lib/trusted-device-access';
import { LOCALE_REQUEST_HEADER, normalizeUiLocale } from '@/lib/i18n';
import {
  LessonContentWriteError,
  readLessonContentForWrite,
  writeLessonContent,
} from '@/lib/lesson-content-writer';
import { applyManualBlockEdit } from '@/lib/manual-block-edit';

// Manual activity edit without AI: same gates as PUT /api/lessons/[id], no AI
// call and no AI quota. The strict whitelist rejects correctAnswer, points,
// gradingRubric, dataTable, type, id and anything else.
const ManualBlockEditSchema = z.object({
  title: z.string().max(300).optional(),
  instructions: z.string().max(10000).optional(),
  durationMinutes: z.number().int().optional(),
  items: z.array(z.string().max(2000)).max(12).optional(),
  options: z.array(z.string().max(2000)).max(10).optional(),
  revealText: z.string().max(10000).optional(),
  teacherNote: z.string().max(10000).optional(),
}).strict();

type RouteContext = {
  params: Promise<{ id: string; blockId: string }>;
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
  const english = normalizeUiLocale(req.headers.get(LOCALE_REQUEST_HEADER)) === 'en';
  const { supabase, userId } = await getAuthenticatedUserId();
  if (!userId) return NextResponse.json({ error: 'Nejdřív se přihlas.' }, { status: 401 });
  const deviceLocked = await trustedDeviceLockResponse(userId);
  if (deviceLocked) return deviceLocked;

  try {
    const { id, blockId } = await params;
    const locked = await schoolLicenseLockResponse(userId, id);
    if (locked) return locked;

    const parsed = ManualBlockEditSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      const unsupportedField = parsed.error.issues.some((issue) => issue.code === 'unrecognized_keys');
      return NextResponse.json({
        error: unsupportedField
          ? english
            ? 'A manual edit changes only the texts and duration of an activity. Only an AI edit changes the correct answer, points and activity type.'
            : 'Ruční úprava mění jen texty a minutáž aktivity. Správnou odpověď, body a typ aktivity mění jen úprava s AI.'
          : english
            ? 'The activity changes are not valid. Check the texts and the duration.'
            : 'Změny aktivity nejsou platné. Zkontroluj texty a minutáž.',
      }, { status: 400 });
    }

    const currentLesson = LessonSchema.parse(await readLessonContentForWrite(supabase, userId, id));
    const result = applyManualBlockEdit(currentLesson, blockId, parsed.data);
    if (!result.ok) {
      return NextResponse.json({ error: english ? result.error.en : result.error.cs }, { status: result.status });
    }

    const lesson = LessonSchema.parse(result.lesson);
    await writeLessonContent(supabase, userId, id, lesson);
    return NextResponse.json({ lessonId: id, lesson });
  } catch (error) {
    if (error instanceof LessonContentWriteError && error.code === 'LESSON_NOT_FOUND') {
      return NextResponse.json({ error: 'Lekce nebyla nalezena.' }, { status: 404 });
    }
    console.error('manual block edit failed', error);
    return NextResponse.json({ error: 'Změny aktivity se nepodařilo uložit.' }, { status: 500 });
  }
}
