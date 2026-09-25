// Teacher-facing communication when AI grading suggestions fall back to manual
// grading. Pure functions without imports, so scripts/verify-ai-grading-quota-communication.mjs
// can load this file directly.

export type ManualGradingReason = 'quota' | 'payment' | 'plan';

export type QuotaScope = 'individual' | 'organization';

// EvaluationReviewQueue announces its manual reasons so the live control
// centre banner refreshes the quota only when the queue actually changes.
export const GRADING_QUEUE_EVENT = 'syllonaut:grading-queue';

export type GradingQueueEventDetail = {
  sessionId: string;
  signature: string;
  manualReasons: Array<ManualGradingReason | null>;
  // Unconfirmed responses waiting for manual grading because the allowance ran
  // out; AI can be asked for them again once purchased suggestions are left.
  pendingQuotaCount?: number;
};

// claim_grading_job / requeue write these grader versions when a response
// cannot get an AI suggestion (see neon/migrations and 20260919201000).
export function manualReasonFromGraderVersion(graderVersion: string | null | undefined): ManualGradingReason | null {
  if (graderVersion === 'manual-budget-v1') return 'quota';
  if (graderVersion === 'manual-payment-v1') return 'payment';
  if (graderVersion === 'manual-v1') return 'plan';
  return null;
}

export function manualGradingStatusText(reason: ManualGradingReason | null, english: boolean) {
  if (reason === 'quota') {
    return english
      ? 'Waiting for manual grading – the AI grading suggestion allowance is used up.'
      : 'Čeká na ruční hodnocení – limit návrhů od AI je vyčerpaný.';
  }
  if (reason === 'payment') {
    return english
      ? 'Waiting for manual grading – AI is paused because of a payment issue.'
      : 'Čeká na ruční hodnocení – AI je pozastavená kvůli platbě.';
  }
  return english ? 'Waiting for manual grading.' : 'Čeká na ruční hodnocení.';
}

export function formatQuotaResetDate(windowEnd: string | null | undefined, english: boolean) {
  if (!windowEnd) return null;
  const date = new Date(windowEnd);
  if (Number.isNaN(date.getTime())) return null;
  return new Intl.DateTimeFormat(english ? 'en-GB' : 'cs-CZ', {
    dateStyle: 'medium',
    timeZone: 'Europe/Prague',
  }).format(date);
}

export type GradingQuotaState = {
  gradingEnabled: boolean;
  gradingUnlimited: boolean;
  gradingUsed: number;
  gradingLimit: number | null;
  gradingRemaining: number | null;
  windowEnd: string | null;
  scope: QuotaScope;
  // Purchased suggestions (phase 2); used only after the plan allowance.
  creditRemaining?: number;
};

export function totalGradingRemaining(state: GradingQuotaState | null | undefined) {
  if (!state || state.gradingRemaining === null) return null;
  return state.gradingRemaining + Math.max(0, state.creditRemaining ?? 0);
}

export function isGradingQuotaExhausted(state: GradingQuotaState | null | undefined) {
  return Boolean(
    state
    && state.gradingEnabled
    && !state.gradingUnlimited
    && state.gradingLimit !== null
    && totalGradingRemaining(state) === 0,
  );
}

// Suggestions are available again (purchased pack or a reset allowance) while
// responses in the lesson still wait for manual grading because of the quota.
export function canRequestAiForPendingQuota(state: GradingQuotaState | null | undefined, pendingQuotaCount: number) {
  const remaining = totalGradingRemaining(state);
  return Boolean(state && !state.gradingUnlimited && pendingQuotaCount > 0 && remaining !== null && remaining > 0);
}

export function shouldShowGradingQuotaBanner(
  state: GradingQuotaState | null | undefined,
  manualReasons: ReadonlyArray<ManualGradingReason | null>,
) {
  if (state?.gradingUnlimited) return false;
  return isGradingQuotaExhausted(state) || manualReasons.includes('quota');
}

export function gradingQuotaBannerText(
  state: Pick<GradingQuotaState, 'gradingUsed' | 'gradingLimit' | 'windowEnd' | 'scope'>,
  english: boolean,
) {
  const counts = state.gradingLimit !== null ? ` (${state.gradingUsed} ${english ? 'of' : 'z'} ${state.gradingLimit})` : '';
  const resetDate = formatQuotaResetDate(state.windowEnd, english);
  const school = state.scope === 'organization';
  if (english) {
    return [
      school
        ? `AI grading suggestions for your school are used up for this period${counts}.`
        : `AI grading suggestions for this period are used up${counts}.`,
      'Nothing is broken.',
      'Please grade new responses manually using the criteria.',
      resetDate ? `The allowance resets on ${resetDate}.` : null,
    ].filter(Boolean).join(' ');
  }
  return [
    school
      ? `Návrhy hodnocení od AI jsou pro školu v tomto období vyčerpané${counts}.`
      : `Návrhy hodnocení od AI jsou pro toto období vyčerpané${counts}.`,
    'Nic se nerozbilo.',
    'Nové odpovědi ohodnoť prosím ručně podle kritérií.',
    resetDate ? `Limit se obnoví ${resetDate}.` : null,
  ].filter(Boolean).join(' ');
}

export const LOW_GRADING_NOTICE_MAX = 9;

export function shouldShowLowGradingNotice(state: GradingQuotaState | null | undefined) {
  return Boolean(
    state
    && state.gradingEnabled
    && !state.gradingUnlimited
    && totalGradingRemaining(state) !== null
    && (totalGradingRemaining(state) ?? 0) >= 1
    && (totalGradingRemaining(state) ?? 0) <= LOW_GRADING_NOTICE_MAX,
  );
}

function czechPendingResponses(count: number) {
  if (count === 1) return 'čekající odpověď';
  if (count >= 2 && count <= 4) return 'čekající odpovědi';
  return 'čekajících odpovědí';
}

export function requestAiForPendingButtonText(count: number, english: boolean) {
  return english
    ? `Ask AI for suggestions for ${count} waiting ${count === 1 ? 'response' : 'responses'}`
    : `Požádat AI o návrhy pro ${count} ${czechPendingResponses(count)}`;
}

export function creditAvailableBannerText(creditRemaining: number, pendingCount: number, english: boolean) {
  if (english) {
    return `You have ${creditRemaining} purchased AI grading ${creditRemaining === 1 ? 'suggestion' : 'suggestions'}. ${pendingCount} ${pendingCount === 1 ? 'response is' : 'responses are'} still waiting for manual grading because the allowance ran out.`;
  }
  const noun = creditRemaining === 1 ? 'dokoupený návrh' : creditRemaining >= 2 && creditRemaining <= 4 ? 'dokoupené návrhy' : 'dokoupených návrhů';
  const waiting = pendingCount === 1 ? 'odpověď čeká' : pendingCount >= 2 && pendingCount <= 4 ? 'odpovědi čekají' : 'odpovědí čeká';
  return `Máš k dispozici ${creditRemaining} ${noun} hodnocení od AI. ${pendingCount} ${waiting} na ruční hodnocení kvůli vyčerpanému limitu.`;
}

export function topupLinkText(english: boolean) {
  return english ? 'Buy more suggestions' : 'Dokoupit návrhy';
}

export const AI_GRADING_TOPUP_ANCHOR = 'dokoupit';
export const AI_GRADING_TOPUP_LINK_THRESHOLD = 10;

function czechSuggestionCount(count: number) {
  if (count === 1) return { verb: 'Zbývá', noun: 'návrh' };
  if (count >= 2 && count <= 4) return { verb: 'Zbývají', noun: 'návrhy' };
  return { verb: 'Zbývá', noun: 'návrhů' };
}

export function lowGradingNoticeText(remaining: number, english: boolean) {
  if (english) {
    return `${remaining} AI grading ${remaining === 1 ? 'suggestion' : 'suggestions'} left. After that, you will grade new responses manually.`;
  }
  const { verb, noun } = czechSuggestionCount(remaining);
  return `${verb} ${remaining} ${noun} hodnocení od AI. Další odpovědi pak ohodnotíš ručně.`;
}

// Rows of the "AI usage" panel on My lessons. Values always come from get_ai_quota().
export type AiUsageQuota = {
  lesson_used: number;
  lesson_limit: number | null;
  lesson_remaining: number | null;
  lesson_unlimited: boolean;
  revision_used: number;
  revision_limit: number | null;
  revision_remaining: number | null;
  revision_unlimited: boolean;
  grading_used: number;
  grading_limit: number | null;
  grading_remaining: number | null;
  grading_unlimited: boolean;
  grading_enabled: boolean;
  plan_code?: string | null;
  grading_credit_remaining?: number | null;
  grading_credit_next_expiry?: string | null;
};

export type AiUsageRowKind = 'lessons' | 'revisions' | 'grading';

export type AiUsageRow = {
  kind: AiUsageRowKind;
  used: number;
  limit: number;
  remaining: number;
  exhausted: boolean;
  // Grading row only: purchased suggestions on top of the plan allowance.
  creditRemaining?: number;
  creditExpiry?: string | null;
};

function finiteRow(kind: AiUsageRowKind, used: number, limit: number | null, remaining: number | null, unlimited: boolean): AiUsageRow | null {
  if (unlimited || limit === null || !Number.isFinite(limit) || limit <= 0) return null;
  const safeUsed = Math.max(0, Math.trunc(used || 0));
  const safeRemaining = remaining === null ? Math.max(limit - safeUsed, 0) : Math.max(0, Math.trunc(remaining));
  return { kind, used: safeUsed, limit, remaining: safeRemaining, exhausted: safeRemaining === 0 };
}

export function aiUsageRows(quota: AiUsageQuota | null | undefined): AiUsageRow[] {
  if (!quota) return [];
  // Admin accounts have no AI limits and do not see the panel.
  if (quota.plan_code === 'admin' || quota.grading_unlimited) return [];
  const grading = quota.grading_enabled
    ? finiteRow('grading', quota.grading_used, quota.grading_limit, quota.grading_remaining, quota.grading_unlimited)
    : null;
  if (grading) {
    const credit = Math.max(0, Math.trunc(quota.grading_credit_remaining ?? 0));
    grading.creditRemaining = credit;
    grading.creditExpiry = credit > 0 ? quota.grading_credit_next_expiry ?? null : null;
    grading.exhausted = grading.remaining === 0 && credit === 0;
  }
  return [
    finiteRow('lessons', quota.lesson_used, quota.lesson_limit, quota.lesson_remaining, quota.lesson_unlimited),
    finiteRow('revisions', quota.revision_used, quota.revision_limit, quota.revision_remaining, quota.revision_unlimited),
    grading,
  ].filter((row): row is AiUsageRow => row !== null);
}

export function aiUsageCreditText(row: AiUsageRow, english: boolean) {
  if (!row.creditRemaining) return null;
  const until = formatQuotaResetDate(row.creditExpiry ?? null, english);
  return english
    ? `+ ${row.creditRemaining} purchased${until ? ` (valid until ${until})` : ''}`
    : `+ ${row.creditRemaining} dokoupených${until ? ` (platné do ${until})` : ''}`;
}

// "Buy more" link under the grading row: individual Teacher Pro, top-ups on,
// and at most 10 suggestions left in total (plan + purchased).
export function shouldShowTopupLink(row: AiUsageRow, topupsAvailable: boolean) {
  return topupsAvailable
    && row.kind === 'grading'
    && row.remaining + (row.creditRemaining ?? 0) <= AI_GRADING_TOPUP_LINK_THRESHOLD;
}

export function aiUsageRowLabel(kind: AiUsageRowKind, english: boolean) {
  if (kind === 'lessons') return english ? 'New AI lessons' : 'Nové AI lekce';
  if (kind === 'revisions') return english ? 'AI edits' : 'AI úpravy';
  return english ? 'AI grading suggestions' : 'Návrhy hodnocení od AI';
}

export function aiUsageRemainingText(row: AiUsageRow, english: boolean) {
  return english ? `${row.remaining} of ${row.limit} left` : `zbývá ${row.remaining} z ${row.limit}`;
}
