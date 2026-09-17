import type { Lesson, LessonBlock } from './schema';

export type AccessibilityAuthoringIssue = {
  blockId: string;
  blockTitle: string;
  code: 'missing-table-caption' | 'drag-only-instruction' | 'visual-only-cue';
  message: string;
};

const dragOnlyPattern = /\b(přetáhni|přetáhněte|přetahuj|přetahujte|drag(?:ni|ujte)?|táhni\s+(?:myší|prstem))\b/i;
const actionPattern = /\b(klikni|klikněte|vyber|vyberte|zvol|zvolte|označ|označte|stiskni|stiskněte)\b/i;
const visualCuePattern = /\b(červen(?:ý|á|é|ou|ého)|zelen(?:ý|á|é|ou|ého)|modr(?:ý|á|é|ou|ého)|žlut(?:ý|á|é|ou|ého)|vlevo|vpravo|nahoře|dole|lev(?:ý|á|é)|prav(?:ý|á|é))\b/i;

function blockText(block: LessonBlock) {
  return [
    block.title,
    block.instructions,
    ...(block.options ?? []),
    ...(block.items ?? []),
    block.revealText ?? '',
  ].join(' ');
}

export function getBlockAccessibilityAuthoringIssues(block: LessonBlock): AccessibilityAuthoringIssue[] {
  const issues: AccessibilityAuthoringIssue[] = [];
  const text = blockText(block);

  if (block.dataTable && !block.dataTable.caption?.trim()) {
    issues.push({
      blockId: block.id,
      blockTitle: block.title,
      code: 'missing-table-caption',
      message: 'Tabulka nemá stručný popisek, který vysvětluje její obsah nebo účel.',
    });
  }

  if (dragOnlyPattern.test(block.instructions)) {
    issues.push({
      blockId: block.id,
      blockTitle: block.title,
      code: 'drag-only-instruction',
      message: 'Zadání může působit jako drag-only ovládání. Formuluj úkol jako „seřaď“ nebo „přesuň“ bez předpokladu konkrétního gesta.',
    });
  }

  if (actionPattern.test(text) && visualCuePattern.test(text)) {
    issues.push({
      blockId: block.id,
      blockTitle: block.title,
      code: 'visual-only-cue',
      message: 'Zadání může odkazovat na barvu nebo polohu jako na jediný způsob rozpoznání volby. Doplň textový název nebo jiný nevizuální údaj.',
    });
  }

  return issues;
}

export function getLessonAccessibilityAuthoringIssues(lesson: Lesson) {
  return lesson.blocks.flatMap(getBlockAccessibilityAuthoringIssues);
}
