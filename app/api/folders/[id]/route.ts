import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getAuthenticatedUserId } from '@/lib/auth';
import { getLessonFolderEntitlement } from '@/lib/lesson-folders';
import { requireTrustedDeviceForPaidIndividual, trustedDeviceErrorMessage } from '@/lib/trusted-device-access';

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
  const deviceGate = await requireTrustedDeviceForPaidIndividual(auth.userId);
  if (!deviceGate.allowed) {
    return {
      response: NextResponse.json(
        { error: trustedDeviceErrorMessage(deviceGate.code), code: deviceGate.code },
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
    const { data: folder, error } = await auth.supabase
      .from('lesson_folders')
      .update({ name, updated_at: new Date().toISOString() })
      .eq('id', id)
      .eq('owner_id', auth.userId)
      .select('id, name, parent_id')
      .maybeSingle();

    if (error) {
      if (error.code === '23505') {
        return NextResponse.json({ error: 'Složka se stejným názvem už na této úrovni existuje.' }, { status: 409 });
      }
      throw error;
    }
    if (!folder) return NextResponse.json({ error: 'Složka nebyla nalezena.' }, { status: 404 });

    return NextResponse.json({
      folder: { id: folder.id, name: folder.name, parentId: folder.parent_id },
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: 'Zkontroluj název složky a zkus to znovu.' }, { status: 400 });
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
    const { data: children, error: childrenError } = await auth.supabase
      .from('lesson_folders')
      .select('id')
      .eq('owner_id', auth.userId)
      .eq('parent_id', id)
      .limit(1);

    if (childrenError) throw childrenError;
    if (children?.length) {
      return NextResponse.json({ error: 'Nejdřív smaž podsložky.' }, { status: 409 });
    }

    const { data: deleted, error: deleteError } = await auth.supabase
      .from('lesson_folders')
      .delete()
      .eq('id', id)
      .eq('owner_id', auth.userId)
      .select('id')
      .maybeSingle();

    if (deleteError) throw deleteError;
    if (!deleted) return NextResponse.json({ error: 'Složka nebyla nalezena.' }, { status: 404 });

    return NextResponse.json({ deleted: true });
  } catch (error) {
    console.error('delete lesson folder failed', error);
    return NextResponse.json({ error: 'Složku se nepodařilo smazat.' }, { status: 500 });
  }
}
