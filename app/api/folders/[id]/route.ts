import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getAuthenticatedUserId } from '@/lib/auth';
import { getLessonFolderEntitlement } from '@/lib/lesson-folders';
import { deleteLessonFolder, LessonFolderWriteError, renameLessonFolder } from '@/lib/lesson-folder-writer';
import { requireTrustedDeviceForPaidAccess, trustedDeviceErrorMessage } from '@/lib/trusted-device-access';

const RenameFolderSchema = z.object({
  name: z.string().trim().min(1).max(100),
});

type RouteContext = {
  params: Promise<{ id: string }>;
};

async function getEntitledAuth() {
  const auth = await getAuthenticatedUserId();
  if (!auth.userId) {
    return { response: NextResponse.json({ error: 'Nejdřív se přihlas.' }, { status: 401 }) } as const;
  }
  const deviceGate = await requireTrustedDeviceForPaidAccess(auth.userId);
  if (!deviceGate.allowed) {
    return {
      response: NextResponse.json(
        { error: trustedDeviceErrorMessage(deviceGate), code: deviceGate.code },
        { status: 403 },
      ),
    } as const;
  }
  const entitlement = await getLessonFolderEntitlement(auth.supabase, auth.userId);
  if (!entitlement.enabled) {
    return { response: NextResponse.json({ error: 'Složky jsou dostupné v nejvyšším tarifu.' }, { status: 403 }) } as const;
  }
  return { supabase: auth.supabase, userId: auth.userId } as const;
}

export async function PATCH(req: Request, { params }: RouteContext) {
  const auth = await getEntitledAuth();
  if ('response' in auth) return auth.response;

  try {
    const { id } = await params;
    const { name } = RenameFolderSchema.parse(await req.json());
    const folder = await renameLessonFolder(auth.supabase, auth.userId, id, name);

    return NextResponse.json({
      folder: { id: folder.id, name: folder.name, parentId: folder.parent_id },
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: 'Zkontroluj název složky a zkus to znovu.' }, { status: 400 });
    }
    if (error instanceof LessonFolderWriteError) {
      if (error.code === 'DUPLICATE_FOLDER') {
        return NextResponse.json({ error: 'Složka se stejným názvem už na této úrovni existuje.' }, { status: 409 });
      }
      if (error.code === 'FOLDER_NOT_FOUND') {
        return NextResponse.json({ error: 'Složka nebyla nalezena.' }, { status: 404 });
      }
    }
    console.error('rename lesson folder failed', error);
    return NextResponse.json({ error: 'Složku se nepodařilo přejmenovat.' }, { status: 500 });
  }
}

export async function DELETE(_req: Request, { params }: RouteContext) {
  const auth = await getEntitledAuth();
  if ('response' in auth) return auth.response;

  try {
    const { id } = await params;
    await deleteLessonFolder(auth.supabase, auth.userId, id);

    return NextResponse.json({ deleted: true });
  } catch (error) {
    if (error instanceof LessonFolderWriteError) {
      if (error.code === 'FOLDER_HAS_CHILDREN') {
        return NextResponse.json({ error: 'Nejdřív smaž podsložky.' }, { status: 409 });
      }
      if (error.code === 'FOLDER_NOT_FOUND') {
        return NextResponse.json({ error: 'Složka nebyla nalezena.' }, { status: 404 });
      }
    }
    console.error('delete lesson folder failed', error);
    return NextResponse.json({ error: 'Složku se nepodařilo smazat.' }, { status: 500 });
  }
}
