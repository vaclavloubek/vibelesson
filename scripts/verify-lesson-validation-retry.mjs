// A paid AI draft that fails LessonSchema (e.g. more blocks than the schema
// allows) gets exactly one corrective retry in createLesson and reviseLesson.
//
// Runs the real lib/ai.ts (Node type stripping) with a fake `ai` module that
// replays queued drafts. No network, no AI cost.
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { registerHooks } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';

const repoRoot = fileURLToPath(new URL('../', import.meta.url));
const stub = (source) => ({ url: `data:text/javascript,${encodeURIComponent(source)}`, shortCircuit: true });

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === 'ai') return stub(`
      export const Output = { object: () => ({}) };
      export async function generateText(request) {
        globalThis.__aiCalls.push(request);
        const next = globalThis.__aiDrafts.shift();
        if (!next) throw new Error('unexpected AI call');
        return { output: next, providerMetadata: { gateway: { cost: '0.1' } } };
      }
    `);
    if (context.parentURL?.startsWith('file:') && !context.parentURL.includes('/node_modules/')) {
      const base = specifier.startsWith('@/')
        ? `${repoRoot}${specifier.slice(2)}`
        : specifier.startsWith('.') ? fileURLToPath(new URL(specifier, context.parentURL)) : null;
      const file = base && ['', '.ts', '.tsx', '/index.ts'].map((suffix) => `${base}${suffix}`).find((path) => path.endsWith('.ts') && existsSync(path));
      if (file) return { url: pathToFileURL(file).href, shortCircuit: true };
    }
    return nextResolve(specifier, context);
  },
});

const { createLesson, reviseLesson } = await import('../lib/ai.ts');
const { demoLesson } = await import('../lib/demo.ts');

function aiBlock(block, index) {
  return {
    id: `b${index + 1}`,
    type: block.type,
    title: block.title,
    durationMinutes: block.durationMinutes,
    instructions: block.instructions,
    options: block.options ?? null,
    items: block.items ?? null,
    dataTable: null,
    correctAnswer: block.correctAnswer ?? null,
    revealText: block.revealText ?? null,
    teacherNote: block.teacherNote ?? null,
    points: null,
    gradingRubric: null,
    modelAnswer: null,
    answerScaffold: null,
  };
}

function draft(blockCount) {
  const blocks = Array.from({ length: blockCount }, (_, index) => aiBlock(demoLesson.blocks[index % demoLesson.blocks.length], index));
  return {
    title: demoLesson.title,
    subtitle: null,
    subject: 'Mediální výchova',
    audience: demoLesson.audience,
    totalMinutes: blocks.reduce((sum, block) => sum + block.durationMinutes, 0),
    groupSize: demoLesson.groupSize,
    language: 'cs',
    learningObjectives: demoLesson.learningObjectives,
    blocks,
  };
}

function reset(...drafts) {
  globalThis.__aiCalls = [];
  globalThis.__aiDrafts = drafts;
}

const realWarn = console.warn;
console.warn = () => {};

const input = {
  prompt: 'Mediální gramotnost',
  audience: '1. ročník VŠ',
  duration: 180,
  groupSize: '3–4',
  collaborationMode: 'teams',
  tone: '',
  lessonLanguage: 'cs',
  uiLocale: 'cs',
};

// Valid first draft: one AI call, no retry guidance.
reset(draft(9));
let result = await createLesson(input);
assert.equal(globalThis.__aiCalls.length, 1, 'a valid draft needs one AI call');
assert.equal(result.lesson.blocks.length, 9);
assert.equal(result.costUsd, 0.1);

// Too many blocks, then a valid draft: one corrective retry, costs combined.
reset(draft(20), draft(12));
result = await createLesson(input);
assert.equal(globalThis.__aiCalls.length, 2, 'an invalid draft gets exactly one retry');
assert.equal(result.lesson.blocks.length, 12);
assert.ok(Math.abs(result.costUsd - 0.2) < 1e-9, 'retry cost is added to the first draft cost');
const retryPrompt = globalThis.__aiCalls[1].prompt;
assert.ok(retryPrompt.includes('OPRAVA PŘEDCHOZÍHO NÁVRHU — ZÁVAZNÉ: předchozí návrh neprošel technickou kontrolou aplikace'), 'retry prompt explains the validation failure');
assert.ok(/aplikace povoluje nejvýše \d+\./.test(retryPrompt) && retryPrompt.includes('nejvýše 14 bloků včetně přestávek'), 'retry prompt names the block limit');
assert.ok(!globalThis.__aiCalls[0].prompt.includes('technickou kontrolou'), 'first prompt has no retry guidance');

// Invalid twice: fails after exactly two calls with the schema error.
reset(draft(20), draft(20));
await assert.rejects(() => createLesson(input), (error) => error?.name === 'ZodError');
assert.equal(globalThis.__aiCalls.length, 2, 'no third AI call after a second invalid draft');

// Whole-lesson revision: same single retry.
const baseLesson = (await (reset(draft(9)), createLesson(input))).lesson;
reset(draft(20), draft(10));
result = await reviseLesson(baseLesson, 'Přidej humor.');
assert.equal(globalThis.__aiCalls.length, 2, 'whole-lesson revision retries an invalid draft once');
assert.equal(result.lesson.blocks.length, 10);
assert.ok(globalThis.__aiCalls[1].prompt.includes('OPRAVA PŘEDCHOZÍ REVIZE — ZÁVAZNÉ: předchozí návrh neprošel technickou kontrolou aplikace'));

reset(draft(20), draft(20));
await assert.rejects(() => reviseLesson(baseLesson, 'Přidej humor.'), (error) => error?.name === 'ZodError');
assert.equal(globalThis.__aiCalls.length, 2, 'whole-lesson revision stops after one retry');

console.warn = realWarn;
console.log('Lesson validation retry checks passed.');
