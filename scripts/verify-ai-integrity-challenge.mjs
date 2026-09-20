import fs from 'node:fs';

function source(path) {
  return fs.readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
}
function requireText(text, needle, message) {
  if (!text.includes(needle)) throw new Error(`AI integrity challenge regression: ${message}`);
}
function forbidText(text, needle, message) {
  if (text.includes(needle)) throw new Error(`AI integrity challenge regression: ${message}`);
}

const grading = source('lib/grading.ts');
const direct = source('app/api/sessions/[id]/evaluations/[evaluationId]/grade/route.ts');
const worker = source('app/api/internal/grading/jobs/route.ts');
const queue = source('app/api/sessions/[id]/evaluations/queue/route.ts');
const studentEdge = source('supabase/functions/student-session/index.ts');
const studentPage = source('components/StudentSession.tsx');
const studentCard = source('components/IntegrityChallengeCard.tsx');
const teacher = source('components/EvaluationReviewQueue.tsx');
const migration = source('supabase/migrations/20260920195500_add_ai_integrity_challenges.sql');

requireText(grading, 'integrityChallengeQuestion: z.string().trim().min(10).max(500).nullable()', 'grader output is missing bounded verification question.');
requireText(grading, 'input.answerText.length >= 280', 'existing high-suspicion minimum length guard disappeared.');
requireText(grading, 'aiUseSignals.length >= 2', 'existing multiple-signal guard disappeared.');
requireText(grading, '&& Boolean(output.integrityChallengeQuestion)', 'high suspicion does not require a usable verification question.');
requireText(grading, 'nesmí prozrazovat podezření na AI', 'student question is not required to stay neutral.');

requireText(direct, "supabase.rpc('record_response_evaluation_integrity_challenge'", 'direct grader does not persist the challenge.');
requireText(worker, "supabase.rpc('record_grading_job_integrity_challenge'", 'background grader does not persist the challenge.');
requireText(queue, 'integrity_challenge_status', 'teacher queue does not expose challenge state.');

requireText(studentEdge, 'Date.now() + 60_000', 'challenge does not use a 60-second window.');
requireText(studentEdge, 'integrity_challenge_presented_at', 'timer does not start from first presentation.');
requireText(studentEdge, 'action === "integrity_challenge"', 'student challenge submission endpoint is missing.');
requireText(studentEdge, '.eq("ai_use_suspicion", "high")', 'student challenge does not use the canonical integrity signal.');
forbidText(studentEdge, 'ai_suspicion', 'legacy duplicate suspicion column is still referenced.');

requireText(studentPage, '<IntegrityChallengeCard', 'student page does not render the challenge.');
requireText(studentCard, 'Rychlé ověření porozumění', 'student copy is not neutral.');
requireText(studentCard, 'remaining', 'student does not see a countdown.');

requireText(teacher, 'Jde pouze o upozornění podle textových vzorců, ne o důkaz.', 'teacher warning that suspicion is not proof is missing.');
requireText(teacher, 'Potvrdit nepovolené využití AI → 0 bodů', 'explicit teacher-only zero action is missing.');
requireText(teacher, "effectiveIntegrityChallengeStatus(evaluation) === 'pending'", 'zero action is not held while the student challenge is pending.');
requireText(teacher, 'Student neodpověděl v 60sekundovém limitu.', 'teacher does not see challenge timeout.');

requireText(migration, 'record_response_evaluation_integrity_challenge', 'challenge teacher RPC is missing.');
requireText(migration, 'record_grading_job_integrity_challenge', 'challenge worker RPC is missing.');
requireText(migration, 'expire_integrity_challenges_on_session_end', 'pending challenges are not expired when a live lesson ends.');
requireText(migration, 'drop column if exists ai_suspicion', 'experimental duplicate suspicion storage is not reconciled.');
requireText(migration, 'integrity_challenge_presented_at', 'challenge presentation timestamp is not persisted.');

console.log('AI integrity challenge checks passed.');

