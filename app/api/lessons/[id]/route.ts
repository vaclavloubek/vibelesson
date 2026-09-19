import { NextResponse } from 'next/server';
import { z } from 'zod';
import { LessonSchema } from '@/lib/schema';
import { getAuthenticatedUserId } from '@/lib/auth';
import { getLessonReuseEntitlement } from '@/lib/lesson-reuse';
import { createAdminClient } from '@/lib/supabase/admin';

const RenameSchema = z.object({
  title: z.string().trim().min(1).max(200),
});

const ReplaceLessonSchema = z.object({
  lesson: LessonSchema,
});

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function PATCH(req: Request, { params }: RouteContext) {
  const { supabase, userId } = await getAuthenticatedUserId();
  if (!userId) return NextResponse.json({ error: 'Nejdřív se přihlas.' }, { status: 401 });

  try {
    const { id } = await params;
    const { title } = RenameSchema.parse(await req.json());

    const { data: current, error: readError } = await supabase
      .from('lessons')
      .select('lesson')
      .eq('id', id)
      .eq('owner_id', userId)
      .single();

    if (readError || !current) return NextResponse.json({ error: 'Lekce nebyla nalezena.' }, { status: 404 });

    const lesson = LessonSchema.parse(current.lesson);
    const renamedLesson = LessonSchema.parse({ ...lesson, title });

    const { data: updated, error: updateError } = await supabase
      .from('lessons')
      .update({ title, lesson: renamedLesson, updated_at: new Date().toISOString() })
      .eq('id', id)
      .eq('owner_id', userId)
      .select('id')
      .single();

    if (updateError || !updated) throw updateError ?? new Error('Rename returned no row.');
    return NextResponse.json({ lessonId: id, lesson: renamedLesson });
  } catch (error) {
    console.error('rename lesson failed', error);
    return NextResponse.json({ error: 'Lekci se nepodařilo přejmenovat.' }, { status: 500 });
  }
}

export async function PUT(req: Request, { params }: RouteContext) {
  const { supabase, userId } = await getAuthenticatedUserId();
  if (!userId) return NextResponse.json({ error: 'Nejdřív se přihlas.' }, { status: 401 });

  try {
    const { id } = await params;
    const { lesson } = ReplaceLessonSchema.parse(await req.json());

    const { data: current, error: readError } = await supabase
      .from('lessons')
      .select('lesson')
      .eq('id', id)
      .eq('owner_id', userId)
      .maybeSingle();

    if (readError || !current) {
      return NextResponse.json({ error: 'Lekce nebyla nalezena.' }, { status: 404 });
    }

    const currentLesson = LessonSchema.parse(current.lesson);

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

    const { data: updated, error: updateError } = await supabase
      .from('lessons')
      .update({ title: lesson.title, lesson, updated_at: new Date().toISOString() })
      .eq('id', id)
      .eq('owner_id', userId)
      .select('id')
      .single();

    if (updateError || !updated) return NextResponse.json({ error: 'Lekce nebyla nalezena.' }, { status: 404 });
    return NextResponse.json({ lessonId: id, lesson });
  } catch (error) {
    console.error('replace lesson failed', error);
    return NextResponse.json({ error: 'Předchozí verzi se nepodařilo obnovit.' }, { status: 500 });
  }
}

export async function POST(_req: Request, { params }: RouteContext) {
  const { supabase, userId } = await getAuthenticatedUserId();
  if (!userId) return NextResponse.json({ error: 'Nejdřív se přihlas.' }, { status: 401 });

  let requestId: string | null = null;

  try {
    const { id } = await params;
    const { data: current, error: readError } = await supabase
      .from('lessons')
      .select('title, source_prompt, lesson, folder_id')
      .eq('id', id)
      .eq('owner_id', userId)
      .single();

    if (readError || !current) return NextResponse.json({ error: 'Lekce nebyla nalezena.' }, { status: 404 });

    const reusableLessons = await getLessonReuseEntitlement(supabase);
    if (!reusableLessons) {
      const { data: quotaData, error: quotaError } = await supabase.rpc('reserve_lesson_import');
      if (quotaError) throw quotaError;

      const quota = (Array.isArray(quotaData) ? quotaData[0] : quotaData) as {
        request_id?: string | null;
        allowed?: boolean;
        used?: number;
        monthly_limit?: number | null;
      } | null;

      if (!quota?.allowed) {
        return NextResponse.json({
          error: `Měsíční limit ${quota?.monthly_limit ?? 3} importů nebo kopií je vyčerpaný. Další import nebo kopii můžeš vytvořit příští měsíc.`,
          quota: {
            used: quota?.used ?? quota?.monthly_limit ?? 3,
            monthlyLimit: quota?.monthly_limit ?? 3,
            remaining: 0,
          },
        }, { status: 429 });
      }

      requestId = typeof quota.request_id === 'string' ? quota.request_id : null;
      if (!requestId) throw new Error('Duplicate quota reservation is missing request id.');
    }

    const lesson = LessonSchema.parse(current.lesson);
    const copyTitle = `${current.title} – kopie`.slice(0, 200);
    const copiedLesson = LessonSchema.parse({ ...lesson, title: copyTitle });

    const admin = createAdminClient();
    const { data: copy, error: insertError } = await admin
      .from('lessons')
      .insert({
        owner_id: userId,
        title: copyTitle,
        source_prompt: current.source_prompt,
        lesson: copiedLesson,
        folder_id: current.folder_id,
        source_lesson_id: id,
      })
      .select('id')
      .single();

    if (insertError || !copy?.id) throw insertError ?? new Error('Duplicate returned no row.');

    if (requestId) {
      const { error: finishError } = await supabase.rpc('finish_generation_request', {
        p_request_id: requestId,
        p_status: 'succeeded',
        p_cost_usd: 0,
        p_lesson_id: copy.id,
      });
      if (finishError) console.error('finish duplicate quota request failed', finishError);
    }

    return NextResponse.json({ lessonId: copy.id });
  } catch (error) {
    if (requestId) {
      const { error: finishError } = await supabase.rpc('finish_generation_request', {
        p_request_id: requestId,
        p_status: 'failed',
        p_cost_usd: 0,
        p_lesson_id: null,
      });
      if (finishError) console.error('fail duplicate quota request cleanup failed', finishError);
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
    const { data: deleted, error: deleteError } = await supabase
      .from('lessons')
      .delete()
      .eq('id', id)
      .eq('owner_id', userId)
      .select('id')
      .single();

    if (deleteError || !deleted) return NextResponse.json({ error: 'Lekce nebyla nalezena.' }, { status: 404 });
    return NextResponse.json({ deleted: true });
  } catch (error) {
    console.error('delete lesson failed', error);
    return NextResponse.json({ error: 'Lekci se nepodařilo smazat.' }, { status: 500 });
  }
}
