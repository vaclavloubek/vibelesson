import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');
const fail = (message) => {
  throw new Error(`AI grading quota communication regression: ${message}`);
};
const equal = (actual, expected, label) => {
  if (actual !== expected) fail(`${label}\n  expected: ${JSON.stringify(expected)}\n  actual:   ${JSON.stringify(actual)}`);
};
const requireText = (content, needle, label) => {
  if (!content.includes(needle)) fail(label);
};

const {
  manualReasonFromGraderVersion,
  manualGradingStatusText,
  gradingQuotaBannerText,
  shouldShowGradingQuotaBanner,
  shouldShowLowGradingNotice,
  lowGradingNoticeText,
  aiUsageRows,
} = await import('../lib/ai-grading-quota-communication.ts');

// 1. grader_version -> manualReason
equal(manualReasonFromGraderVersion('manual-budget-v1'), 'quota', 'budget fallback maps to quota');
equal(manualReasonFromGraderVersion('manual-payment-v1'), 'payment', 'payment pause maps to payment');
equal(manualReasonFromGraderVersion('manual-v1'), 'plan', 'plan without AI grading maps to plan');
equal(manualReasonFromGraderVersion('gpt-5-mini-grader-v2'), null, 'AI grader version has no manual reason');
equal(manualReasonFromGraderVersion(null), null, 'missing grader version has no manual reason');

equal(manualGradingStatusText('quota', false), 'Čeká na ruční hodnocení – limit návrhů od AI je vyčerpaný.', 'CS quota status');
equal(manualGradingStatusText('payment', false), 'Čeká na ruční hodnocení – AI je pozastavená kvůli platbě.', 'CS payment status');
equal(manualGradingStatusText('plan', false), 'Čeká na ruční hodnocení.', 'CS plan status unchanged');
equal(manualGradingStatusText(null, false), 'Čeká na ruční hodnocení.', 'CS unknown reason keeps the old text');
equal(manualGradingStatusText('quota', true), 'Waiting for manual grading – the AI grading suggestion allowance is used up.', 'EN quota status');
equal(manualGradingStatusText('payment', true), 'Waiting for manual grading – AI is paused because of a payment issue.', 'EN payment status');
equal(manualGradingStatusText('plan', true), 'Waiting for manual grading.', 'EN plan status');

// 2. Live control centre banner
const windowEnd = '2026-10-17T22:00:00.000Z'; // 18. 10. 2026 in Europe/Prague
const individual = { gradingEnabled: true, gradingUnlimited: false, gradingUsed: 60, gradingLimit: 60, gradingRemaining: 0, windowEnd, scope: 'individual' };
const school = { ...individual, gradingUsed: 300, gradingLimit: 300, scope: 'organization' };
equal(
  gradingQuotaBannerText(individual, false),
  'Návrhy hodnocení od AI jsou pro toto období vyčerpané (60 z 60). Nic se nerozbilo. Nové odpovědi ohodnoť prosím ručně podle kritérií. Limit se obnoví 18. 10. 2026.',
  'CS individual banner',
);
equal(
  gradingQuotaBannerText(school, false),
  'Návrhy hodnocení od AI jsou pro školu v tomto období vyčerpané (300 z 300). Nic se nerozbilo. Nové odpovědi ohodnoť prosím ručně podle kritérií. Limit se obnoví 18. 10. 2026.',
  'CS school banner',
);
equal(
  gradingQuotaBannerText(individual, true),
  'AI grading suggestions for this period are used up (60 of 60). Nothing is broken. Please grade new responses manually using the criteria. The allowance resets on 18 Oct 2026.',
  'EN individual banner',
);
equal(
  gradingQuotaBannerText(school, true),
  'AI grading suggestions for your school are used up for this period (300 of 300). Nothing is broken. Please grade new responses manually using the criteria. The allowance resets on 18 Oct 2026.',
  'EN school banner',
);

equal(shouldShowGradingQuotaBanner(individual, []), true, 'banner shows at 0 remaining');
equal(shouldShowGradingQuotaBanner({ ...individual, gradingUsed: 10, gradingRemaining: 50 }, []), false, 'no banner with allowance left');
equal(shouldShowGradingQuotaBanner({ ...individual, gradingUsed: 45, gradingRemaining: 15 }, ['quota']), true, 'banner shows when a response fell back because of the quota (cost ceiling)');
equal(shouldShowGradingQuotaBanner(null, ['quota']), true, 'banner shows from the queue even without quota data');
equal(shouldShowGradingQuotaBanner(null, ['plan', 'payment', null]), false, 'plan/payment fallbacks do not show the quota banner');
equal(shouldShowGradingQuotaBanner({ ...individual, gradingUnlimited: true, gradingLimit: null, gradingRemaining: null }, ['quota']), false, 'admin never sees the banner');
equal(shouldShowGradingQuotaBanner({ ...individual, gradingEnabled: false, gradingLimit: null, gradingRemaining: null }, []), false, 'plans without AI grading see no banner');

equal(shouldShowLowGradingNotice({ ...individual, gradingUsed: 52, gradingRemaining: 8 }), true, 'low notice at 8 left');
equal(shouldShowLowGradingNotice({ ...individual, gradingUsed: 50, gradingRemaining: 10 }), false, 'no low notice at 10 left');
equal(shouldShowLowGradingNotice(individual), false, 'no low notice at 0 left (banner instead)');
equal(lowGradingNoticeText(8, false), 'Zbývá 8 návrhů hodnocení od AI. Další odpovědi pak ohodnotíš ručně.', 'CS low notice (8)');
equal(lowGradingNoticeText(3, false), 'Zbývají 3 návrhy hodnocení od AI. Další odpovědi pak ohodnotíš ručně.', 'CS low notice (3)');
equal(lowGradingNoticeText(1, false), 'Zbývá 1 návrh hodnocení od AI. Další odpovědi pak ohodnotíš ručně.', 'CS low notice (1)');
equal(lowGradingNoticeText(8, true), '8 AI grading suggestions left. After that, you will grade new responses manually.', 'EN low notice (8)');

// 3. AI usage panel rows per plan (values from get_ai_quota, never hard-coded)
const kinds = (quota) => aiUsageRows(quota).map((row) => row.kind).join(',');
const base = { lesson_used: 1, lesson_remaining: null, revision_used: 2, revision_remaining: null, lesson_unlimited: false, revision_unlimited: false, grading_used: 0, grading_limit: null, grading_remaining: null, grading_unlimited: false, grading_enabled: false };
const free = { ...base, lesson_limit: 3, revision_limit: 10, plan_code: 'free' };
const teacherPro = { ...base, lesson_limit: 25, revision_limit: 40, grading_enabled: true, grading_limit: 60, grading_used: 60, grading_remaining: 0, plan_code: 'teacher_pro' };
const campus = { ...base, lesson_limit: 300, revision_limit: 600, grading_enabled: true, grading_limit: 750, grading_remaining: 750, plan_code: 'campus' };
const admin = { ...base, lesson_limit: null, revision_limit: null, lesson_unlimited: true, revision_unlimited: true, grading_enabled: true, grading_unlimited: true, plan_code: 'admin' };
equal(kinds(free), 'lessons,revisions', 'Free sees lessons and edits only');
equal(kinds({ ...free, lesson_limit: 10, revision_limit: 20, plan_code: 'teacher' }), 'lessons,revisions', 'Teacher sees lessons and edits only');
equal(kinds({ ...free, lesson_limit: 40, revision_limit: 80, plan_code: 'team' }), 'lessons,revisions', 'Team sees lessons and edits only');
equal(kinds(teacherPro), 'lessons,revisions,grading', 'Teacher Pro also sees grading');
equal(kinds(campus), 'lessons,revisions,grading', 'Campus also sees grading');
equal(kinds({ ...campus, plan_code: 'school', grading_limit: 300, grading_remaining: 300 }), 'lessons,revisions,grading', 'School also sees grading');
equal(kinds(admin), '', 'admin sees no panel');
equal(kinds(null), '', 'failed RPC renders no panel');
const freeRow = aiUsageRows(free)[0];
equal(`${freeRow.remaining}/${freeRow.limit}`, '2/3', 'Free limit comes from the RPC (3 lessons)');
equal(aiUsageRows(teacherPro).find((row) => row.kind === 'grading').exhausted, true, 'exhausted row is flagged (amber)');

// 4. Wiring
const queueRoute = read('app/api/sessions/[id]/evaluations/queue/route.ts');
requireText(queueRoute, "manualOnly: parsed.data.grader_version.startsWith('manual-')", 'queue keeps manualOnly for compatibility');
requireText(queueRoute, 'manualReason: manualReasonFromGraderVersion(parsed.data.grader_version)', 'queue returns manualReason');
const regradeRoute = read('app/api/sessions/[id]/evaluations/[evaluationId]/regrade/route.ts');
requireText(regradeRoute, "manualReason: gradingMode === 'ai' ? null : aiBillingPaused ? 'payment' : 'plan'", 'regrade returns manualReason');
const queue = read('components/EvaluationReviewQueue.tsx');
requireText(queue, 'manualGradingStatusText(evaluation.manualReason ?? null, english)', 'queue shows the reason text');
requireText(queue, "manualReason: gradingMode === 'manual' ? manualReason : null", 'requeue keeps the manual reason');
requireText(queue, 'GRADING_QUEUE_EVENT', 'queue announces changes to the banner');
const banner = read('components/AiGradingQuotaBanner.tsx');
requireText(banner, 'window.sessionStorage.getItem(key)', 'banner remembers dismissal per session');
if (/setInterval/.test(banner)) fail('banner must refresh on queue changes, not by polling');
if (/window\.sessionStorage\.(get|set)Item/.test(banner.replace(/try \{[\s\S]*?\} catch/g, ''))) fail('sessionStorage access must be wrapped in try/catch');
requireText(read('app/sessions/[id]/page.tsx'), '<AiGradingQuotaBanner sessionId={id} />', 'banner is rendered in the control centre');
const lessonsPage = read('app/lessons/page.tsx');
requireText(lessonsPage, "supabase.rpc('get_ai_quota')", 'My lessons reads the same RPC as /subscription');
requireText(lessonsPage, '.catch(() => null)', 'My lessons survives a failing quota RPC');
requireText(lessonsPage, '<AiUsagePanel quota={aiQuota} english={english} />', 'My lessons renders the AI usage panel');
const panelCss = read('components/AiUsagePanel.module.css');
requireText(panelCss, 'var(--amber)', 'exhausted row uses amber');
requireText(panelCss, 'minmax(min(100%, 220px), 1fr)', 'panel rows wrap on phones without horizontal scroll');

const migration = read('neon/migrations/0016_ai_grading_quota_communication.sql');
requireText(migration, 'create table if not exists private.ai_grading_quota_notices', 'notice ledger');
requireText(migration, '((coalesce(organization_id, user_id)), window_start)', 'one notice per account and window');
requireText(migration, 'revoke all on table private.ai_grading_quota_notices from anon, anonymous, authenticated, authenticator;', 'notice ledger is deny-all for Data API roles');
requireText(migration, "or v_used_cost + v_reservation > v_budget then\n    insert into private.ai_grading_quota_notices", 'count limit and cost ceiling record a notice');
requireText(migration, 'on conflict do nothing;\n\n    return false;', 'notice insert is idempotent and the refusal is unchanged');
requireText(migration, '   quota_source text,\n   plan_code text,\n   quota_scope text\n )', 'get_ai_quota appends plan_code and quota_scope at the end');
requireText(migration, 'drop function if exists public.get_ai_quota();', 'return type change needs drop + create');
requireText(migration, 'grant execute on function public.get_ai_quota() to authenticated;', 'get_ai_quota keeps its grant');
requireText(migration, "(n.status = 'failed' and n.attempt_count < 5)", 'failed notices retry at most 5 attempts');
requireText(migration, 'for update skip locked', 'concurrent drains do not claim the same notice');

const marketing = read('lib/marketing-lifecycle.ts');
requireText(marketing, "| 'syllonaut.grading_quota.reached'", 'event is part of MarketingLifecycleEvent');
requireText(marketing, 'export async function drainAiGradingQuotaNotices(', 'drain exists');
requireText(marketing, "if (result.status !== 'active') {\n          status = 'skipped';", 'no consent means skipped');
for (const key of ['used:', 'limit:', 'reset_date:', 'quota_scope:', 'plan_code:']) {
  requireText(marketing, `            ${key}`, `event payload contains ${key}`);
}
const worker = read('lib/neon/grading-outbox-worker.ts');
requireText(worker, 'try {\n    quotaNotices = await drainAiGradingQuotaNotices(20);\n  } catch', 'grading drain sends notices inside try/catch');
const cron = read('app/api/cron/neon-grading/route.ts');
requireText(cron, 'quotaNoticeRetry = await drainAiGradingQuotaNotices(20);', 'cron retries notices');

const copy = [read('lib/ai-grading-quota-communication.ts'), banner, read('components/AiUsagePanel.tsx')].join('\n');
for (const banned of ['AI hodnotí', 'bez omezení', 'unlimited AI', 'detektor AI']) {
  if (copy.includes(banned)) fail(`copy must not say "${banned}"`);
}

console.log('AI grading quota communication checks passed.');
