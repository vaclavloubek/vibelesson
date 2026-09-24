import type { Lesson, LessonBlock } from '@/lib/schema';

// Manual (no-AI) edit of one activity: texts and duration only. Correct answer,
// points, rubric, data table, type, id and the lesson language never change here.
export type ManualBlockEdit = {
  title?: string;
  instructions?: string;
  durationMinutes?: number;
  items?: string[];
  options?: string[];
  revealText?: string;
  teacherNote?: string;
};

type LocalizedMessage = { cs: string; en: string };

export type ManualBlockEditResult =
  | { ok: true; lesson: Lesson }
  | { ok: false; status: 400 | 404; error: LocalizedMessage };

function fail(cs: string, en: string, status: 400 | 404 = 400): ManualBlockEditResult {
  return { ok: false, status, error: { cs, en } };
}

const EMPTY_TEXT = [
  'Název, zadání, položky ani možnosti aktivity nesmí být prázdné.',
  'The activity title, instructions, items and options must not be empty.',
] as const;

export function applyManualBlockEdit(lesson: Lesson, blockId: string, edit: ManualBlockEdit): ManualBlockEditResult {
  const block = lesson.blocks.find((item) => item.id === blockId);
  if (!block) return fail('Vybraná aktivita už v lekci není.', 'The selected activity is no longer in the lesson.', 404);

  const next: LessonBlock = { ...block };

  if (edit.title !== undefined) {
    const title = edit.title.trim();
    if (!title) return fail(...EMPTY_TEXT);
    next.title = title;
  }

  if (edit.instructions !== undefined) {
    const instructions = edit.instructions.trim();
    if (!instructions) return fail(...EMPTY_TEXT);
    next.instructions = instructions;
  }

  if (edit.durationMinutes !== undefined) {
    if (!Number.isInteger(edit.durationMinutes) || edit.durationMinutes < 1 || edit.durationMinutes > 60) {
      return fail('Minutáž aktivity musí být celé číslo od 1 do 60.', 'The activity duration must be a whole number from 1 to 60.');
    }
    next.durationMinutes = edit.durationMinutes;
  }

  if (edit.items !== undefined) {
    if (!block.items || edit.items.length !== block.items.length) {
      return fail('Počet položek aktivity musí zůstat stejný.', 'The number of activity items must stay the same.');
    }
    const items = edit.items.map((item) => item.trim());
    if (items.some((item) => !item)) return fail(...EMPTY_TEXT);
    next.items = items;
  }

  if (edit.options !== undefined) {
    if (!block.options || edit.options.length !== block.options.length) {
      return fail('Počet možností musí zůstat stejný.', 'The number of options must stay the same.');
    }
    const options = edit.options.map((option) => option.trim());
    if (options.some((option) => !option)) return fail(...EMPTY_TEXT);
    if (new Set(options.map((option) => option.toLowerCase())).size !== options.length) {
      return fail('Možnosti se nesmí opakovat.', 'Options must not repeat.');
    }
    next.options = options;

    // Quiz scoring compares the student's choice with correctAnswer exactly, so
    // the correct answer follows the renamed option at the same position.
    if (block.correctAnswer !== undefined) {
      const correctIndex = block.options.indexOf(block.correctAnswer);
      if (correctIndex >= 0) next.correctAnswer = options[correctIndex];
    }
  }

  if (edit.revealText !== undefined) {
    const revealText = edit.revealText.trim();
    if (!revealText) {
      delete next.revealText;
    } else if (block.revealText === undefined) {
      return fail('Pointu lze ručně upravit jen u aktivity, která ji už má.', 'The reveal can only be edited manually on an activity that already has one.');
    } else {
      next.revealText = revealText;
    }
  }

  if (edit.teacherNote !== undefined) {
    const teacherNote = edit.teacherNote.trim();
    if (teacherNote) next.teacherNote = teacherNote;
    else delete next.teacherNote;
  }

  const blocks = lesson.blocks.map((item) => item.id === blockId ? next : item);
  const totalMinutes = blocks.reduce((sum, item) => sum + item.durationMinutes, 0);
  if (totalMinutes < 10 || totalMinutes > 360) {
    return fail(
      `Celková délka lekce by byla ${totalMinutes} min. Musí zůstat mezi 10 a 360 min.`,
      `The lesson would last ${totalMinutes} min in total. It must stay between 10 and 360 min.`,
    );
  }

  return { ok: true, lesson: { ...lesson, blocks, totalMinutes } };
}
