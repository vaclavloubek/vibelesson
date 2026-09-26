// With the scoreboard revealed, the active quiz must not count before its
// results are revealed. Otherwise a student sees their score change ~3 s after
// answering and can switch the (still changeable) answer until it goes up;
// the projector ranking would show the same.
//
// 1. Runs the real lib/scoreboard-server.ts (teacher scoreboard and Presenter)
//    through Node type stripping against a fake Supabase-compatible client.
// 2. Checks that Neon migration 0025 applies the same rule in
//    get_student_public_scoreboard and keeps LEGAL-021 (teacher-confirmed
//    points only). The SQL itself was tested on a temporary Neon branch.
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { registerHooks } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';

const repoRoot = fileURLToPath(new URL('../', import.meta.url));
const read = (path) => readFileSync(`${repoRoot}${path}`, 'utf8');
const stub = (source) => ({ url: `data:text/javascript,${encodeURIComponent(source)}`, shortCircuit: true });

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === '@/lib/auth') return stub('export async function getAuthenticatedUserId() { return {}; }');
    if (specifier.startsWith('@/')) {
      const base = `${repoRoot}${specifier.slice(2)}`;
      const file = ['.ts', '.tsx', '/index.ts'].map((suffix) => `${base}${suffix}`).find(existsSync);
      if (file) return { url: pathToFileURL(file).href, shortCircuit: true };
    }
    return nextResolve(specifier, context);
  },
});

const { loadTeacherScoreboard } = await import(pathToFileURL(`${repoRoot}lib/scoreboard-server.ts`).href);

const quiz = (id, correctAnswer) => ({
  id,
  type: 'quiz',
  title: `Quiz ${id}`,
  durationMinutes: 5,
  instructions: 'Choose one.',
  options: ['A', 'B'],
  correctAnswer,
  points: 2,
});
const lesson = {
  title: 'Scoreboard test',
  audience: 'Test',
  totalMinutes: 30,
  groupSize: '1',
  learningObjectives: ['One', 'Two'],
  blocks: [quiz('q1', 'A'), quiz('q2', 'B'), quiz('q3', 'A')],
};

function fakeClient(session) {
  const tables = {
    sessions: [session],
    participants: [
      { id: 'p1', display_name: 'Anna', team_id: null, joined_at: '2026-09-26T08:00:00Z' },
      { id: 'p2', display_name: 'Bára', team_id: null, joined_at: '2026-09-26T08:00:01Z' },
    ],
    responses: [
      { participant_id: 'p1', block_id: 'q1', answer: { choice: 'A' } },
      { participant_id: 'p2', block_id: 'q1', answer: { choice: 'B' } },
      { participant_id: 'p1', block_id: 'q2', answer: { choice: 'B' } },
      { participant_id: 'p2', block_id: 'q2', answer: { choice: 'A' } },
    ],
    response_evaluations: [],
  };
  return {
    from(table) {
      const result = { data: table === 'sessions' ? tables.sessions[0] : tables[table], error: null };
      const builder = {
        select: () => builder,
        eq: () => builder,
        order: () => builder,
        maybeSingle: async () => result,
        then: (resolve, reject) => Promise.resolve(result).then(resolve, reject),
      };
      return builder;
    },
  };
}

async function board(overrides) {
  const session = {
    status: 'live',
    active_block_id: 'q2',
    lesson_snapshot: lesson,
    realtime_key: 'key',
    scoreboard_revealed: true,
    revealed_block_ids: [],
    ...overrides,
  };
  const result = await loadTeacherScoreboard('session', 'teacher', fakeClient(session));
  assert.ok(result.data, `scoreboard failed: ${result.error}`);
  const score = Object.fromEntries(result.data.rows.map((row) => [row.participantId, row.score]));
  return { score, max: result.data.availableMaxPoints };
}

// Active quiz q2, results not revealed: only q1 counts.
assert.deepEqual(await board({}), { score: { p1: 2, p2: 0 }, max: 2 }, 'the unrevealed active quiz must not count');
// Results of q2 revealed: q2 counts.
assert.deepEqual(await board({ revealed_block_ids: ['q2'] }), { score: { p1: 4, p2: 0 }, max: 4 }, 'a revealed active quiz counts');
// Teacher moved on without revealing q2: answers are locked, q2 counts.
assert.deepEqual(await board({ active_block_id: 'q3', revealed_block_ids: [] }), { score: { p1: 4, p2: 0 }, max: 4 }, 'earlier quizzes count once the teacher moves on');
// Ended lesson: every scored block counts.
assert.deepEqual(await board({ status: 'ended' }), { score: { p1: 4, p2: 0 }, max: 6 }, 'an ended lesson counts every quiz');

const migration = read('neon/migrations/0025_scoreboard_skips_unrevealed_active_quiz.sql');
for (const needle of [
  'create or replace function public.get_student_public_scoreboard(',
  's.scoreboard_revealed, s.revealed_block_ids',
  "v_status = 'live'\n      and b.block_type = 'quiz'\n      and coalesce(b.block_id = v_active_block_id, false)\n      and not coalesce(b.block_id = any(v_revealed_block_ids), false)",
  'else case when team_evaluation.teacher_confirmed then coalesce(team_evaluation.teacher_score, 0) else 0 end',
  'else case when participant_evaluation.teacher_confirmed then coalesce(participant_evaluation.teacher_score, 0) else 0 end',
  'security definer',
  'set search_path = public, pg_temp',
]) {
  assert.ok(migration.includes(needle), `migration 0025 is missing: ${needle.slice(0, 80)}`);
}
assert.ok(!migration.includes('ai_score'), 'migration 0025 must not count AI proposals (LEGAL-021)');

console.log('Scoreboard active-quiz checks passed.');
