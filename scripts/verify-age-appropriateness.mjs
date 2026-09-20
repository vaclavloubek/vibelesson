import { readFile } from 'node:fs/promises';

const ai = await readFile(new URL('../lib/ai.ts', import.meta.url), 'utf8');

function requirePattern(pattern, message) {
  if (!pattern.test(ai)) throw new Error(`Age-appropriateness regression: ${message}`);
}

requirePattern(/VĚKOVÁ A VÝVOJOVÁ PŘIMĚŘENOST JE ZÁVAZNÁ/, 'central developmental-fit rule is missing.');
requirePattern(/úroveň čtení a psaní[\s\S]*slovní zásobu[\s\S]*míru abstrakce[\s\S]*počet kroků/, 'the prompt no longer covers core developmental dimensions.');
requirePattern(/nejmladších žáků a začínajících čtenářů/, 'early-reader safeguard is missing.');
requirePattern(/nepoužívej infantilní jazyk/, 'older-learner safeguard is missing.');
requirePattern(/potichu zkontroluj každý blok proti cílové skupině/, 'pre-return block-level fit check is missing.');
requirePattern(/Cílová skupina: \$\{input\.audience\}/, 'generation prompt no longer passes the teacher audience explicitly.');
const createStart = ai.indexOf('export async function createLesson');
const reviseStart = ai.indexOf('export async function reviseLesson');
const reviseBlockStart = ai.indexOf('export async function reviseBlock');
if (createStart < 0 || reviseStart < 0 || reviseBlockStart < 0) {
  throw new Error('Age-appropriateness regression: AI authoring function boundaries are missing.');
}

const createSection = ai.slice(createStart, reviseStart);
const reviseSection = ai.slice(reviseStart, reviseBlockStart);
const reviseBlockSection = ai.slice(reviseBlockStart);

if (!createSection.includes('baseRules')) {
  throw new Error('Age-appropriateness regression: lesson generation must use the shared pedagogical rules even when additional system rules are applied.');
}
for (const [name, section] of [['whole-lesson revision', reviseSection], ['block revision', reviseBlockSection]]) {
  if (!section.includes('baseRules')) {
    throw new Error(`Age-appropriateness regression: ${name} must keep the shared pedagogical rules even when additional system rules are applied.`);
  }
}

console.log('Age-appropriateness source checks passed.');
