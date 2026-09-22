import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getAuthenticatedUserId } from '@/lib/auth';
import { getLessonFolderEntitlement } from '@/lib/lesson-folders';
import { createLessonFolder, LessonFolderWriteError } from '@/lib/lesson-folder-writer';
import { requireTrustedDeviceForPaidAccess, trustedDeviceErrorMessage } from '@/lib/trusted-device-access';

const CreateFolderSchema = z.object({
  name: z.string().trim().min(1).max(100),
  parentId: z.string().uuid().nullable().optional().default(null),
});

export async function POST(req: Request) {
  const { supabase, userId } = await getAuthenticatedUserId();
  if (!userId) return NextResponse.json({ error: 'Nejdřív se přihlas.' }, { status: 401 });
  const deviceGate = await requireTrustedDeviceForPaidAccess(userId);
  if (!deviceGate.allowed) {
    return NextResponse.json({ error: trustedDeviceErrorMessage(deviceGate), code: deviceGate.code }, { status: 403 });
  }

  try {
    const input = CreateFolderSchema.parse(await req.json());
    const entitlement = await getLessonFolderEntitlement(supabase, userId);
    if (!entitlement.enabled) {
      return NextResponse.json({ error: 'Složky jsou dostupné v nejvyšším tarifu.' }, { status: 403 });
    }

    const folder = await createLessonFolder(supabase, userId, input);

    return NextResponse.json({
      folder: {
        id: folder.id,
        name: folder.name,
        parentId: folder.parent_id,
      },
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: 'Zkontroluj název složky a zkus to znovu.' }, { status: 400 });
    }
    if (error instanceof LessonFolderWriteError) {
      if (error.code === 'PARENT_NOT_FOUND') {
        return NextResponse.json({ error: 'Nadřazená složka nebyla nalezena.' }, { status: 404 });
      }
      if (error.code === 'FOLDER_DEPTH_LIMIT') {
        return NextResponse.json({ error: 'Syllonaut podporuje nejvýše dvě úrovně složek.' }, { status: 400 });
      }
      if (error.code === 'DUPLICATE_FOLDER') {
        return NextResponse.json({ error: 'Složka se stejným názvem už na této úrovni existuje.' }, { status: 409 });
      }
    }
    console.error('create lesson folder failed', error);
    return NextResponse.json({ error: 'Složku se nepodařilo vytvořit.' }, { status: 500 });
  }
}
