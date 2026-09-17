import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getAuthenticatedUserId } from '@/lib/auth';
import { getLessonFolderEntitlement } from '@/lib/lesson-folders';

const CreateFolderSchema = z.object({
  name: z.string().trim().min(1).max(100),
  parentId: z.string().uuid().nullable().optional().default(null),
});

export async function POST(req: Request) {
  const { supabase, userId } = await getAuthenticatedUserId();
  if (!userId) return NextResponse.json({ error: 'Nejdřív se přihlas.' }, { status: 401 });

  try {
    const input = CreateFolderSchema.parse(await req.json());
    const entitlement = await getLessonFolderEntitlement(supabase, userId);
    if (!entitlement.enabled) {
      return NextResponse.json({ error: 'Složky jsou dostupné v nejvyšším tarifu.' }, { status: 403 });
    }

    if (input.parentId) {
      const { data: parent, error: parentError } = await supabase
        .from('lesson_folders')
        .select('id, parent_id')
        .eq('id', input.parentId)
        .eq('owner_id', userId)
        .maybeSingle();

      if (parentError) throw parentError;
      if (!parent) return NextResponse.json({ error: 'Nadřazená složka nebyla nalezena.' }, { status: 404 });
      if (parent.parent_id) {
        return NextResponse.json({ error: 'Syllonaut podporuje nejvýše dvě úrovně složek.' }, { status: 400 });
      }
    }

    const { data: folder, error: insertError } = await supabase
      .from('lesson_folders')
      .insert({
        owner_id: userId,
        parent_id: input.parentId,
        name: input.name,
      })
      .select('id, name, parent_id')
      .single();

    if (insertError) {
      if (insertError.code === '23505') {
        return NextResponse.json({ error: 'Složka se stejným názvem už na této úrovni existuje.' }, { status: 409 });
      }
      throw insertError;
    }

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
    console.error('create lesson folder failed', error);
    return NextResponse.json({ error: 'Složku se nepodařilo vytvořit.' }, { status: 500 });
  }
}
