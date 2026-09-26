import { NextResponse } from 'next/server';
import { z } from 'zod';
import { LessonSchema, resolveLessonCollaborationMode } from '@/lib/schema';
import { reviseBlock } from '@/lib/ai';
import { getAuthenticatedUserId } from '@/lib/auth';
import { requireTrustedDeviceForPaidAccess, trustedDeviceErrorMessage } from '@/lib/trusted-device-access';
import { getLessonOrganizationOriginAccess, organizationOriginLockedMessage } from '@/lib/organization-origin-access';
import { createPrivilegedRpcClient } from '@/lib/neon/privileged-rpc';
import { currentFreeDeviceBudgetHash, freeDeviceBudgetMessage } from '@/lib/free-device-budget';
import { LOCALE_REQUEST_HEADER, normalizeUiLocale } from '@/lib/i18n';
import { AI_BILLING_PAYMENT_REQUIRED_CODE, aiBillingPausedMessage, getEffectiveAiBillingPauseState } from '@/lib/individual-ai-billing';

// Keep the same ceiling across AI endpoints; complex block edits can still be slow.
export const maxDuration = 300;

const InputSchema = z.object({
  instruction: z.string().min(2).max(2000),
  lesson: LessonSchema,
  lessonId: z.string().uuid().nullable().optional(),
  blockId: z.string().min(1),
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
  let aiBillingState: Awaited<ReturnType<typeof getEffectiveAiBillingPauseState>>;
  try {
    aiBillingState = await getEffectiveAiBillingPauseState(userId);
  } catch {
    return NextResponse.json({
      error: requestLocale === 'en'
        ? 'The payment status could not be verified. Try again in a moment.'
        : 'Stav platby se nepodařilo ověřit. Zkus to za chvíli znovu.',
    }, { status: 503 });
  }
  if (aiBillingState.reason) {
    return NextResponse.json({
      error: aiBillingPausedMessage(
          requestLocale,
          aiBillingState.reason,
          aiBillingState.scope,
          aiBillingState.manager,
        ),
      code: AI_BILLING_PAYMENT_REQUIRED_CODE,
    }, { status: 402 });
  }

  let requestId: string | null = null;
  let costUsd: number | null = null;
  const admin = createPrivilegedRpcClient();

  try {
    const { instruction, lesson, lessonId = null, blockId } = InputSchema.parse(await req.json());

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

    const block = sourceLesson.blocks.find((item) => item.id === blockId);
    if (!block) {
      return NextResponse.json({ error: 'Vybraná aktivita už v lekci není.' }, { status: 400 });
    }

    const deviceHash = await currentFreeDeviceBudgetHash();
    const { data: quotaData, error: quotaError } = await admin.rpc('reserve_revision_operation_server', {
      p_user_id: userId,
      p_action: 'revise_block',
      p_device_token_hash: deviceHash,
    });
    if (quotaError?.message?.includes(AI_BILLING_PAYMENT_REQUIRED_CODE)) {
      return NextResponse.json({
        error: aiBillingPausedMessage(
          requestLocale,
          aiBillingState.reason,
          aiBillingState.scope,
          aiBillingState.manager,
        ),
        code: AI_BILLING_PAYMENT_REQUIRED_CODE,
      }, { status: 402 });
    }
    if (quotaError) {
      console.error('reserve block revision quota failed', quotaError);
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

    const collaborationMode = resolveLessonCollaborationMode(sourceLesson);
    const revisedResult = await reviseBlock(block, instruction, {
      title: sourceLesson.title,
      audience: sourceLesson.audience,
      groupSize: sourceLesson.groupSize,
      collaborationMode,
      language: sourceLesson.language,
      learningObjectives: sourceLesson.learningObjectives,
      blockOutline: sourceLesson.blocks.map(({ id, type, title }) => ({ id, type, title })),
    }, { allowLanguageChange });
    const revisedBlock = revisedResult.block;
    costUsd = revisedResult.costUsd;

    const blocks = sourceLesson.blocks.map((item) => item.id === revisedBlock.id ? revisedBlock : item);
    const hasTeamTask = blocks.some((item) => item.type === 'team_task');
    if ((collaborationMode === 'individual' && hasTeamTask) || (collaborationMode === 'teams' && !hasTeamTask)) {
      throw new Error('Block revision violates the explicit collaboration mode.');
    }
    const revisedLesson = LessonSchema.parse({
      ...sourceLesson,
      collaborationMode,
      blocks,
      totalMinutes: blocks.reduce((sum, item) => sum + item.durationMinutes, 0),
    });

    if (lessonId) {
      const { data: savedLesson, error: saveError } = await supabase
        .from('lessons')
        .update({
          title: revisedLesson.title,
          lesson: revisedLesson,
          updated_at: new Date().toISOString(),
        })
        .eq('id', lessonId)
        .eq('owner_id', userId)
        .select('id')
        .single();

      if (saveError || !savedLesson?.id) {
        throw saveError ?? new Error('Revised lesson block was not persisted.');
      }
    }

    if (requestId) {
      const { error: finishError } = await admin.rpc('finish_generation_request_server', {
        p_user_id: userId,
        p_request_id: requestId,
        p_status: 'succeeded',
        p_cost_usd: costUsd,
        p_lesson_id: lessonId,
      });
      if (finishError) console.error('finish block revision request failed', finishError);
    }

    return NextResponse.json({ lesson: revisedLesson, lessonId });
  } catch (error) {
    if (requestId) {
      const { error: finishError } = await admin.rpc('finish_generation_request_server', {
        p_user_id: userId,
        p_request_id: requestId,
        p_status: 'failed',
        p_cost_usd: costUsd,
        p_lesson_id: null,
      });
      if (finishError) console.error('fail block revision request cleanup failed', finishError);
    }

    console.error('revise block failed', error);
    return NextResponse.json({ error: 'Úprava aktivity se nepodařila bezpečně dokončit.' }, { status: 500 });
  }
}
