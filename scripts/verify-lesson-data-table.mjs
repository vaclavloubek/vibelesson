import { readFile } from 'node:fs/promises';

const component = await readFile(new URL('../components/LessonDataTable.tsx', import.meta.url), 'utf8');
const styles = await readFile(new URL('../components/LessonDataTable.module.css', import.meta.url), 'utf8');

function requirePattern(source, pattern, message) {
  if (!pattern.test(source)) throw new Error(`Lesson data table regression: ${message}`);
}

// 0.9.171 production test: a 4-column table (min-width 520 px) widened a 375 px
// phone's layout viewport to 580 px, so the whole lesson was zoomed out.
requirePattern(styles, /\.root \{[^}]*container-type: inline-size;/, 'the table root must use inline-size containment so the table cannot widen the page.');
requirePattern(styles, /\.tableWrap \{[^}]*overflow-x: auto;/, 'a wide table must scroll inside its own wrapper.');
requirePattern(styles, /@container \(max-width: 559px\) \{[\s\S]*\.tableWrap \{\s*display: none;[\s\S]*\.cards \{\s*display: grid;/, 'narrow blocks must switch from the table to row cards.');
requirePattern(styles, /\.cards \{[^}]*display: none;/, 'wide blocks must hide the row cards so the data is exposed once.');
if (/\.(?:field|card)[^{]*\{[^}]*font-size: (?:1[0-4]|[0-9])px/.test(styles.replace(/\.field dt \{[^}]*\}/, ''))) {
  throw new Error('Lesson data table regression: card values must keep the reading font size, not a shrunk table size.');
}
requirePattern(component, /<dt>\{data\.columns\[cellIndex\]\}<\/dt>/, 'each card value must be labelled with its column name.');
requirePattern(component, /aria-labelledby=\{labelledBy\}[\s\S]*aria-labelledby=\{labelledBy\}/, 'table and cards must both be labelled by the caption.');

console.log('Lesson data table checks passed.');
