import fs from 'node:fs';

function source(path) {
  return fs.readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
}
function requireText(text, needle, message) {
  if (!text.includes(needle)) throw new Error(`AI integrity alert regression: ${message}`);
}
function requireCount(text, needle, count, message) {
  const actual = text.split(needle).length - 1;
  if (actual !== count) throw new Error(`AI integrity alert regression: ${message} (expected ${count}, got ${actual})`);
}

const grading = source('lib/grading.ts');
const direct = source('app/api/sessions/[id]/evaluations/[evaluationId]/grade/route.ts');
const worker = source('app/api/internal/grading/jobs/route.ts');
const queue = source('app/api/sessions/[id]/evaluations/queue/route.ts');
const ui = source('components/EvaluationReviewQueue.tsx');
const pricing = source('components/PricingPage.tsx');
const copy = source('lib/ai-integrity-copy.ts');
const migration = source('supabase/migrations/20260920180324_add_ai_integrity_alert.sql');

requireText(grading, "aiUseSuspicion: z.enum(['none', 'low', 'high'])", 'grader output does not include a bounded suspicion signal.');
requireText(grading, 'Tento integrity signál nikdy nepoužívej k úpravě criterion points', 'grader prompt does not explicitly isolate suspicion from scoring.');
requireText(grading, 'input.answerText.length >= 280', 'high-suspicion minimum answer-length guard is missing.');
requireText(grading, "modelSignals.length >= 2", 'high suspicion does not require multiple concrete signals.');
requireText(grading, "needsReview: output.confidence < 0.7 || aiUseSuspicion === 'high'", 'high suspicion does not route to teacher review.');
const bulkConfirm = source('neon/migrations/0015_bulk_confirm_skips_ai_integrity_alerts.sql');
requireText(bulkConfirm, "and e.ai_use_suspicion is distinct from 'high';", 'bulk confirmation must skip answers with a high AI-use alert.');
requireText(bulkConfirm, 'create or replace function public.confirm_ai_evaluation_proposals(p_session_id uuid)', 'bulk confirmation must keep its signature.');
const scoreboardServer = source('lib/scoreboard-server.ts');
requireText(scoreboardServer, "item.ai_use_suspicion === 'high'", 'teacher scoreboard must count alerts excluded from bulk confirmation.');
const teacherScoreboard = source('components/TeacherScoreboard.tsx');
requireText(teacherScoreboard, 'Ty se hromadně nepotvrdí, projdi je jednotlivě ve frontě kontroly.', 'teacher must be told that alerted answers are not bulk-confirmed.');
requireText(grading, 'const copyArtifacts = detectCopyArtifacts(input.answerText);', 'grader does not run the deterministic copy-trace detector.');
requireText(grading, 'highSuspicionEligible || copyArtifactKinds >= 2', 'two independent copy traces must raise a teacher alert.');
requireText(grading, "output.aiUseSuspicion === 'none' && copyArtifactKinds === 0", 'a single copy trace must surface at least as a low signal.');
{
  const { detectCopyArtifacts } = await import('../lib/ai-copy-artifacts.ts');
  const kinds = (text) => detectCopyArtifacts(text).map((artifact) => artifact.kind).sort().join(',');
  const pasted = '1. Analýza\u00A0 \nVstup \\rightarrow Nabídka\u00A0 \nudálost \u2060click_add\u2060';
  if (kinds(pasted) !== 'invisible_characters,latex_markup,markdown_line_breaks') {
    throw new Error(`AI integrity alert regression: copied AI-chat answer not detected (${kinds(pasted)}).`);
  }
  for (const typed of [
    '1. 30%, 55% ,39,9%, 40%\n2. Mezi zobrazení nabídky a přidáním rezervace nejvíce ubylo \n3. Event - dát sleva',
    'Podle mě je to „dobrý“ nápad – cena 5\u00A0000\u00A0Kč a v\u00A0Praze, 3 * 4 = 12, *důležité*\n- odrážka',
    'Soubor je v C:\\Users\\rightarrow\\text a stojí $5 až $10.',
  ]) {
    if (kinds(typed)) throw new Error(`AI integrity alert regression: typed answer falsely flagged (${kinds(typed)}).`);
  }
  for (const artifact of detectCopyArtifacts(pasted)) {
    if (artifact.signal.length > 240) throw new Error('AI integrity alert regression: copy-trace signal exceeds the 240-character DB limit.');
  }
}

requireText(direct, "supabase.rpc('finish_response_evaluation_v2'", 'direct grading does not persist integrity metadata through v2 RPC.');
requireText(direct, 'p_ai_use_suspicion: result.aiUseSuspicion', 'direct grading does not pass suspicion.');
requireText(worker, "supabase.rpc('finish_grading_job_v2'", 'background grading does not persist integrity metadata through v2 RPC.');
requireText(worker, 'p_ai_use_signals: result.aiUseSignals', 'background grading does not pass evidence signals.');

requireText(queue, 'ai_use_suspicion', 'teacher queue does not load suspicion.');
requireText(queue, 'aiUseSignals: parsed.data.ai_use_signals', 'teacher queue does not expose integrity signals.');
requireText(ui, 'Podezření na využití generativní AI', 'teacher alert is missing.');
requireText(ui, 'Body se tím automaticky nemění.', 'teacher alert does not state that the score is unaffected.');
requireText(ui, 'Potvrdit nepovolené využití AI → 0 bodů', 'teacher cannot explicitly confirm unauthorized AI use with zero points.');
requireText(ui, "body: JSON.stringify({ score: 0, note })", 'teacher integrity zero action does not use the authenticated review endpoint.');
requireText(ui, 'Opravdu potvrdit nepovolené využití generativní AI?', 'zero-point integrity action is missing explicit teacher confirmation.');

const forbiddenChallengeFiles = [
  'components/IntegrityChallengeCard.tsx',
  'app/api/student/sessions/[id]/integrity-challenge/route.ts',
];
for (const path of forbiddenChallengeFiles) {
  if (fs.existsSync(new URL(`../${path}`, import.meta.url))) {
    throw new Error(`AI integrity alert regression: automatic student verification challenge must not exist (${path}).`);
  }
}

const csFeature = 'AI návrhů bodování otevřených, týmových a exit-ticket odpovědí k potvrzení učitelem';
const enFeature = 'AI point suggestions for open, team and exit-ticket responses, confirmed by the teacher';
requireCount(pricing, csFeature, 3, 'CZ pricing must advertise the feature only for Teacher Pro, School and Campus.');
requireCount(pricing, enFeature, 3, 'EN pricing must advertise the feature only for Teacher Pro, School and Campus.');
if (pricing.includes('s detekcí podezřelého využití AI') || pricing.includes('with suspicious AI-use detection')) {
  throw new Error('AI integrity alert regression: AI grading copy must not duplicate the separate integrity-protection benefit.');
}
const csNoticeFeature = 'Upozornění na možné využití AI ve studentských odpovědích';
const enNoticeFeature = 'Alerts about possible AI use in student responses';
requireText(copy, csNoticeFeature, 'shared CZ copy must describe an alert, not protection or detection.');
requireText(copy, enNoticeFeature, 'shared EN copy must describe an alert, not protection or detection.');
requireText(copy, 'nikoli důkaz. Body se automaticky nemění.', 'CZ explanation must state the signal is not proof and cannot change scores.');
requireText(copy, 'not proof. Scores do not change automatically.', 'EN explanation must state the signal is not proof and cannot change scores.');
requireCount(pricing, 'AI_INTEGRITY_NOTICE.cs', 4, 'CZ notice must be shared by Teacher Pro, School, Campus and highlighting.');
requireCount(pricing, 'AI_INTEGRITY_NOTICE.en', 4, 'EN notice must be shared by Teacher Pro, School, Campus and highlighting.');
requireText(pricing, "AI_INTEGRITY_NOTICE[english ? 'en' : 'cs']", 'Pricing must visibly explain the integrity notice.');
requireText(pricing, "AI_INTEGRITY_NOTICE_EXPLANATION[english ? 'en' : 'cs']", 'Pricing must visibly explain the signal limits.');
for (const forbiddenClaim of [
  'Ochrana proti nepovolenému využití AI ve studentských odpovědích',
  'Protection against unauthorized AI use in student responses',
]) {
  if (pricing.includes(forbiddenClaim) || copy.includes(forbiddenClaim)) {
    throw new Error('AI integrity alert regression: customer-facing copy must not promise protection against AI use.');
  }
}
const teamSection = pricing.slice(pricing.indexOf("id: 'team'"), pricing.indexOf("id: 'school'"));
if (teamSection.includes('AI hodnocení') || teamSection.includes('AI grading')) {
  throw new Error('AI integrity alert regression: Team pricing must not advertise AI grading without the entitlement.');
}

requireText(migration, "add column if not exists ai_use_suspicion", 'migration is missing suspicion storage.');
requireText(migration, 'finish_response_evaluation_v2', 'migration is missing teacher finish RPC v2.');
requireText(migration, 'finish_grading_job_v2', 'migration is missing background finish RPC v2.');
requireText(migration, "p_ai_use_suspicion = 'high' then 'needs_review'", 'database does not route high suspicion to review.');
requireText(migration, 'ai_score = p_ai_score', 'database must preserve the grader score independently from suspicion.');

console.log('AI integrity alert checks passed.');
