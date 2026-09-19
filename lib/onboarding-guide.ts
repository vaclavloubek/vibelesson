'use client';

export type SyllonautGuideChapter = 'lesson' | 'live' | 'evaluation';
export type SyllonautGuideAction = 'lesson-created' | 'lesson-revised' | 'activity-revised' | 'session-created' | 'teams-created' | 'live-started' | 'live-ended';

export type SyllonautGuideState = {
  version: 3;
  running: boolean;
  chapter: SyllonautGuideChapter;
  step: number;
  dismissed: boolean;
  completed: SyllonautGuideChapter[];
  satisfiedSteps: string[];
};

export const SYLLONAUT_GUIDE_EVENT = 'syllonaut:guide-state';
export const SYLLONAUT_GUIDE_ACTION_EVENT = 'syllonaut:guide-action';
export const SYLLONAUT_LESSON_REVIEW_STEP = 2;

const STORAGE_PREFIX = 'syllonaut_guide_v3:';
const LEGACY_V2_STORAGE_PREFIX = 'syllonaut_guide_v2:';
const LEGACY_V1_STORAGE_PREFIX = 'syllonaut_guide_v1:';

export function syllonautGuideStorageKey(userId: string) {
  return `${STORAGE_PREFIX}${userId}`;
}

function legacyV2SyllonautGuideStorageKey(userId: string) {
  return `${LEGACY_V2_STORAGE_PREFIX}${userId}`;
}

function legacyV1SyllonautGuideStorageKey(userId: string) {
  return `${LEGACY_V1_STORAGE_PREFIX}${userId}`;
}

export function syllonautGuideStepKey(chapter: SyllonautGuideChapter, step: number) {
  return `${chapter}:${step}`;
}

function isChapter(value: unknown): value is SyllonautGuideChapter {
  return value === 'lesson' || value === 'live' || value === 'evaluation';
}

function normalizeCompleted(value: unknown): SyllonautGuideChapter[] {
  return Array.isArray(value) ? value.filter(isChapter) : [];
}

function normalizeSatisfiedSteps(value: unknown) {
  return Array.isArray(value)
    ? value.filter((entry): entry is string => typeof entry === 'string')
    : [];
}

function parseCurrentState(raw: string): SyllonautGuideState | null {
  const parsed = JSON.parse(raw) as Partial<SyllonautGuideState>;
  if (
    parsed.version !== 3
    || typeof parsed.running !== 'boolean'
    || !isChapter(parsed.chapter)
    || typeof parsed.step !== 'number'
    || !Number.isInteger(parsed.step)
    || typeof parsed.dismissed !== 'boolean'
    || !Array.isArray(parsed.completed)
  ) return null;

  return {
    version: 3,
    running: parsed.running,
    chapter: parsed.chapter,
    step: Math.max(0, Number(parsed.step)),
    dismissed: parsed.dismissed,
    completed: normalizeCompleted(parsed.completed),
    satisfiedSteps: normalizeSatisfiedSteps(parsed.satisfiedSteps),
  };
}

const V2_LIVE_STEP_TO_V3 = [2, 3, 0, 1, 4, 5, 6] as const;

function remapV2LiveStep(step: number) {
  return V2_LIVE_STEP_TO_V3[step] ?? step;
}

function migrateV2SatisfiedSteps(value: unknown) {
  return normalizeSatisfiedSteps(value).map((entry) => {
    const match = /^live:(\d+)$/.exec(entry);
    if (!match) return entry;
    return `live:${remapV2LiveStep(Number(match[1]))}`;
  });
}

function migrateV2State(raw: string): SyllonautGuideState | null {
  const parsed = JSON.parse(raw) as {
    version?: unknown;
    running?: unknown;
    chapter?: unknown;
    step?: unknown;
    dismissed?: unknown;
    completed?: unknown;
    satisfiedSteps?: unknown;
  };

  if (
    parsed.version !== 2
    || typeof parsed.running !== 'boolean'
    || !isChapter(parsed.chapter)
    || typeof parsed.step !== 'number'
    || !Number.isInteger(parsed.step)
    || typeof parsed.dismissed !== 'boolean'
    || !Array.isArray(parsed.completed)
  ) return null;

  const oldStep = Math.max(0, Number(parsed.step));
  const step = parsed.chapter === 'live'
    ? (parsed.running && oldStep < 4 ? 0 : remapV2LiveStep(oldStep))
    : oldStep;

  return {
    version: 3,
    running: parsed.running,
    chapter: parsed.chapter,
    step,
    dismissed: parsed.dismissed,
    completed: normalizeCompleted(parsed.completed),
    satisfiedSteps: parsed.chapter === 'live' && parsed.running && oldStep < 4
      ? normalizeSatisfiedSteps(parsed.satisfiedSteps).filter((entry) => !/^live:[0-3]$/.test(entry))
      : migrateV2SatisfiedSteps(parsed.satisfiedSteps),
  };
}

function migrateV1State(raw: string): SyllonautGuideState | null {
  const parsed = JSON.parse(raw) as {
    version?: unknown;
    running?: unknown;
    chapter?: unknown;
    step?: unknown;
    dismissed?: unknown;
    completed?: unknown;
  };

  if (
    parsed.version !== 1
    || typeof parsed.running !== 'boolean'
    || !isChapter(parsed.chapter)
    || typeof parsed.step !== 'number'
    || !Number.isInteger(parsed.step)
    || typeof parsed.dismissed !== 'boolean'
    || !Array.isArray(parsed.completed)
  ) return null;

  let step = Math.max(0, Number(parsed.step));

  if (parsed.running && parsed.chapter === 'lesson') {
    const pathname = window.location.pathname;
    if (/^\/lessons\/[^/]+\/?$/.test(pathname)) {
      step = SYLLONAUT_LESSON_REVIEW_STEP;
    } else if (pathname === '/new') {
      step = 0;
    }
  } else if (parsed.chapter === 'live') {
    step = parsed.running && step < 4 ? 0 : remapV2LiveStep(step);
  }

  return {
    version: 3,
    running: parsed.running,
    chapter: parsed.chapter,
    step,
    dismissed: parsed.dismissed,
    completed: normalizeCompleted(parsed.completed),
    // v1 used numeric step indexes; those became ambiguous after inserting new steps.
    satisfiedSteps: [],
  };
}

export function readSyllonautGuideState(userId: string): SyllonautGuideState | null {
  if (typeof window === 'undefined') return null;

  try {
    const currentRaw = window.localStorage.getItem(syllonautGuideStorageKey(userId));
    if (currentRaw) {
      const current = parseCurrentState(currentRaw);
      if (current) return current;
    }

    const legacyV2Raw = window.localStorage.getItem(legacyV2SyllonautGuideStorageKey(userId));
    const legacyV1Raw = window.localStorage.getItem(legacyV1SyllonautGuideStorageKey(userId));
    const migrated = legacyV2Raw
      ? migrateV2State(legacyV2Raw)
      : legacyV1Raw
        ? migrateV1State(legacyV1Raw)
        : null;
    if (!migrated) return null;

    try {
      window.localStorage.setItem(syllonautGuideStorageKey(userId), JSON.stringify(migrated));
    } catch {
      // A migration failure must not block the guide in the current tab.
    }
    return migrated;
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
    version: 3,
    running: true,
    chapter,
    step,
    dismissed: false,
    completed: previous?.completed ?? [],
    satisfiedSteps: previous?.satisfiedSteps ?? [],
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
      startSyllonautGuide(userId, 'live', 5);
      return;
    }
    startSyllonautGuide(userId, 'live', 0);
    return;
  }

  if (/^\/lessons\/[^/]+\/?$/.test(pathname)) {
    startSyllonautGuide(userId, 'lesson', SYLLONAUT_LESSON_REVIEW_STEP);
    return;
  }

  startSyllonautGuide(userId, 'lesson', 0);
  if (pathname !== '/new') window.location.assign('/new');
}
