import { NextResponse } from 'next/server';
import { z } from 'zod';
import { LessonSchema } from '@/lib/schema';
import { getAuthenticatedUserId } from '@/lib/auth';
import { getLessonReuseEntitlement } from '@/lib/lesson-reuse';
import { createAdminClient } from '@/lib/supabase/admin';
import { getLessonOrganizationOriginAccess, organizationOriginLockedMessage } from '@/lib/organization-origin-access';
import { requireTrustedDeviceForPaidAccess, trustedDeviceErrorMessage } from '@/lib/trusted-device-access';
import { currentFreeDeviceBudgetHash, freeDeviceBudgetMessage } from '@/lib/free-device-budget';
import {
  LessonContentWriteError,
  readLessonContentForWrite,
  writeLessonContent,
} from '@/lib/lesson-content-writer';

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

  let requestId: string | null = null;

  try {
    const { id } = await params;
    const locked = await schoolLicenseLockResponse(userId, id);
    if (locked) return locked;
    const { data: current, error: readError } = await supabase
      .from('lessons')
      .select('title, source_prompt, lesson, folder_id')
      .eq('id', id)
      .eq('owner_id', userId)
      .single();

    if (readError || !current) return NextResponse.json({ error: 'Lekce nebyla nalezena.' }, { status: 404 });

    const admin = createAdminClient();
    const reusableLessons = await getLessonReuseEntitlement(supabase);
    if (!reusableLessons) {
      const deviceHash = await currentFreeDeviceBudgetHash();
      const { data: quotaData, error: quotaError } = await admin.rpc('reserve_lesson_import_server', {
        p_user_id: userId,
        p_device_token_hash: deviceHash,
      });
      if (quotaError) throw quotaError;

      const quota = (Array.isArray(quotaData) ? quotaData[0] : quotaData) as {
        request_id?: string | null;
        allowed?: boolean;
        used?: number;
        monthly_limit?: number | null;
        denial_code?: string | null;
        device_used?: number | null;
        device_limit?: number | null;
      } | null;

      if (!quota?.allowed) {
        const deviceMessage = freeDeviceBudgetMessage(
          quota?.denial_code,
          'import',
          quota?.device_limit,
        );
        if (deviceMessage) {
          return NextResponse.json({
            error: deviceMessage,
            code: quota?.denial_code,
          }, { status: quota?.denial_code === 'free_device_cookie_required' ? 409 : 429 });
        }

        return NextResponse.json({
          error: `Měsíční limit ${quota?.monthly_limit ?? 2} importů nebo kopií je vyčerpaný. Další import nebo kopii můžeš vytvořit příští měsíc.`,
          quota: {
            used: quota?.used ?? quota?.monthly_limit ?? 2,
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
