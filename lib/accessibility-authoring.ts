import type { Lesson, LessonBlock } from './schema';

export type AccessibilityAuthoringIssue = {
  blockId: string;
  blockTitle: string;
  code: 'missing-table-caption' | 'drag-only-instruction' | 'visual-only-cue' | 'unsupported-visual-reference';
  message: string;
  suggestion: string;
};

const dragOnlyPattern = /\b(přetáhni|přetáhněte|přetahuj|přetahujte|drag(?:ni|ujte)?|táhni\s+(?:myší|prstem))\b/i;
const actionPattern = /\b(klikni|klikněte|vyber|vyberte|zvol|zvolte|označ|označte|stiskni|stiskněte)\b/i;
const visualCuePattern = /\b(červen(?:ý|á|é|ou|ého)|zelen(?:ý|á|é|ou|ého)|modr(?:ý|á|é|ou|ého)|žlut(?:ý|á|é|ou|ého)|vlevo|vpravo|nahoře|dole|lev(?:ý|á|é)|prav(?:ý|á|é))\b/i;
const unsupportedVisualReferencePattern = /\b(viz\s+(?:obrázek|graf|schéma)|(?:na|podle)\s+(?:obrázku|grafu|schématu)(?:\s+(?:výše|níže))?|obrázek\s+(?:výše|níže)|graf\s+(?:výše|níže)|schéma\s+(?:výše|níže))\b/i;

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
      suggestion: 'Doplň jednou větou, co tabulka obsahuje a proč ji student v úkolu používá.',
    });
  }

  if (dragOnlyPattern.test(block.instructions)) {
    issues.push({
      blockId: block.id,
      blockTitle: block.title,
      code: 'drag-only-instruction',
      message: 'Zadání může působit jako drag-only ovládání.',
      suggestion: 'Použij formulaci „seřaď“, „změň pořadí“ nebo „přesuň položku“ bez předpokladu myši, dotyku či konkrétního gesta.',
    });
  }

  if (actionPattern.test(text) && visualCuePattern.test(text)) {
    issues.push({
      blockId: block.id,
      blockTitle: block.title,
      code: 'visual-only-cue',
      message: 'Zadání může odkazovat na barvu nebo polohu jako na jediný způsob rozpoznání volby.',
      suggestion: 'Doplň textový název, pořadové číslo nebo jiný nevizuální údaj; barva či poloha může zůstat pouze jako doplněk.',
    });
  }

  if (unsupportedVisualReferencePattern.test(text)) {
    issues.push({
      blockId: block.id,
      blockTitle: block.title,
      code: 'unsupported-visual-reference',
      message: 'Zadání odkazuje na obrázek, graf nebo schéma, které nemusí být v textovém bloku dostupné nebo popsané.',
      suggestion: 'Přeneste podstatnou informaci přímo do textu nebo strukturované tabulky; pokud bude vizuální materiál později podporován, musí mít textovou alternativu.',
    });
  }

  return issues;
}

export function getLessonAccessibilityAuthoringIssues(lesson: Lesson) {
  return lesson.blocks.flatMap(getBlockAccessibilityAuthoringIssues);
}
