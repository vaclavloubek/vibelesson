import { headers } from 'next/headers';
import { notFound, redirect } from 'next/navigation';
import EvaluationBackgroundPump from '@/components/EvaluationBackgroundPump';
import SessionReport from '@/components/SessionReport';
import TeacherLiveTools from '@/components/TeacherLiveTools';
import TeacherScoreboardQuickAction from '@/components/TeacherScoreboardQuickAction';
import TeacherSession from '@/components/TeacherSession';
import AiPaymentPauseBanner from '@/components/AiPaymentPauseBanner';
import AiGradingQuotaBanner from '@/components/AiGradingQuotaBanner';
import { isAiGradingTopupsEnabled } from '@/lib/ai-grading-topups';
import { readLiveResume } from '@/lib/live-resume';
import { LOCALE_REQUEST_HEADER, normalizeUiLocale } from '@/lib/i18n';
import { createClient } from '@/lib/supabase/server';
import { readOwnedSessionAccess } from '@/lib/session-access-reader';
import { getEffectiveAiBillingPauseState, type EffectiveAiBillingPauseState } from '@/lib/individual-ai-billing';
import { requireCurrentTermsForPage } from '@/lib/terms-page-gate';

export const dynamic = 'force-dynamic';

type Props = { params: Promise<{ id: string }> };
type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

const RETRY_DELAYS_MS = [200, 600] as const;

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function getTeacherUserId(supabase: SupabaseServerClient) {
  let lastError: unknown = null;

  for (let attempt = 0; attempt <= RETRY_DELAYS_MS.length; attempt += 1) {
    const { data, error } = await supabase.auth.getClaims();
    if (!error) {
      return typeof data?.claims?.sub === 'string' ? data.claims.sub : null;
    }

    lastError = error;
    if (attempt < RETRY_DELAYS_MS.length) await sleep(RETRY_DELAYS_MS[attempt]);
  }

  throw lastError ?? new Error('Teacher auth lookup failed.');
}

async function loadAiBillingPauseState(userId: string | null): Promise<EffectiveAiBillingPauseState> {
  if (!userId) return { reason: null, scope: null, organizationId: null, manager: false };
  try {
    return await getEffectiveAiBillingPauseState(userId);
  } catch (error) {
    console.error('load live AI billing pause state failed', {
      userId,
      error: error instanceof Error ? error.message : 'unknown',
    });
    return { reason: null, scope: null, organizationId: null, manager: false };
  }
}

function teacherSurface(
  id: string,
  userId: string | null,
  aiBillingState: EffectiveAiBillingPauseState,
) {
  return (
    <>
      {aiBillingState.reason ? (
        <AiPaymentPauseBanner
          reason={aiBillingState.reason}
          scope={aiBillingState.scope}
          manager={aiBillingState.manager}
        />
      ) : null}
      <AiGradingQuotaBanner sessionId={id} topupsEnabled={isAiGradingTopupsEnabled()} />
      <EvaluationBackgroundPump sessionId={id} />
      <TeacherSession sessionId={id} />
      <TeacherScoreboardQuickAction sessionId={id} userId={userId} />
      <TeacherLiveTools sessionId={id} />
      <SessionReport sessionId={id} userId={userId} />
    </>
  );
}

export default async function TeacherSessionPage({ params }: Props) {
  const requestHeaders = await headers();
  const locale = normalizeUiLocale(requestHeaders.get(LOCALE_REQUEST_HEADER)) ?? 'cs';
  const { id } = await params;
  const supabase = await createClient();
  const resume = await readLiveResume(id);

  let userId: string | null = null;
  let authFailure: unknown = null;
  try {
    userId = await getTeacherUserId(supabase);
  } catch (error) {
    authFailure = error;
  }

  if (!userId) {
    if (!authFailure || !resume) redirect(`/${locale}`);
    console.warn('teacher live page restored from resume ticket after primary auth failure', {
      sessionId: id,
      authError: true,
    });
    const resumedUserId = resume?.userId ?? null;
    return teacherSurface(id, resumedUserId, await loadAiBillingPauseState(resumedUserId));
  }

  await requireCurrentTermsForPage(userId, `/sessions/${id}`);

  let session: { id: string } | null = null;
  try {
    session = await readOwnedSessionAccess(supabase, userId, id);
  } catch (error) {
    if (resume?.userId !== userId) throw error;
    console.warn('teacher live ownership lookup degraded; using resume ticket', { sessionId: id });
    return teacherSurface(id, userId, await loadAiBillingPauseState(userId));
  }

  if (!session) notFound();
  return teacherSurface(id, userId, await loadAiBillingPauseState(userId));
}
