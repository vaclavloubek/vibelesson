'use client';

export type SyllonautGuideChapter = 'lesson' | 'live' | 'evaluation';
export type SyllonautGuideAction = 'lesson-created' | 'lesson-revised' | 'activity-revised' | 'session-created' | 'teams-created' | 'live-started' | 'live-ended';

export type SyllonautGuideState = {
  version: 1;
  running: boolean;
  chapter: SyllonautGuideChapter;
  step: number;
  dismissed: boolean;
  completed: SyllonautGuideChapter[];
};

export const SYLLONAUT_GUIDE_EVENT = 'syllonaut:guide-state';
export const SYLLONAUT_GUIDE_ACTION_EVENT = 'syllonaut:guide-action';
const STORAGE_PREFIX = 'syllonaut_guide_v1:';

export function syllonautGuideStorageKey(userId: string) {
  return `${STORAGE_PREFIX}${userId}`;
}

export function readSyllonautGuideState(userId: string): SyllonautGuideState | null {
  if (typeof window === 'undefined') return null;

  try {
    const raw = window.localStorage.getItem(syllonautGuideStorageKey(userId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<SyllonautGuideState>;
    if (
      parsed.version !== 1
      || typeof parsed.running !== 'boolean'
      || !['lesson', 'live', 'evaluation'].includes(parsed.chapter ?? '')
      || typeof parsed.step !== 'number'
      || !Number.isInteger(parsed.step)
      || typeof parsed.dismissed !== 'boolean'
      || !Array.isArray(parsed.completed)
    ) return null;

    return {
      version: 1,
      running: parsed.running,
      chapter: parsed.chapter as SyllonautGuideChapter,
      step: Math.max(0, Number(parsed.step)),
      dismissed: parsed.dismissed,
      completed: parsed.completed.filter((value): value is SyllonautGuideChapter =>
        value === 'lesson' || value === 'live' || value === 'evaluation'),
    };
  } catch {
    return null;
  }
}

export function writeSyllonautGuideState(userId: string, state: SyllonautGuideState) {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(syllonautGuideStorageKey(userId), JSON.stringify(state));
  } catch {
    // Onboarding state is helpful UX, never a prerequisite for using the product.
  }

  window.dispatchEvent(new CustomEvent(SYLLONAUT_GUIDE_EVENT, {
    detail: { userId, state },
  }));
}

export function signalSyllonautGuideAction(userId: string, action: SyllonautGuideAction) {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent(SYLLONAUT_GUIDE_ACTION_EVENT, {
    detail: { userId, action },
  }));
}

export function startSyllonautGuide(
  userId: string,
  chapter: SyllonautGuideChapter = 'lesson',
  step = 0,
) {
  const previous = readSyllonautGuideState(userId);
  writeSyllonautGuideState(userId, {
    version: 1,
    running: true,
    chapter,
    step,
    dismissed: false,
    completed: previous?.completed ?? [],
  });
}

export function maybeStartFirstSyllonautGuide(userId: string) {
  if (readSyllonautGuideState(userId)) return false;
  startSyllonautGuide(userId, 'lesson', 0);
  return true;
}

export function restartSyllonautGuideForCurrentContext(userId: string) {
  if (typeof window === 'undefined') return;

  const pathname = window.location.pathname;
  if (/^\/sessions\/[^/]+/.test(pathname)) {
    if (document.querySelector('[data-tour="session-report"], [data-tour="session-ended-summary"]')) {
      startSyllonautGuide(userId, 'evaluation', 0);
      return;
    }
    if (document.querySelector('[data-tour="live-controls"]')) {
      startSyllonautGuide(userId, 'live', 4);
      return;
    }
    startSyllonautGuide(userId, 'live', 0);
    return;
  }

  if (/^\/lessons\/[^/]+\/?$/.test(pathname)) {
    startSyllonautGuide(userId, 'lesson', 2);
    return;
  }

  startSyllonautGuide(userId, 'lesson', 0);
  if (pathname !== '/new') window.location.assign('/new');
}
