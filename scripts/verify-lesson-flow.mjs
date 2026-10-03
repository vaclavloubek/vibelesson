import { readFile } from 'node:fs/promises';

const ai = await readFile(new URL('../lib/ai.ts', import.meta.url), 'utf8');

function fail(message) {
  throw new Error(`Lesson-flow regression: ${message}`);
}

const flowRules = ai.match(/const lessonFlowRules = `([\s\S]*?)\n`;/)?.[1] ?? '';
if (!flowRules) fail('lessonFlowRules is missing.');
for (const [snippet, message] of [
  ['Nejnáročnější práci (nové pojmy, nejtěžší analýza, nejdelší samostatné psaní) umísti do první poloviny až dvou třetin lekce', 'the hardest work must be planned before students tire.'],
  ['Nejdelší blok lekce (přestávky se nepočítají) nesmí být poslední ani předposlední aktivitou', 'the longest block must not close the lesson.'],
  ['V poslední čtvrtině lekce nezaváděj nové pojmy ani nový obsah', 'the last quarter must not introduce new content.'],
  ['Lekce do 45 minut včetně nemá žádnou přestávku.', 'lessons up to 45 minutes must have no break.'],
  ['Lekce od 46 do 90 minut má právě jednu přestávku', 'lessons up to 90 minutes must have one break.'],
  ['Lekce delší než 90 minut má právě dvě přestávky', 'longer lessons must have two breaks.'],
  ['Přestávku vytvoř jako samostatný blok typu timer', 'breaks must be timer blocks.'],
  ['KONTROLA PŘED VRÁCENÍM VÝSLEDKU', 'the pre-return self-check is missing.'],
  ['Lekce má mít nejvýše 14 bloků včetně přestávek', 'the prompt must keep a safety margin below the 16-block lesson limit.'],
]) {
  if (!flowRules.includes(snippet)) fail(message);
}
if (!/const BREAK_MINUTES = 10;/.test(ai)) fail('breaks must last 10 minutes.');
if (!/function plannedBreakCount\(totalMinutes: number\) \{\s*if \(totalMinutes <= 45\) return 0;\s*return totalMinutes <= 90 \? 1 : 2;\s*\}/.test(ai)) {
  fail('break count thresholds must stay 0 (<= 45 min), 1 (<= 90 min), 2 (longer).');
}

const createStart = ai.indexOf('export async function createLesson');
const reviseStart = ai.indexOf('export async function reviseLesson');
const reviseBlockStart = ai.indexOf('export async function reviseBlock');
const createSection = ai.slice(createStart, reviseStart);
const reviseSection = ai.slice(reviseStart, reviseBlockStart);
const reviseBlockSection = ai.slice(reviseBlockStart);

if (!createSection.includes('system: `${baseRules}\\n\\n${lessonFlowRules}\\n\\n${collaborationRules}`')) fail('lesson generation must send lessonFlowRules.');
if (!createSection.includes('Přestávky: ${plannedBreaksLine(input.duration)}')) fail('lesson generation must state the planned breaks for the requested length.');
if (!createSection.includes('ne jako osnovy pro učitele.${materialInstruction}`')) fail('teacher materials must be the last part of the generation prompt.');
if (!createSection.includes('<podklady_ucitele>\\n${materials.replace(/<\\/?podklady_ucitele>/gi, \'\')}\\n</podklady_ucitele>')) fail('teacher materials must be delimited and unable to close the delimiter themselves.');
if ((reviseSection.match(/\$\{lessonFlowRules\}\\n\\n\$\{lessonFlowRevisionRules\}/g) ?? []).length !== 2) fail('whole-lesson revision must send lessonFlowRules with the revision caveat in both language variants.');
if (reviseBlockSection.includes('${lessonFlowRules}')) fail('block revision must not apply whole-lesson flow rules.');

console.log('Lesson-flow source checks passed.');
