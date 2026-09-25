import assert from 'node:assert/strict';
import fs from 'node:fs';
import pdfMake from 'pdfmake/build/pdfmake.js';
import pdfFonts from 'pdfmake/build/vfs_fonts.js';

function source(path) {
  return fs.readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
}
function fail(message) {
  throw new Error(`Model answer privacy regression: ${message}`);
}
function requireText(text, needle, message) {
  if (!text.includes(needle)) fail(message);
}
function forbidPattern(text, pattern, message) {
  if (pattern.test(text)) fail(message);
}

const TEACHER_ONLY = ['modelAnswer', 'teacherNote', 'correctAnswer', 'gradingRubric'];

// 1. Live lesson: the model answer never leaves the server while the lesson runs.
{
  const liveControl = source('lib/live-control-server.ts');
  const snapshot = liveControl.match(/export function publicLessonSnapshot[\s\S]*?\n}\n/)?.[0] ?? '';
  if (!snapshot) fail('publicLessonSnapshot is missing.');
  for (const field of TEACHER_ONLY) {
    requireText(snapshot, `${field}: _${field}`, `publicLessonSnapshot must strip ${field} before the snapshot reaches the Live Control Worker.`);
  }
  forbidPattern(snapshot, /answerScaffold: _/, 'publicLessonSnapshot must keep answerScaffold for the student fallback path.');

  const live = source('lib/live.ts');
  const publicSchema = live.match(/export const PublicLessonBlockSchema = LessonBlockSchema\.omit\(\{([\s\S]*?)\}\);/)?.[1] ?? '';
  for (const field of TEACHER_ONLY) {
    requireText(publicSchema, `${field}: true`, `PublicLessonBlockSchema must omit ${field}.`);
  }

  for (const path of ['lib/neon/student-session-server.ts', 'lib/student-session-server.ts']) {
    const text = source(path);
    const keys = text.match(/function publicBlock[\s\S]*?for \(const k(?:ey)? of \[([^\]]+)\]/)?.[1];
    if (!keys) fail(`${path} lost its publicBlock whitelist.`);
    const list = [...keys.matchAll(/['"]([A-Za-z]+)['"]/g)].map((match) => match[1]);
    for (const field of TEACHER_ONLY) {
      if (list.includes(field)) fail(`${path} publicBlock must not send ${field} to students.`);
    }
    if (!list.includes('answerScaffold')) {
      fail(`${path} publicBlock must send answerScaffold to students.`);
    }
  }

  const presenter = source('app/api/sessions/[id]/presenter/route.ts');
  const presenterBlock = presenter.match(/function toPresenterBlock[\s\S]*?\n}\n/)?.[0] ?? '';
  if (!presenterBlock) fail('presenter block whitelist is missing.');
  for (const field of TEACHER_ONLY) {
    forbidPattern(presenterBlock, new RegExp(`\\b${field}\\b`), `projector view must not show ${field}.`);
  }
}

// 2. Generation keeps both optional fields and old lessons stay valid.
{
  const schema = source('lib/schema.ts');
  requireText(schema, 'modelAnswer: z.string().max(MODEL_ANSWER_MAX_LENGTH).optional()', 'lesson schema must accept an optional model answer.');
  requireText(schema, 'answerScaffold: z.string().max(ANSWER_SCAFFOLD_MAX_LENGTH).optional()', 'lesson schema must accept an optional answer scaffold.');
  const ai = source('lib/ai.ts');
  requireText(ai, 'modelAnswer: z.string().nullable(),', 'AI output schema must include modelAnswer.');
  requireText(ai, 'answerScaffold: z.string().nullable(),', 'AI output schema must include answerScaffold.');
  requireText(ai, 'modelAnswer: optionalBlockText(block.modelAnswer, block.type, MODEL_ANSWER_BLOCK_TYPES, MODEL_ANSWER_MAX_LENGTH)', 'AI mapping must keep modelAnswer only on supported block types.');
  requireText(ai, 'answerScaffold: optionalBlockText(block.answerScaffold, block.type, ANSWER_SCAFFOLD_BLOCK_TYPES, ANSWER_SCAFFOLD_MAX_LENGTH)', 'AI mapping must keep answerScaffold only on supported block types.');
  requireText(ai, 'nesmí citovat ani parafrázovat interní gradingRubric', 'scaffold prompt must forbid quoting the internal rubric.');
  requireText(ai, 'Při úpravě existující lekce modelAnswer a answerScaffold zachovej', 'revision prompt must preserve or fill model answers and scaffolds.');
}

// 3. Grading: the scaffold is context, the model answer is never sent.
{
  for (const path of ['lib/grading.ts', 'app/api/sessions/[id]/evaluations/[evaluationId]/grade/route.ts', 'lib/neon/grading-outbox-worker.ts']) {
    forbidPattern(source(path), /modelAnswer/, `${path} must not pass the model answer into AI grading (the rubric stays the only standard).`);
  }
  for (const path of ['app/api/sessions/[id]/evaluations/[evaluationId]/grade/route.ts', 'lib/neon/grading-outbox-worker.ts']) {
    requireText(source(path), 'answerScaffold: block.answerScaffold,', `${path} must pass the scaffold to grading as context.`);
  }
  requireText(source('lib/grading.ts'), 'Text osnovy není práce studenta a sám o sobě nezískává body.', 'grading prompt must say the scaffold earns no points.');
}

// 4. Unchanged scaffold cannot be submitted (client and server).
{
  const { isUnchangedScaffold } = await import('../lib/answer-scaffold.ts');
  const scaffold = 'Myslím si, že…\nProtože…';
  assert.equal(isUnchangedScaffold('  Myslím si, že…\r\n\r\nProtože…  ', scaffold), true);
  assert.equal(isUnchangedScaffold('Myslím si, že…   Protože…', scaffold), true);
  assert.equal(isUnchangedScaffold('Myslím si, že voda je důležitá.\nProtože…', scaffold), false);
  assert.equal(isUnchangedScaffold('Cokoli', undefined), false);
  assert.equal(isUnchangedScaffold('', '   '), false);
  for (const path of ['lib/neon/student-session-server.ts', 'lib/student-session-server.ts']) {
    requireText(source(path), 'isUnchangedScaffold(normalized.answer.text, block.answerScaffold)', `${path} must reject an unchanged scaffold on submit.`);
  }
  for (const path of ['lib/neon/team-edit-server.ts', 'lib/team-edit-server.ts']) {
    requireText(source(path), 'isUnchangedScaffold(text, findBlock(context.session.lesson_snapshot, context.blockId)?.answerScaffold)', `${path} must reject an unchanged team scaffold on submit.`);
  }
  for (const path of ['components/StudentResponseInput.tsx', 'components/TeamTaskResponseInput.tsx']) {
    const text = source(path);
    requireText(text, "ui('Doplň osnovu vlastními slovy.', 'Complete the outline in your own words.')", `${path} must explain why an unchanged outline is not submitted.`);
    requireText(text, "ui('Může ti pomoct tato osnova', 'This outline may help you')", `${path} must show the outline above the answer field.`);
    requireText(text, 'Boolean(text.trim())', `${path} must enable the insert button only for an empty field.`);
    forbidPattern(text, /useState\(\s*(?:block\.)?answerScaffold/, `${path} must never prefill the answer field with the outline.`);
  }
  requireText(source('components/TeamTaskResponseInput.tsx'), 'disabled={lockedByOther || draftConflict || submitting || Boolean(text.trim())}', 'team outline button must respect the edit lock and draft conflicts.');
}

// 5. "My solutions" PDF: only after the lesson ended, only student-visible data.
{
  const route = source('app/api/student/sessions/[id]/solutions-pdf/route.ts');
  requireText(route, 'cookieStore.get(participantCookieName(id))', 'solutions PDF must authenticate the participant cookie.');
  requireText(route, "'Cache-Control': 'private, no-store'", 'solutions PDF must not be cached.');
  forbidPattern(route, /\.(?:put|upload)\(|writeFile|insert into/i, 'solutions PDF must not be stored anywhere.');
  const server = source('lib/neon/student-session-server.ts');
  const reader = server.match(/export async function readNeonStudentSolutions[\s\S]*?\n}\n/)?.[0] ?? '';
  if (!reader) fail('readNeonStudentSolutions is missing.');
  requireText(reader, "if (session.status !== 'ended') return { response: json({ error: 'Řešení je k dispozici až po skončení hodiny.' }, 409) };", 'solutions PDF must be refused before the teacher ends the lesson.');
  requireText(reader, 'readConfirmedEvaluations(sessionId, participant, allBlocks, null)', 'solutions PDF must reuse the teacher-confirmed evaluation query from "My evaluations".');
  forbidPattern(reader, /ai_use|rubric|teacher_note/, 'solutions PDF reader must not select integrity signals, rubrics or internal teacher notes.');
  requireText(source('components/StudentSession.tsx'), "ui('Stáhnout moje řešení (PDF)', 'Download my solutions (PDF)')", 'ended student screen must offer the solutions PDF.');

  const { buildStudentSolutionItems, createStudentSolutionsPdfDefinition, studentSolutionsFilename } = await import('../lib/student-solutions-pdf.ts');
  const secret = (name) => ({ teacherNote: `TEACHER_NOTE_${name}`, gradingRubric: [{ id: 'c1', title: `RUBRIC_${name}`, description: `RUBRIC_DESC_${name}`, maxPoints: 2 }] });
  const blocks = [
    { id: 'intro', type: 'intro', title: 'Úvod', instructions: 'INTRO_SKIPPED', ...secret('intro') },
    { id: 'poll1', type: 'poll', title: 'Anketa bez hlasu', instructions: 'POLL_UNANSWERED', options: ['A', 'B'] },
    { id: 'poll2', type: 'poll', title: 'Anketa', instructions: 'Hlasuj', options: ['A', 'B'] },
    { id: 'quiz', type: 'quiz', title: 'Kvíz', instructions: 'Kolik je 2+2?', options: ['3', '4'], correctAnswer: '4', ...secret('quiz'), modelAnswer: 'QUIZ_MODEL_IGNORED' },
    { id: 'rank', type: 'ranking', title: 'Řazení', instructions: 'Seřaď', items: ['x', 'y'], modelAnswer: 'MODEL_RANKING' },
    { id: 'open', type: 'open_text', title: 'Otevřená', instructions: 'Vysvětli', points: 2, modelAnswer: 'MODEL_OPEN', answerScaffold: 'SCAFFOLD_OPEN', ...secret('open') },
    { id: 'legacy', type: 'exit_ticket', title: 'Stará lekce', instructions: 'Bez nových polí' },
    { id: 'team', type: 'team_task', title: 'Tým', instructions: 'Společně', points: 2, modelAnswer: 'MODEL_TEAM', ...secret('team') },
    { id: 'reveal', type: 'reveal', title: 'Pointa', instructions: 'REVEAL_SKIPPED', revealText: 'REVEAL_TEXT' },
    { id: 'timer', type: 'timer', title: 'Čas', instructions: 'TIMER_SKIPPED' },
  ];
  const responses = [
    { blockId: 'poll2', answer: { choice: 'B' }, submittedAnswer: null, submittedAt: null },
    { blockId: 'quiz', answer: { choice: '3' }, submittedAnswer: null, submittedAt: null },
    { blockId: 'rank', answer: { ranking: ['y', 'x'], text: 'DRAFT_RANK' }, submittedAnswer: { ranking: ['y', 'x'], text: 'SUBMITTED_RANK' }, submittedAt: '2026-09-24T08:00:00Z' },
    { blockId: 'open', answer: { text: 'NEWER_DRAFT' }, submittedAnswer: { text: 'MY_SUBMITTED_OPEN' }, submittedAt: '2026-09-24T08:01:00Z' },
    { blockId: 'legacy', answer: { text: 'ONLY_DRAFT' }, submittedAnswer: null, submittedAt: null },
  ];
  const teamResponses = [{ blockId: 'team', answer: { text: 'TEAM_ANSWER' }, submittedAnswer: { text: 'TEAM_ANSWER' }, submittedAt: '2026-09-24T08:02:00Z' }];
  const evaluations = [
    { blockId: 'open', blockTitle: 'Otevřená', blockType: 'open_text', team: false, score: 2, maxPoints: 2, source: 'ai', summary: 'AI_SUMMARY_CONFIRMED', teacherNote: null, outdated: false, aiUseSuspicion: 'high', aiUseSignals: ['AI_SIGNAL_SECRET'], internalTeacherNote: 'INTERNAL_NOTE_SECRET' },
    { blockId: 'team', blockTitle: 'Tým', blockType: 'team_task', team: true, score: 1, maxPoints: 2, source: 'teacher', summary: null, teacherNote: 'NOTE_FOR_STUDENT', outdated: true },
  ];
  const items = buildStudentSolutionItems({ blocks, responses, teamResponses, evaluations });
  assert.deepEqual(items.map((item) => item.blockId), ['poll2', 'quiz', 'rank', 'open', 'legacy', 'team'], 'PDF must skip intro/reveal/timer and unanswered polls, in lesson order.');
  const quiz = items.find((item) => item.blockId === 'quiz');
  assert.equal(quiz.correctAnswer, '4');
  assert.equal(quiz.isCorrect, false);
  assert.equal(quiz.modelAnswer, null);
  assert.equal(items.find((item) => item.blockId === 'poll2').showModelAnswer, false, 'poll has no key or model answer.');
  assert.equal(items.find((item) => item.blockId === 'open').draft, false);
  assert.equal(items.find((item) => item.blockId === 'legacy').draft, true);
  assert.equal(items.find((item) => item.blockId === 'legacy').modelAnswer, null, 'old lesson without new fields must still work.');

  for (const english of [false, true]) {
    const definition = createStudentSolutionsPdfDefinition({
      lessonTitle: 'Voda v krajině', lessonLanguage: 'cs', studentName: 'Eva', teamName: 'Sovy', sessionDate: '24. září 2026', english, items,
    });
    const json = JSON.stringify(definition);
    for (const needle of ['MODEL_RANKING', 'MODEL_OPEN', 'MODEL_TEAM', 'MY_SUBMITTED_OPEN', 'SUBMITTED_RANK', 'ONLY_DRAFT', 'TEAM_ANSWER', 'AI_SUMMARY_CONFIRMED', 'NOTE_FOR_STUDENT', 'Eva', 'Sovy', '24. září 2026']) {
      if (!json.includes(needle)) fail(`solutions PDF is missing ${needle}.`);
    }
    for (const needle of ['TEACHER_NOTE_', 'RUBRIC_', 'AI_SIGNAL_SECRET', 'INTERNAL_NOTE_SECRET', 'SCAFFOLD_OPEN', 'QUIZ_MODEL_IGNORED', 'INTRO_SKIPPED', 'REVEAL_', 'TIMER_SKIPPED', 'POLL_UNANSWERED', 'NEWER_DRAFT', 'DRAFT_RANK', '"high"']) {
      if (json.includes(needle)) fail(`solutions PDF must not contain ${needle}.`);
    }
    requireText(json, english ? 'The model answers were generated by AI and may contain errors.' : 'Vzorové odpovědi vytvořila AI a mohou obsahovat chyby.', 'solutions PDF must carry the AI-generated content notice (AI Act Art. 50(2)).');
    requireText(json, english ? 'No model answer is available.' : 'Vzorová odpověď není k dispozici.', 'blocks without a model answer must say so.');
    requireText(json, english ? 'TEAM ANSWER (SOVY)' : 'ODPOVĚĎ TÝMU SOVY', 'team answer heading must name the team.');
    requireText(json, english ? 'MODEL ANSWER (WRITTEN BY AI)' : 'VZOROVÁ ODPOVĚĎ (VYTVOŘILA AI)', 'model answers must be labelled as AI-written.');

    pdfMake.addVirtualFileSystem(pdfFonts);
    const bytes = Buffer.from(await pdfMake.createPdf(definition).getBuffer());
    if (bytes.length < 8000 || bytes.subarray(0, 5).toString('ascii') !== '%PDF-') fail('solutions PDF does not render.');
  }

  const empty = createStudentSolutionsPdfDefinition({ lessonTitle: 'Prázdná', lessonLanguage: null, studentName: 'Ada', teamName: null, sessionDate: '—', english: false, items: [] });
  requireText(JSON.stringify(empty), 'V této hodině nebyly žádné úkoly s odpovědí.', 'a lesson without answerable tasks must still produce a PDF.');
  assert.equal(studentSolutionsFilename('Voda v krajině: 7.B', false), 'syllonaut-reseni-voda-v-krajine-7-b.pdf');
  assert.equal(studentSolutionsFilename('!!!', true), 'syllonaut-solutions.pdf');
}

console.log('model answer privacy verification passed');
