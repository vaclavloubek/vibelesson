import { NextResponse } from 'next/server';
import { z } from 'zod';
import { LessonSchema } from '@/lib/schema';
import { reviseLesson } from '@/lib/ai';
import { getAuthenticatedUserId } from '@/lib/auth';
import { requireTrustedDeviceForPaidAccess, trustedDeviceErrorMessage } from '@/lib/trusted-device-access';
import { getLessonOrganizationOriginAccess, organizationOriginLockedMessage } from '@/lib/organization-origin-access';
import { createAdminClient } from '@/lib/supabase/admin';
import { currentFreeDeviceBudgetHash, freeDeviceBudgetMessage } from '@/lib/free-device-budget';
import { LOCALE_REQUEST_HEADER, normalizeUiLocale } from '@/lib/i18n';
import { AI_BILLING_PAYMENT_REQUIRED_CODE, aiBillingPausedMessage, isIndividualAiBillingPaused } from '@/lib/individual-ai-billing';

// Full-lesson revisions can be almost as expensive as initial generation.
export const maxDuration = 300;

const InputSchema = z.object({
  instruction: z.string().min(2).max(3000),
  lesson: LessonSchema,
  lessonId: z.string().uuid().nullable().optional(),
});

export async function POST(req: Request) {
  const { supabase, userId } = await getAuthenticatedUserId();
  if (!userId) {
    return NextResponse.json({ error: 'Pro AI úpravy se nejdřív přihlas.' }, { status: 401 });
  }

  const deviceGate = await requireTrustedDeviceForPaidAccess(userId);
  if (!deviceGate.allowed) {
    return NextResponse.json({ error: trustedDeviceErrorMessage(deviceGate), code: deviceGate.code }, { status: 403 });
  }

  const requestLocale = normalizeUiLocale(req.headers.get(LOCALE_REQUEST_HEADER)) ?? 'cs';
  let aiBillingPaused: boolean;
  try {
    aiBillingPaused = await isIndividualAiBillingPaused(userId);
  } catch {
    return NextResponse.json({
      error: requestLocale === 'en'
        ? 'The payment status could not be verified. Try again in a moment.'
        : 'Stav platby se nepodařilo ověřit. Zkus to za chvíli znovu.',
    }, { status: 503 });
  }
  if (aiBillingPaused) {
    return NextResponse.json({
      error: aiBillingPausedMessage(requestLocale),
      code: AI_BILLING_PAYMENT_REQUIRED_CODE,
    }, { status: 402 });
  }

  let requestId: string | null = null;
  let costUsd: number | null = null;

  try {
    const { instruction, lesson, lessonId = null } = InputSchema.parse(await req.json());

    let sourceLesson = lesson;
    if (lessonId) {
      const { data: ownedLesson, error: ownedLessonError } = await supabase
        .from('lessons')
        .select('lesson')
        .eq('id', lessonId)
        .eq('owner_id', userId)
        .maybeSingle();

      if (ownedLessonError || !ownedLesson) {
        return NextResponse.json({ error: 'Lekce nebyla nalezena.' }, { status: 404 });
      }
      const originAccess = await getLessonOrganizationOriginAccess(userId, lessonId);
      if (originAccess?.locked) {
        return NextResponse.json({
          error: organizationOriginLockedMessage(originAccess.organizationName),
          code: 'organization_origin_access_required',
        }, { status: 403 });
      }
      sourceLesson = LessonSchema.parse(ownedLesson.lesson);
    }

    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('role, multilingual_lessons_enabled')
      .eq('id', userId)
      .maybeSingle();

    if (profileError) throw profileError;
    const allowLanguageChange = Boolean(
      profile && (profile.role === 'admin' || profile.multilingual_lessons_enabled),
    );

    const admin = createAdminClient();
    const deviceHash = await currentFreeDeviceBudgetHash();
    const { data: quotaData, error: quotaError } = await admin.rpc('reserve_revision_operation_server', {
      p_user_id: userId,
      p_action: 'revise_lesson',
      p_device_token_hash: deviceHash,
    });
    if (quotaError?.message?.includes(AI_BILLING_PAYMENT_REQUIRED_CODE)) {
      return NextResponse.json({
        error: aiBillingPausedMessage(requestLocale),
        code: AI_BILLING_PAYMENT_REQUIRED_CODE,
      }, { status: 402 });
    }
    if (quotaError) {
      console.error('reserve revision quota failed', quotaError);
      return NextResponse.json({ error: 'Nepodařilo se ověřit limit AI úprav.' }, { status: 500 });
    }

    const quota = Array.isArray(quotaData) ? quotaData[0] : quotaData;
    if (!quota?.allowed) {
      const deviceMessage = freeDeviceBudgetMessage(
        quota?.denial_code,
        'revision',
        quota?.device_limit,
      );
      if (deviceMessage) {
        return NextResponse.json({
          error: deviceMessage,
          code: quota?.denial_code,
        }, { status: quota?.denial_code === 'free_device_cookie_required' ? 409 : 429 });
      }
      return NextResponse.json({
        error: `Vyčerpal jsi měsíční limit ${quota?.monthly_limit ?? 10} AI úprav. Limit se obnoví na začátku příštího měsíce.`,
      }, { status: 429 });
    }

    requestId = typeof quota.request_id === 'string' ? quota.request_id : null;
    const revisedResult = await reviseLesson(sourceLesson, instruction, { allowLanguageChange });
    const revised = revisedResult.lesson;
    costUsd = revisedResult.costUsd;

    if (lessonId) {
      const { data: savedLesson, error: saveError } = await supabase
        .from('lessons')
        .update({
          title: revised.title,
          lesson: revised,
          updated_at: new Date().toISOString(),
        })
        .eq('id', lessonId)
        .eq('owner_id', userId)
        .select('id')
        .single();

      if (saveError || !savedLesson?.id) {
        throw saveError ?? new Error('Revised lesson was not persisted.');
      }
    }

    if (requestId) {
      const { error: finishError } = await supabase.rpc('finish_generation_request', {
        p_request_id: requestId,
        p_status: 'succeeded',
        p_cost_usd: costUsd,
        p_lesson_id: lessonId,
      });
      if (finishError) console.error('finish revision request failed', finishError);
    }

    return NextResponse.json({ lesson: revised, lessonId });
  } catch (error) {
    if (requestId) {
      const { error: finishError } = await supabase.rpc('finish_generation_request', {
        p_request_id: requestId,
        p_status: 'failed',
        p_cost_usd: costUsd,
        p_lesson_id: null,
      });
      if (finishError) console.error('fail revision request cleanup failed', finishError);
    }

    console.error('revise lesson failed', error);
    return NextResponse.json({ error: 'Úprava lekce se nepodařila bezpečně dokončit. Zkus formulovat změnu jinak.' }, { status: 500 });
  }
}
