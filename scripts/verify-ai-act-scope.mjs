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
