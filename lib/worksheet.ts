import type { Lesson, LessonBlock } from '@/lib/schema';

export const WORKSHEET_SPACES = ['compact', 'normal', 'large'] as const;
export type WorksheetSpace = (typeof WORKSHEET_SPACES)[number];
export type WorksheetMode = 'student' | 'teacher';

const RECOMMENDED_TYPES = new Set<LessonBlock['type']>([
  'team_task', 'poll', 'quiz', 'open_text', 'ranking', 'exit_ticket',
]);

export function isWorksheetEligibleBlock(block: LessonBlock) {
  return block.type !== 'timer';
}

export function isWorksheetRecommendedBlock(block: LessonBlock) {
  return isWorksheetEligibleBlock(block) && RECOMMENDED_TYPES.has(block.type);
}

export function eligibleWorksheetBlocks(lesson: Lesson) {
  return lesson.blocks.filter(isWorksheetEligibleBlock);
}

export function defaultWorksheetBlockIds(lesson: Lesson) {
  const eligible = eligibleWorksheetBlocks(lesson);
  const recommended = eligible.filter(isWorksheetRecommendedBlock);
  return (recommended.length > 0 ? recommended : eligible).map((block) => block.id);
}

export function resolveWorksheetBlockIds(requested: readonly string[], lesson: Lesson) {
  const validIds = new Set(eligibleWorksheetBlocks(lesson).map((block) => block.id));
  const selected = [...new Set(requested.slice(0, 32).filter((id) => validIds.has(id)))];
  return selected.length > 0 ? selected : defaultWorksheetBlockIds(lesson);
}

export function normalizeWorksheetMode(value?: string | null): WorksheetMode {
  return value === 'teacher' ? 'teacher' : 'student';
}

export function normalizeWorksheetSpace(value?: string | null): WorksheetSpace {
  return WORKSHEET_SPACES.includes(value as WorksheetSpace) ? value as WorksheetSpace : 'normal';
}

export function worksheetBlockLabel(type: LessonBlock['type'], english: boolean) {
  const cs: Record<LessonBlock['type'], string> = {
    intro: 'Úvod', team_task: 'Týmová práce', poll: 'Hlasování', quiz: 'Kvíz',
    open_text: 'Otevřená odpověď', ranking: 'Řazení', reveal: 'Odhalení',
    timer: 'Časovač', exit_ticket: 'Exit ticket',
  };
  const en: Record<LessonBlock['type'], string> = {
    intro: 'Introduction', team_task: 'Team task', poll: 'Poll', quiz: 'Quiz',
    open_text: 'Open response', ranking: 'Ranking', reveal: 'Reveal',
    timer: 'Timer', exit_ticket: 'Exit ticket',
  };
  return (english ? en : cs)[type];
}

export function worksheetAnswerLineCount(space: WorksheetSpace, type: LessonBlock['type']) {
  const base = space === 'compact' ? 3 : space === 'large' ? 10 : 6;
  return type === 'team_task' ? base + 2 : base;
}
