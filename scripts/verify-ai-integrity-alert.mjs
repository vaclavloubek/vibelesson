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
const migration = source('supabase/migrations/20260920180324_add_ai_integrity_alert.sql');

requireText(grading, "aiUseSuspicion: z.enum(['none', 'low', 'high'])", 'grader output does not include a bounded suspicion signal.');
requireText(grading, 'Tento integrity signál nikdy nepoužívej k úpravě criterion points', 'grader prompt does not explicitly isolate suspicion from scoring.');
requireText(grading, 'input.answerText.length >= 280', 'high-suspicion minimum answer-length guard is missing.');
requireText(grading, "aiUseSignals.length >= 2", 'high suspicion does not require multiple concrete signals.');
requireText(grading, "needsReview: output.confidence < 0.7 || aiUseSuspicion === 'high'", 'high suspicion does not route to teacher review.');

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

const csFeature = 'AI hodnocení bodovaných otevřených, týmových a exit-ticket odpovědí';
const enFeature = 'AI grading of scored open, team and exit-ticket responses';
requireCount(pricing, csFeature, 3, 'CZ pricing must advertise the feature only for Teacher Pro, School and Campus.');
requireCount(pricing, enFeature, 3, 'EN pricing must advertise the feature only for Teacher Pro, School and Campus.');
if (pricing.includes('s detekcí podezřelého využití AI') || pricing.includes('with suspicious AI-use detection')) {
  throw new Error('AI integrity alert regression: AI grading copy must not duplicate the separate integrity-protection benefit.');
}
const csProtectionFeature = 'Ochrana proti nepovolenému využití AI ve studentských odpovědích';
const enProtectionFeature = 'Protection against unauthorized AI use in student responses';
requireCount(pricing, csProtectionFeature, 3, 'CZ pricing must show AI integrity protection only for Teacher Pro, School and Campus.');
requireCount(pricing, enProtectionFeature, 3, 'EN pricing must show AI integrity protection only for Teacher Pro, School and Campus.');
requireText(pricing, "feature.startsWith('Ochrana proti nepovolenému využití AI')", 'CZ AI integrity protection is not highlighted.');
requireText(pricing, "feature.startsWith('Protection against unauthorized AI use')", 'EN AI integrity protection is not highlighted.');
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
