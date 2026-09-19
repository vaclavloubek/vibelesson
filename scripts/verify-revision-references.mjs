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

console.log('Revision visible-block reference checks passed.');
