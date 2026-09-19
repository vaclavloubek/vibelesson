import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getAuthenticatedUserId } from '@/lib/auth';
import { getLessonFolderEntitlement } from '@/lib/lesson-folders';
import { getOrganizationOriginAccessMap } from '@/lib/organization-origin-access';
import { requireTrustedDeviceForPaidIndividual, trustedDeviceErrorMessage } from '@/lib/trusted-device-access';

const MoveLessonsSchema = z.object({
  lessonIds: z.array(z.string().uuid()).min(1).max(200),
  folderId: z.string().uuid().nullable(),
});

export async function PATCH(req: Request) {
  const { supabase, userId } = await getAuthenticatedUserId();
  if (!userId) return NextResponse.json({ error: 'Nejdřív se přihlas.' }, { status: 401 });
  const deviceGate = await requireTrustedDeviceForPaidIndividual(userId);
  if (!deviceGate.allowed) {
    return NextResponse.json({ error: trustedDeviceErrorMessage(deviceGate.code), code: deviceGate.code }, { status: 403 });
  }

  try {
    const input = MoveLessonsSchema.parse(await req.json());
    const lessonIds = [...new Set(input.lessonIds)];
    const entitlement = await getLessonFolderEntitlement(supabase, userId);
    if (!entitlement.enabled) {
      return NextResponse.json({ error: 'Složky jsou dostupné v nejvyšším tarifu.' }, { status: 403 });
    }

    const { data: ownedLessons, error: lessonReadError } = await supabase
      .from('lessons')
      .select('id, organization_origin_id')
      .eq('owner_id', userId)
      .in('id', lessonIds);

    if (lessonReadError) throw lessonReadError;
    if ((ownedLessons ?? []).length !== lessonIds.length) {
      return NextResponse.json({ error: 'Některá z vybraných lekcí nebyla nalezena.' }, { status: 404 });
    }

    const originIds = (ownedLessons ?? [])
      .map((lesson) => typeof lesson.organization_origin_id === 'string' ? lesson.organization_origin_id : null)
      .filter((value): value is string => Boolean(value));
    const originAccess = await getOrganizationOriginAccessMap(userId, originIds);
    if ((ownedLessons ?? []).some((lesson) => (
      typeof lesson.organization_origin_id === 'string'
      && originAccess.get(lesson.organization_origin_id)?.locked
    ))) {
      return NextResponse.json({
        error: 'Školní lekci bez aktivního přístupu nelze přesouvat ani jinak měnit.',
        code: 'organization_origin_access_required',
      }, { status: 403 });
    }

    if (input.folderId) {
      const { data: folder, error: folderError } = await supabase
        .from('lesson_folders')
        .select('id')
        .eq('id', input.folderId)
        .eq('owner_id', userId)
        .maybeSingle();

      if (folderError) throw folderError;
      if (!folder) return NextResponse.json({ error: 'Cílová složka nebyla nalezena.' }, { status: 404 });
    }

    const { data: moved, error: moveError } = await supabase
      .from('lessons')
      .update({ folder_id: input.folderId })
      .eq('owner_id', userId)
      .in('id', lessonIds)
      .select('id');

    if (moveError) throw moveError;
    if ((moved ?? []).length !== lessonIds.length) {
      return NextResponse.json({ error: 'Přesun se nepodařilo dokončit pro všechny lekce.' }, { status: 409 });
    }

    return NextResponse.json({ moved: moved.length, folderId: input.folderId });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: 'Zkontroluj vybrané lekce a cílovou složku.' }, { status: 400 });
    }
    console.error('move lessons failed', error);
    return NextResponse.json({ error: 'Lekce se nepodařilo přesunout.' }, { status: 500 });
  }
}
