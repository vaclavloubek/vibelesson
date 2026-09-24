import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';

function read(relativePath) {
  return fs.readFileSync(relativePath, 'utf8');
}

function requireText(content, needle, label) {
  if (!content.includes(needle)) throw new Error(`Manual block edit regression: ${label}`);
}

function forbidPattern(content, pattern, label) {
  if (pattern.test(content)) throw new Error(`Manual block edit regression: ${label}`);
}

// 1. Behaviour of the pure edit logic (no runtime imports, so it runs from a data URL).
const logicSource = read('lib/manual-block-edit.ts');
forbidPattern(logicSource, /^import (?!type )/m, 'lib/manual-block-edit.ts must stay free of runtime imports (no AI, no DB).');
const compiled = ts.transpileModule(logicSource, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 } }).outputText;
const { applyManualBlockEdit } = await import(`data:text/javascript;base64,${Buffer.from(compiled).toString('base64')}`);

const lesson = {
  title: 'Test',
  audience: '8. třída',
  totalMinutes: 30,
  groupSize: '3–4',
  language: 'cs',
  learningObjectives: ['a', 'b'],
  blocks: [
    { id: 'b1', type: 'intro', title: 'Úvod', durationMinutes: 5, instructions: 'Start', revealText: 'Pointa', teacherNote: 'Pozor' },
    { id: 'b2', type: 'quiz', title: 'Kvíz', durationMinutes: 10, instructions: 'Vyber', options: ['Praha', 'Brno', 'Ostrava'], correctAnswer: 'Brno', points: 3 },
    { id: 'b3', type: 'ranking', title: 'Pořadí', durationMinutes: 15, instructions: 'Seřaď', items: ['x', 'y'] },
  ],
};
const snapshot = JSON.stringify(lesson);
const block = (result, id) => result.lesson.blocks.find((item) => item.id === id);

// correctAnswer follows the renamed option at the same index; points stay.
let result = applyManualBlockEdit(lesson, 'b2', { options: ['Praha', ' Brno-město ', 'Ostrava'] });
assert.equal(result.ok, true);
assert.deepEqual(block(result, 'b2').options, ['Praha', 'Brno-město', 'Ostrava']);
assert.equal(block(result, 'b2').correctAnswer, 'Brno-město');
assert.equal(block(result, 'b2').points, 3);

// A correctAnswer that matched no option stays unchanged.
const orphan = { ...lesson, blocks: lesson.blocks.map((item) => item.id === 'b2' ? { ...item, correctAnswer: 'Plzeň' } : item) };
result = applyManualBlockEdit(orphan, 'b2', { options: ['A', 'B', 'C'] });
assert.equal(result.ok, true);
assert.equal(block(result, 'b2').correctAnswer, 'Plzeň');

// Options: same count, non-empty, unique case-insensitively after trim.
assert.equal(applyManualBlockEdit(lesson, 'b2', { options: ['A', 'B'] }).status, 400);
assert.equal(applyManualBlockEdit(lesson, 'b2', { options: ['A', ' ', 'C'] }).status, 400);
assert.equal(applyManualBlockEdit(lesson, 'b2', { options: ['Brno', ' brno', 'C'] }).status, 400);
assert.equal(applyManualBlockEdit(lesson, 'b1', { options: ['A'] }).status, 400);

// Items: same count, non-empty.
assert.equal(applyManualBlockEdit(lesson, 'b3', { items: ['x', 'y', 'z'] }).status, 400);
assert.equal(applyManualBlockEdit(lesson, 'b3', { items: ['x', ''] }).status, 400);
assert.deepEqual(block(applyManualBlockEdit(lesson, 'b3', { items: ['první', 'druhá'] }), 'b3').items, ['první', 'druhá']);

// Duration 1–60 and totalMinutes recomputed as the sum of all blocks within 10–360.
result = applyManualBlockEdit(lesson, 'b3', { durationMinutes: 40 });
assert.equal(result.ok, true);
assert.equal(result.lesson.totalMinutes, 55);
assert.equal(applyManualBlockEdit(lesson, 'b3', { durationMinutes: 61 }).status, 400);
assert.equal(applyManualBlockEdit(lesson, 'b3', { durationMinutes: 0 }).status, 400);
const short = applyManualBlockEdit({ ...lesson, blocks: lesson.blocks.map((item) => ({ ...item, durationMinutes: 3 })) }, 'b3', { durationMinutes: 1 });
assert.equal(short.status, 400);
assert.match(short.error.cs, /10 a 360/);
assert.match(short.error.en, /10 and 360/);

// Texts: empty title/instructions rejected; revealText only where it exists; empty removes.
assert.equal(applyManualBlockEdit(lesson, 'b1', { title: '  ' }).status, 400);
assert.equal(applyManualBlockEdit(lesson, 'b1', { instructions: '' }).status, 400);
assert.equal(block(applyManualBlockEdit(lesson, 'b1', { revealText: '' }), 'b1').revealText, undefined);
assert.equal(applyManualBlockEdit(lesson, 'b2', { revealText: 'Nová pointa' }).status, 400);
assert.equal(block(applyManualBlockEdit(lesson, 'b2', { teacherNote: 'Doplněná poznámka' }), 'b2').teacherNote, 'Doplněná poznámka');
assert.equal(block(applyManualBlockEdit(lesson, 'b1', { teacherNote: ' ' }), 'b1').teacherNote, undefined);

// Fields outside the whitelist are ignored even if they reach the logic.
result = applyManualBlockEdit(lesson, 'b2', { title: 'Nový kvíz', correctAnswer: 'Praha', points: 20, type: 'poll', id: 'x', language: 'en' });
assert.equal(result.ok, true);
assert.equal(block(result, 'b2').correctAnswer, 'Brno');
assert.equal(block(result, 'b2').points, 3);
assert.equal(block(result, 'b2').type, 'quiz');
assert.equal(result.lesson.language, 'cs');
assert.equal(applyManualBlockEdit(lesson, 'missing', { title: 'X' }).status, 404);
assert.equal(JSON.stringify(lesson), snapshot, 'the stored lesson object must not be mutated');

// 2. Endpoint: strict whitelist, same gates as PUT, no AI and no AI quota.
const route = read('app/api/lessons/[id]/blocks/[blockId]/route.ts');
const putRoute = read('app/api/lessons/[id]/route.ts');
const schemaMatch = route.match(/const ManualBlockEditSchema = z\.object\(\{([\s\S]*?)\}\)\.strict\(\);/);
if (!schemaMatch) throw new Error('Manual block edit regression: the request schema must be a strict z.object whitelist.');
const keys = [...schemaMatch[1].matchAll(/^\s*(\w+):/gm)].map((match) => match[1]).sort();
assert.deepEqual(keys, ['durationMinutes', 'instructions', 'items', 'options', 'revealText', 'teacherNote', 'title']);

for (const [needle, label] of [
  ['getAuthenticatedUserId()', 'sign-in gate'],
  ['requireTrustedDeviceForPaidAccess(userId)', 'trusted-device gate'],
  ['getLessonOrganizationOriginAccess(userId, lessonId)', 'school licence lock'],
  ["code: 'organization_origin_access_required'", 'school licence lock code'],
  ["{ status: 401 }", 'unauthenticated response'],
]) {
  requireText(putRoute, needle, `PUT no longer has the ${label}; re-check the manual edit gates.`);
  requireText(route, needle, `manual edit endpoint must keep the same ${label} as PUT.`);
}
assert.ok(route.indexOf('trustedDeviceLockResponse(userId)') < route.indexOf('schoolLicenseLockResponse(userId, id)'), 'device gate runs before the licence lock');
assert.ok(route.indexOf('schoolLicenseLockResponse(userId, id)') < route.indexOf('readLessonContentForWrite('), 'licence lock runs before the lesson is read');
requireText(route, 'LessonSchema.parse(await readLessonContentForWrite(supabase, userId, id))', 'endpoint reads the stored lesson server-side');
requireText(route, 'const lesson = LessonSchema.parse(result.lesson);', 'endpoint validates the new lesson with LessonSchema');
requireText(route, 'await writeLessonContent(supabase, userId, id, lesson);', 'endpoint saves through writeLessonContent');

for (const [pattern, label] of [
  [/@\/lib\/ai['"]/, 'must not import the AI module'],
  [/reserve_\w+/, 'must not reserve any quota'],
  [/finish_generation_request_server/, 'must not record an AI request'],
  [/createPrivilegedRpcClient/, 'must not use the privileged quota RPC client'],
  [/ai-quota|revision_operation|free_lesson|lesson_live_usage/, 'must not check AI quota or Free live use'],
]) {
  forbidPattern(route, pattern, `manual edit endpoint ${label}.`);
}

// 3. Client: AI edit stays the default, undo covers both kinds of change.
const workspace = read('components/LessonWorkspace.tsx');
requireText(workspace, "useState<'ai' | 'manual'>('ai')", 'AI edit stays the default tab');
requireText(workspace, 'data-tour="lesson-edit-block-editor"', 'block editor keeps the guide target');
requireText(workspace, '/api/lessons/${lessonId}/blocks/${encodeURIComponent(selectedBlock.id)}', 'manual form saves through the narrow endpoint');
requireText(workspace, "method: 'PATCH'", 'manual form uses PATCH');
requireText(workspace, "ui('Vrátit poslední změnu', 'Undo last change')", 'undo button covers AI and manual changes');
forbidPattern(workspace, /Vrátit poslední AI změnu/, 'undo button must not be AI-only.');
requireText(read('components/ManualBlockEditForm.tsx'), "ui('Správnou odpověď a body mění jen úprava s AI.', 'Only an AI edit changes the correct answer and points.')", 'quiz form explains that the correct answer and points need an AI edit');

console.log('Manual block edit whitelist, correctAnswer remap, totalMinutes, gates and no-AI-quota checks passed.');
