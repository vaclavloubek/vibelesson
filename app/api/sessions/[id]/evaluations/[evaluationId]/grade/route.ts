import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getAuthenticatedUserId } from '@/lib/auth';
import { requireTrustedDeviceForPaidAccess, trustedDeviceErrorMessage } from '@/lib/trusted-device-access';
import { gradeResponseWithAI } from '@/lib/grading';
import { GradingCriterionSchema, LessonSchema } from '@/lib/schema';
import { LOCALE_REQUEST_HEADER, normalizeUiLocale } from '@/lib/i18n';
import { AI_BILLING_PAYMENT_REQUIRED_CODE, aiBillingPausedMessage, getEffectiveAiBillingPauseState } from '@/lib/individual-ai-billing';

export const maxDuration = 60;

type RouteContext = { params: Promise<{ id: string; evaluationId: string }> };

const ClaimedEvaluationSchema = z.object({
  id: z.string().uuid(),
  session_id: z.string().uuid(),
  block_id: z.string().min(1),
  answer_snapshot: z.unknown(),
  rubric: z.unknown(),
  max_points: z.number().int().min(1).max(20),
  source_updated_at: z.string(),
  grader_version: z.string(),
});

const TextAnswerSchema = z.object({
  text: z.string().trim().min(1).max(4000),
});

function safeErrorMessage(error: unknown) {
  if (error instanceof Error && error.message) return error.message.slice(0, 900);
  return 'AI grading failed';
}

export async function POST(req: Request, { params }: RouteContext) {
  const { supabase, userId } = await getAuthenticatedUserId();
  if (!userId) return NextResponse.json({ error: 'Nejdřív se přihlas.' }, { status: 401 });

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

  const { id: sessionId, evaluationId } = await params;

  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('role, ai_grading_enabled')
    .eq('id', userId)
    .maybeSingle();

  if (profileError) {
    console.error('AI grading entitlement lookup failed', profileError);
    return NextResponse.json({ error: 'Oprávnění pro AI hodnocení se nepodařilo ověřit.' }, { status: 500 });
  }

  const aiGradingEnabled = Boolean(profile && (profile.role === 'admin' || profile.ai_grading_enabled));
  if (!aiGradingEnabled) {
    return NextResponse.json({ error: 'AI hodnocení není pro tento tarif dostupné.' }, { status: 403 });
  }

  const { data: existing, error: existingError } = await supabase
    .from('response_evaluations')
    .select('id, session_id, status')
    .eq('id', evaluationId)
    .eq('session_id', sessionId)
    .maybeSingle();

  if (existingError) {
    console.error('evaluation lookup failed', existingError);
    return NextResponse.json({ error: 'Hodnocení se nepodařilo načíst.' }, { status: 500 });
  }
  if (!existing) return NextResponse.json({ error: 'Hodnocení nebylo nalezeno.' }, { status: 404 });
  if (existing.status === 'graded' || existing.status === 'needs_review') {
    return NextResponse.json({ error: 'Tato odpověď už byla vyhodnocena.' }, { status: 409 });
  }

  const { data: claimedRaw, error: claimError } = await supabase.rpc('claim_response_evaluation', {
    p_evaluation_id: evaluationId,
  });

  if (claimError) {
    console.error('evaluation claim failed', claimError);
    return NextResponse.json({ error: 'Hodnocení se nepodařilo převzít ke zpracování.' }, { status: 500 });
  }
  if (!claimedRaw) {
    try {
      const latestBillingState = await getEffectiveAiBillingPauseState(userId);
      if (latestBillingState.reason) {
        return NextResponse.json({
          error: aiBillingPausedMessage(
            requestLocale,
            latestBillingState.reason,
            latestBillingState.scope,
            latestBillingState.manager,
          ),
          code: AI_BILLING_PAYMENT_REQUIRED_CODE,
        }, { status: 402 });
      }
    } catch {
      // The claim already failed closed; keep the generic state response below.
    }
    return NextResponse.json({ error: 'Hodnocení právě zpracovává jiný proces nebo AI hodnocení není povolené.' }, { status: 409 });
  }

  const claimed = ClaimedEvaluationSchema.safeParse(claimedRaw);
  if (!claimed.success || claimed.data.session_id !== sessionId) {
    await supabase.rpc('fail_response_evaluation', {
      p_evaluation_id: evaluationId,
      p_error: 'Invalid evaluation claim payload',
    });
    return NextResponse.json({ error: 'Hodnocení má neplatný interní stav.' }, { status: 500 });
  }

  try {
    const { data: session, error: sessionError } = await supabase
      .from('sessions')
      .select('lesson_snapshot')
      .eq('id', sessionId)
      .eq('teacher_id', userId)
      .single();

    if (sessionError || !session) throw new Error('Session snapshot is unavailable.');

    const lesson = LessonSchema.parse(session.lesson_snapshot);
    const block = lesson.blocks.find((item) => item.id === claimed.data.block_id);
    if (!block) throw new Error('Evaluation block is missing from the lesson snapshot.');
    if (!['open_text', 'exit_ticket', 'team_task'].includes(block.type)) {
      throw new Error('This block type is not eligible for AI grading.');
    }

    const answer = TextAnswerSchema.parse(claimed.data.answer_snapshot);
    const rubric = z.array(GradingCriterionSchema).min(1).max(6).parse(claimed.data.rubric);
    const rubricPoints = rubric.reduce((sum, criterion) => sum + criterion.maxPoints, 0);

    if (!block.points || block.points !== claimed.data.max_points || rubricPoints !== claimed.data.max_points) {
      throw new Error('Evaluation rubric does not match the lesson snapshot.');
    }

    const result = await gradeResponseWithAI({
      blockTitle: block.title,
      instructions: block.instructions,
      audience: lesson.audience,
      answerText: answer.text,
      rubric,
      maxPoints: claimed.data.max_points,
      strictness: lesson.gradingStrictness ?? 'neutral',
    });

    const { data: challengeRecorded, error: challengeError } = await supabase.rpc('record_response_evaluation_integrity_challenge', {
      p_evaluation_id: evaluationId,
      p_question: result.integrityChallengeQuestion,
    });
    if (challengeError) throw challengeError;
    if (!challengeRecorded) throw new Error('Integrity challenge could not be attached to the evaluation.');

    const { data: finished, error: finishError } = await supabase.rpc('finish_response_evaluation_v2', {
      p_evaluation_id: evaluationId,
      p_ai_score: result.score,
      p_rationale: result.rationale,
      p_confidence: result.confidence,
      p_criterion_scores: result.criterionScores,
      p_ai_use_suspicion: result.aiUseSuspicion,
      p_ai_use_signals: result.aiUseSignals,
      p_model: result.model,
      p_cost_usd: result.costUsd,
    });

    if (finishError) throw finishError;
    if (!finished) return NextResponse.json({ error: 'Hodnocení mezitím změnilo stav.' }, { status: 409 });

    return NextResponse.json({
      evaluationId,
      activityType: block.type,
      status: result.needsReview ? 'needs_review' : 'graded',
      score: result.score,
      maxPoints: result.maxPoints,
      confidence: result.confidence,
      rationale: result.rationale,
      criterionScores: result.criterionScores,
      aiUseSuspicion: result.aiUseSuspicion,
      aiUseSignals: result.aiUseSignals,
      integrityChallengeCreated: result.integrityChallengeQuestion !== null,
      costUsd: result.costUsd,
    });
  } catch (error) {
    console.error('AI response grading failed', error);
    await supabase.rpc('fail_response_evaluation', {
      p_evaluation_id: evaluationId,
      p_error: safeErrorMessage(error),
    });
    return NextResponse.json({ error: 'AI hodnocení odpovědi se nepodařilo dokončit.' }, { status: 502 });
  }
}
