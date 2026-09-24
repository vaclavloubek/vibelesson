import assert from 'node:assert/strict';
import fs from 'node:fs';

// LEGAL-021: AI point suggestions stay a preparatory task (AI Act art. 6(3)(d)):
// only teacher-confirmed points count, and the intended purpose is documented.
const read = (path) => fs.readFileSync(path, 'utf8');

const scoreboard = read('lib/scoreboard-server.ts');
assert.ok(scoreboard.includes('if (evaluation.teacher_confirmed && typeof evaluation.teacher_score === \'number\') {'), 'teacher scoreboard must count only teacher-confirmed points');
assert.ok(!scoreboard.includes('evaluation.teacher_score ?? evaluation.ai_score'), 'unconfirmed AI points must not fall back into the score');

const migration = read('neon/migrations/0012_ai_points_require_teacher_confirmation.sql');
for (const needle of [
  "else case when team_evaluation.teacher_confirmed then coalesce(team_evaluation.teacher_score, 0) else 0 end",
  "else case when participant_evaluation.teacher_confirmed then coalesce(participant_evaluation.teacher_score, 0) else 0 end",
  "raise exception 'get_student_public_scoreboard definition changed; refusing to patch'",
  'create or replace function public.confirm_ai_evaluation_proposals(p_session_id uuid)',
  'select 1 from public.sessions s where s.id = p_session_id and s.teacher_id = v_user_id',
  'revoke all on function public.confirm_ai_evaluation_proposals(uuid) from public, anon, anonymous;',
]) {
  assert.ok(migration.includes(needle), `migration 0012 is missing: ${needle.slice(0, 80)}`);
}

assert.ok(read('app/api/sessions/[id]/evaluations/confirm-ai/route.ts').includes("supabase.rpc('confirm_ai_evaluation_proposals'"), 'bulk confirmation runs as the authenticated teacher');
const teacherBoard = read('components/TeacherScoreboard.tsx');
assert.ok(teacherBoard.includes("ui('Potvrdit všechny návrhy AI', 'Confirm all AI suggestions')"), 'teacher can confirm AI suggestions in bulk');
assert.ok(teacherBoard.includes('do skóre ani pořadí se nezapočítají, dokud je nepotvrdíš'), 'teacher is told unconfirmed AI points do not count');

const studentServer = read('lib/neon/student-session-server.ts');
const studentEvaluationsQuery = studentServer.slice(studentServer.indexOf('async function readConfirmedEvaluations'), studentServer.indexOf('async function verifyParticipant'));
assert.ok(studentEvaluationsQuery.includes('and e.teacher_confirmed'), 'students may see only teacher-confirmed evaluations');
assert.ok(!/ai_use|integrity/i.test(studentEvaluationsQuery), 'the AI-use integrity signal must never reach the student');
assert.ok(studentEvaluationsQuery.includes("summary: source === 'ai' && rationale ? rationale : null"), 'the AI summary is shown only when the teacher confirmed the AI proposal unchanged');
assert.ok(studentEvaluationsQuery.includes('teacherNote: row.teacher_note_for_student === true && note ? note : null'), 'only notes written for the student are shown to the student');
assert.ok(read('components/StudentEvaluationCard.tsx').includes("ui('Souhrn AI hodnocení, potvrzený učitelem', 'AI evaluation summary, confirmed by the teacher')"), 'AI-generated summary must be visibly labelled for the student');
assert.ok(read('components/EvaluationReviewQueue.tsx').includes("body: JSON.stringify({ score: 0, note }),"), 'the automatic integrity note must not be marked as a note for the student');

const termsContent = read('lib/terms-content.ts');
assert.ok(termsContent.includes('TERMS_AI_SCORING_PURPOSE_CLAUSE') && termsContent.includes('Funkce není určena k úřednímu hodnocení studentů'), 'intended purpose must exclude official assessment');
assert.ok(read('app/terms/page.tsx').includes('TERMS_AI_SCORING_PURPOSE_CLAUSE') && read('lib/individual-contract-snapshot.ts').includes('TERMS_AI_SCORING_PURPOSE_CLAUSE'), 'Terms and contract snapshot state the intended purpose');

const pricing = read('components/PricingPage.tsx');
assert.ok(pricing.includes('AI návrhů bodování otevřených, týmových a exit-ticket odpovědí k potvrzení učitelem'), 'Pricing presents AI scoring as teacher-confirmed suggestions');
assert.ok(!pricing.includes('AI hodnocení bodovaných'), 'Pricing must not advertise AI grading as final assessment');

const assessment = read('docs/AI_ACT_ASSESSMENT.md');
for (const needle of ['čl. 6 odst. 3 písm. d)', 'Příloha III bod 3 písm. b)', 'Čl. 50 odst. 2', 'K potvrzení právníkem']) {
  assert.ok(assessment.includes(needle), `AI Act assessment must cover: ${needle}`);
}

console.log('LEGAL-021 AI Act scope checks passed.');
