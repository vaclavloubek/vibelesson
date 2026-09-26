import { readFile } from 'node:fs/promises';

const ai = await readFile(new URL('../lib/ai.ts', import.meta.url), 'utf8');

function requireText(snippet, message) {
  if (!ai.includes(snippet)) throw new Error(`revision reference regression: ${message}`);
}

function requirePattern(pattern, message) {
  if (!pattern.test(ai)) throw new Error(`revision reference regression: ${message}`);
}

requireText('function resolveVisibleBlockReference', 'whole-lesson revisions must deterministically resolve visible block references.');
requireText('function visibleBlockNumberingContext', 'whole-lesson revisions must send visible block numbering context to AI.');
requireText('lesson.blocks[position - 1]', 'resolved ordinal references must map directly to the visible array position.');
requireText('Do číslování se počítají VŠECHNY viditelné bloky včetně intro, reveal, poll a timer.', 'all visible block types must count toward numbering.');
requireText('„druhý úkol / aktivita 2 / block 2“ = lesson.blocks[1]', 'the second task/activity/block must mean the second visible block.');
requireText('Tento výběr nepřehodnocuj podle typu aktivity ani podle toho, co považuješ za „skutečný úkol“.', 'AI must not reinterpret the resolved visible position semantically.');
requireText('(?:druh\\\\w*|second)', 'Czech and English second-ordinal references must be recognized.');
requirePattern(/nounFirst[\s\S]*numberedOrdinal[\s\S]*ordinalPatterns/, 'numeric and ordinal reference forms must all be supported.');
requireText('${visibleBlockNumberingContext(lesson, instruction)}', 'numbering context must be included in the whole-lesson revision prompt.');

// Chained activities: the rule lives in baseRules, which lesson generation and
// both AI revisions use as their system prompt. It must keep chaining welcome
// and only change how a block refers back to earlier activities.
const baseRules = ai.match(/const baseRules = `([\s\S]*?)\n`;/)?.[1] ?? '';
if (!baseRules) throw new Error('revision reference regression: baseRules is missing.');
const chainingStart = baseRules.indexOf('- Navazování mezi aktivitami');
const chainingEnd = baseRules.indexOf('- Při úpravě jedné aktivity:', chainingStart);
if (chainingStart < 0 || chainingEnd < 0) throw new Error('revision reference regression: baseRules must contain the chained-activities rule.');
const chainingRule = baseRules.slice(chainingStart, baseRules.indexOf('\n', chainingEnd));
for (const [snippet, message] of [
  ['je žádoucí všude, kde dává didaktický smysl', 'the rule must keep chaining activities welcome.'],
  ['„Předchozí aktivity“', 'the rule must tell AI that students look older activities up in "Předchozí aktivity".'],
  ['zopakuj v instructions nebo v dataTable stručně tu část, kterou student potřebuje', 'content of an earlier activity must be briefly repeated.'],
  ['obsah neopakuj (neznáš ho), ale uveď číslo a název té aktivity', "a student's own earlier answer must be referenced by number and title."],
  ['do teacherNote pokyn, ať ho učitel připomene', 'class-only results may ask the teacher to remind students.'],
  ['vždy odkazuj číslem i názvem', 'references must name both number and title.'],
  ['do kterého se počítají všechny bloky včetně intro, reveal, poll a timer', 'reference numbers must match the student counter (all blocks).'],
  ['Při úpravě celé lekce: pokud se změní název nebo pořadí bloku', 'whole-lesson revision must keep references in sync.'],
  ['Při úpravě jedné aktivity: odkazy v upravovaném bloku musí odpovídat aktuálním číslům a názvům', 'block revision must keep references current.'],
]) {
  if (!chainingRule.includes(snippet)) throw new Error(`revision reference regression: ${message}`);
}
if (/nenavazuj|nepropojuj|vyhn\w* se navazování|omez\w* navazování|nesmí navazovat|nenavazovat|bez návaznosti|samostatn\w+ bez vazby/i.test(chainingRule)) {
  throw new Error('revision reference regression: the chained-activities rule must not discourage or forbid chaining.');
}
for (const [name, start, end] of [
  ['lesson generation', 'export async function createLesson', 'export async function reviseLesson'],
  ['whole-lesson revision', 'export async function reviseLesson', 'export async function reviseBlock'],
  ['block revision', 'export async function reviseBlock', null],
]) {
  const from = ai.indexOf(start);
  const section = ai.slice(from, end ? ai.indexOf(end) : undefined);
  if (from < 0 || !/system: (?:languageLocked\s*\?\s*`\$\{baseRules\}[^`]*`\s*:\s*)?`\$\{baseRules\}/.test(section)) {
    throw new Error(`revision reference regression: ${name} must use baseRules as its system prompt.`);
  }
}

// Block revision must see the numbers and titles of every block to keep its
// references current.
{
  const section = ai.slice(ai.indexOf('export async function reviseBlock'));
  if (!section.includes("& { blockOutline: Array<Pick<LessonBlock, 'id' | 'type' | 'title'>> }")) throw new Error('revision reference regression: reviseBlock must receive the lesson block outline.');
  if (!section.includes('`${index + 1}. type=${item.type} | title=${JSON.stringify(item.title)}')) throw new Error('revision reference regression: the outline must number blocks from 1 and name them.');
  if (!section.includes('PŘEHLED AKTIVIT LEKCE (číslo = pořadí bloku v lekci, podle kterého se na aktivity odkazuje):\\n${outline}')) throw new Error('revision reference regression: the outline must be part of the block revision prompt.');
  const route = await readFile(new URL('../app/api/revise-block/route.ts', import.meta.url), 'utf8');
  if (!route.includes('blockOutline: sourceLesson.blocks.map(({ id, type, title }) => ({ id, type, title })),')) {
    throw new Error('revision reference regression: the block revision route must pass numbers and titles of all blocks from the authoritative lesson.');
  }
}

console.log('Revision visible-block reference checks passed.');
