import type { SyllonautGuideChapter } from '@/lib/onboarding-guide';

// Shared by the server (prompt, output filter) and the Help panel (buttons).
// The approved knowledge base lists exactly these actions; the model may not
// emit any other [[...]] token.

export const HELP_GUIDE_ACTIONS = [
  'lesson:0',
  'lesson:2',
  'lesson:3',
  'lesson:4',
  'lesson:6',
  'live:0',
  'live:2',
  'live:3',
  'live:5',
  'live:6',
  'evaluation:0',
  'evaluation:1',
] as const;

export const HELP_LINK_ACTIONS = ['pricing', 'subscription', 'complaint', 'withdrawal', 'contact'] as const;

export const HELP_TOPICS = [
  'lesson',
  'edit',
  'live',
  'teams',
  'evaluation',
  'quota',
  'language',
  'worksheets',
  'billing',
  'subscription',
  'legal',
  'devices',
  'other',
] as const;

export type HelpGuideAction = (typeof HELP_GUIDE_ACTIONS)[number];
export type HelpLinkAction = (typeof HELP_LINK_ACTIONS)[number];
export type HelpTopic = (typeof HELP_TOPICS)[number];

export type HelpAction =
  | { kind: 'guide'; token: string; chapter: SyllonautGuideChapter; step: number }
  | { kind: 'link'; token: string; link: HelpLinkAction };

// Pages that show the Help entry. The client sends only this key; the server
// derives the stored route pattern from it, so no lesson or session ID leaves
// the browser.
export const HELP_PAGES = ['lessons', 'new', 'lesson', 'live', 'evaluation', 'subscription'] as const;
export type HelpPage = (typeof HELP_PAGES)[number];

export const HELP_PAGE_ROUTES: Record<HelpPage, string> = {
  lessons: '/lessons',
  new: '/new',
  lesson: '/lessons/[id]',
  live: '/sessions/[id]',
  evaluation: '/sessions/[id]',
  subscription: '/subscription',
};

export const HELP_INPUT_MAX_CHARS = 1000;
export const HELP_HISTORY_MAX_MESSAGES = 10;

const ACTION_LINE = /^\[\[(guide|link|topic):([a-z_]+(?::\d+)?)\]\]$/;

export function parseHelpActionToken(line: string): HelpAction | null {
  const match = ACTION_LINE.exec(line.trim());
  if (!match) return null;
  const [, kind, value] = match;
  if (kind === 'guide' && (HELP_GUIDE_ACTIONS as readonly string[]).includes(value)) {
    const [chapter, step] = value.split(':');
    return { kind: 'guide', token: `[[guide:${value}]]`, chapter: chapter as SyllonautGuideChapter, step: Number(step) };
  }
  if (kind === 'link' && (HELP_LINK_ACTIONS as readonly string[]).includes(value)) {
    return { kind: 'link', token: `[[link:${value}]]`, link: value as HelpLinkAction };
  }
  return null;
}

export function parseHelpTopicToken(line: string): HelpTopic | null {
  const match = ACTION_LINE.exec(line.trim());
  if (!match || match[1] !== 'topic') return null;
  return (HELP_TOPICS as readonly string[]).includes(match[2]) ? (match[2] as HelpTopic) : null;
}

// Any line that looks like a [[...]] token, allowed or not.
export function isHelpTokenLine(line: string) {
  return /^\s*\[\[[^\]]*\]\]\s*$/.test(line);
}

export const HELP_ACTION_LABELS: Record<string, { cs: string; en: string }> = {
  'guide:lesson:0': { cs: 'Ukázat formulář nové lekce', en: 'Show the new lesson form' },
  'guide:lesson:2': { cs: 'Ukázat kontrolu lekce', en: 'Show how to review the lesson' },
  'guide:lesson:3': { cs: 'Ukázat úpravu celé lekce', en: 'Show whole-lesson editing' },
  'guide:lesson:4': { cs: 'Ukázat úpravu aktivity', en: 'Show activity editing' },
  'guide:lesson:6': { cs: 'Ukázat otevření hodiny', en: 'Show how to open the lesson' },
  'guide:live:0': { cs: 'Ukázat prezentační režim', en: 'Show Presenter mode' },
  'guide:live:2': { cs: 'Ukázat připojení studentů', en: 'Show how students join' },
  'guide:live:3': { cs: 'Ukázat týmy', en: 'Show teams' },
  'guide:live:5': { cs: 'Ukázat ovládání hodiny', en: 'Show lesson controls' },
  'guide:live:6': { cs: 'Ukázat ukončení', en: 'Show how to end the lesson' },
  'guide:evaluation:0': { cs: 'Ukázat vyhodnocení', en: 'Show the evaluation' },
  'guide:evaluation:1': { cs: 'Ukázat vyhodnocení', en: 'Show the evaluation' },
  'link:pricing': { cs: 'Zobrazit tarify', en: 'View plans' },
  'link:subscription': { cs: 'Otevřít předplatné', en: 'Open subscription' },
  'link:complaint': { cs: 'Podat reklamaci', en: 'File a complaint' },
  'link:withdrawal': { cs: 'Odstoupení od smlouvy', en: 'Withdraw from the contract' },
  'link:contact': { cs: 'Napsat autorovi', en: 'Write to the author' },
};
