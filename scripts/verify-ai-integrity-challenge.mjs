import fs from 'node:fs';

function source(path) {
  return fs.readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
}
function requireText(text, needle, message) {
  if (!text.includes(needle)) throw new Error(`AI integrity challenge regression: ${message}`);
}

const grading = source('lib/grading.ts');
const direct = source('app/api/sessions/[id]/evaluations/[evaluationId]/grade/route.ts');
const worker = source('app/api/internal/grading/jobs/route.ts');
const studentApi = source('app/api/student/sessions/[id]/integrity-challenge/route.ts');
const studentUi = source('components/IntegrityChallenge.tsx');
const studentSession = source('components/StudentSession.tsx');
const queue = source('app/api/sessions/[id]/evaluations/queue/route.ts');
const teacherUi = source('components/EvaluationReviewQueue.tsx');
const migration = source('supabase/migrations/20260920201500_add_ai_integrity_challenges.sql');

requireText(grading, 'integrityChallengeQuestion: z.string().trim().min(10).max(500).nullable()', 'grader output does not include a bounded verification question.');
requireText(grading, 'input.answerText.length >= 280', 'high suspicion length guard is missing.');
requireText(grading, 'aiUseSignals.length >= 2', 'high suspicion multi-signal guard is missing.');
requireText(grading, 'Boolean(output.integrityChallengeQuestion)', 'high suspicion does not require a valid verification question.');
requireText(grading, 'Při "none" nebo "low" vrať integrityChallengeQuestion = null.', 'grader prompt does not isolate challenge generation to high suspicion.');

requireText(direct, "supabase.rpc('record_response_integrity_challenge'", 'direct grading does not attach the verification question.');
requireText(worker, "supabase.rpc('record_grading_job_integrity_challenge'", 'background grading does not attach the verification question.');

requireText(studentApi, "participant_token_hash", 'student API does not bind access to participant token.');
requireText(studentApi, "integrity_challenge_presented_at", 'challenge timer is not anchored to presentation.');
requireText(studentApi, "+ 60_000", 'challenge does not enforce the 60 second response window.');
requireText(studentApi, "integrity_challenge_status: 'expired'", 'expired challenges are not closed server-side.');
requireText(studentApi, "integrity_challenge_status: 'answered'", 'submitted challenges are not closed server-side.');

requireText(studentSession, '<IntegrityChallenge sessionId={sessionId} />', 'student session does not display the verification UI.');
requireText(studentUi, 'Odpověz vlastními slovy jednou až dvěma větami.', 'student UX does not explain the short verification.');
requireText(queue, 'integrity_challenge_answer', 'teacher queue does not load verification evidence.');
requireText(teacherUi, 'Kontrolní otázka:', 'teacher UI does not show the verification question.');
requireText(teacherUi, 'Potvrdit nepovolené využití AI → 0 bodů', 'teacher UI lacks explicit human-confirmed zero-score action.');

requireText(migration, "integrity_challenge_status in ('not_required', 'pending', 'answered', 'expired')", 'challenge lifecycle constraint is missing.');
requireText(migration, 'where integrity_challenge_status = \'pending\'', 'pending challenge index is missing.');
requireText(migration, 'e.participant_id is not null', 'automatic challenge is not limited to individual responses.');
requireText(migration, 'Team responses intentionally have no individual challenge recipient.', 'team-response exception is undocumented.');
requireText(migration, 'revoke all on function public.record_response_integrity_challenge', 'teacher challenge RPC permissions are not hardened.');
requireText(migration, 'revoke all on function public.record_grading_job_integrity_challenge', 'worker challenge RPC permissions are not hardened.');

console.log('AI integrity challenge checks passed.');
