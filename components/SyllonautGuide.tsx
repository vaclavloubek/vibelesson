'use client';

import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import SyllonautMark from '@/components/SyllonautMark';
import { useUiLocale } from '@/components/LocaleProvider';
import {
  readSyllonautGuideState,
  subscribeSyllonautGuideState,
  syllonautGuideStepKey,
  SYLLONAUT_GUIDE_ACTION_EVENT,
  SYLLONAUT_LESSON_REVIEW_STEP,
  type SyllonautGuideAction,
  type SyllonautGuideChapter,
  type SyllonautGuideState,
  writeSyllonautGuideState,
} from '@/lib/onboarding-guide';
import { SYLLONAUT_GUIDE_STEPS } from '@/lib/onboarding-guide-steps';

type Props = {
  userId: string | null;
};

type TargetRect = {
  top: number;
  left: number;
  right: number;
  bottom: number;
  width: number;
  height: number;
};

const stepsByChapter = SYLLONAUT_GUIDE_STEPS;
const chapterOrder: SyllonautGuideChapter[] = ['lesson', 'live', 'evaluation'];
const PHONE_PRESENTER_MEDIA = '(max-width: 680px) and (hover: none), (max-height: 500px) and (hover: none)';

function padRect(rect: DOMRect, padding = 8): TargetRect {
  const top = Math.max(8, rect.top - padding);
  const left = Math.max(8, rect.left - padding);
  const right = Math.min(window.innerWidth - 8, rect.right + padding);
  const bottom = Math.min(window.innerHeight - 8, rect.bottom + padding);
  return {
    top,
    left,
    right,
    bottom,
    width: Math.max(0, right - left),
    height: Math.max(0, bottom - top),
  };
}

function panelStyle(rect: TargetRect): CSSProperties {
  const width = Math.min(380, window.innerWidth - 24);
  const gap = 16;
  const estimatedHeight = 250;
  const centeredLeft = Math.max(12, Math.min(window.innerWidth - width - 12, rect.left + (rect.width - width) / 2));

  if (window.innerHeight - rect.bottom >= estimatedHeight + gap) {
    return { width, left: centeredLeft, top: rect.bottom + gap };
  }
  if (rect.top >= estimatedHeight + gap) {
    return { width, left: centeredLeft, bottom: window.innerHeight - rect.top + gap };
  }

  const rightSpace = window.innerWidth - rect.right;
  const leftSpace = rect.left;
  if (rightSpace >= width + gap) {
    return { width, left: rect.right + gap, top: Math.max(12, Math.min(window.innerHeight - estimatedHeight - 12, rect.top)) };
  }
  if (leftSpace >= width + gap) {
    return { width, right: window.innerWidth - rect.left + gap, top: Math.max(12, Math.min(window.innerHeight - estimatedHeight - 12, rect.top)) };
  }

  return { width, left: 12, bottom: 12 };
}

export default function SyllonautGuide({ userId }: Props) {
  const locale = useUiLocale();
  const english = locale === 'en';
  const [state, setState] = useState<SyllonautGuideState | null>(null);
  const [rect, setRect] = useState<TargetRect | null>(null);
  const [phonePresenterHidden, setPhonePresenterHidden] = useState(() =>
    typeof window !== 'undefined' && window.matchMedia(PHONE_PRESENTER_MEDIA).matches,
  );
  const targetRef = useRef<HTMLElement | null>(null);
  const optionalTimerRef = useRef<number | null>(null);
  const scrolledStepRef = useRef<string>('');

  const steps = state ? stepsByChapter[state.chapter] : stepsByChapter.lesson;
  const step = state ? steps[state.step] ?? null : null;

  const persist = useCallback((next: SyllonautGuideState) => {
    if (!userId) return;
    setState(next);
    writeSyllonautGuideState(userId, next);
  }, [userId]);

  const advance = useCallback((markSatisfied = true) => {
    if (!state || !userId) return;
    const currentSteps = stepsByChapter[state.chapter];
    const currentKey = syllonautGuideStepKey(state.chapter, state.step);
    const satisfiedSteps = markSatisfied && !state.satisfiedSteps.includes(currentKey)
      ? [...state.satisfiedSteps, currentKey]
      : state.satisfiedSteps;

    if (state.step + 1 < currentSteps.length) {
      persist({ ...state, step: state.step + 1, satisfiedSteps });
      return;
    }

    const chapterIndex = chapterOrder.indexOf(state.chapter);
    const completed = state.completed.includes(state.chapter)
      ? state.completed
      : [...state.completed, state.chapter];

    if (chapterIndex < chapterOrder.length - 1) {
      persist({
        ...state,
        chapter: chapterOrder[chapterIndex + 1],
        step: 0,
        completed,
        satisfiedSteps,
      });
      return;
    }

    persist({
      ...state,
      running: false,
      dismissed: false,
      completed,
      satisfiedSteps,
    });
  }, [persist, state, userId]);

  const retreat = useCallback(() => {
    if (!state || !userId || state.step <= 0) return;
    const currentSteps = stepsByChapter[state.chapter];

    for (let previousStep = state.step - 1; previousStep >= 0; previousStep -= 1) {
      if (state.chapter === 'live' && phonePresenterHidden && previousStep < 2) continue;
      const previous = currentSteps[previousStep];
      if (!previous) continue;
      if (typeof document !== 'undefined' && !document.querySelector(`[data-tour="${previous.target}"]`)) continue;
      persist({ ...state, step: previousStep });
      return;
    }
  }, [persist, phonePresenterHidden, state, userId]);

  const dismiss = useCallback(() => {
    if (!state || !userId) return;
    persist({ ...state, running: false, dismissed: true });
  }, [persist, state, userId]);

  useEffect(() => {
    if (!userId) {
      setState(null);
      return;
    }

    setState(readSyllonautGuideState(userId));
    return subscribeSyllonautGuideState(userId, setState);
  }, [userId]);

  useEffect(() => {
    const media = window.matchMedia(PHONE_PRESENTER_MEDIA);
    const update = () => setPhonePresenterHidden(media.matches);
    update();
    media.addEventListener('change', update);
    return () => media.removeEventListener('change', update);
  }, []);

  useEffect(() => {
    if (!phonePresenterHidden || !state?.running || state.chapter !== 'live' || state.step >= 2 || !userId) return;
    persist({ ...state, step: 2 });
  }, [persist, phonePresenterHidden, state, userId]);

  useEffect(() => {
    if (!state?.running || !step) {
      setRect(null);
      targetRef.current = null;
      return;
    }

    let frame = 0;
    const locate = () => {
      window.cancelAnimationFrame(frame);
      frame = window.requestAnimationFrame(() => {
        const target = document.querySelector<HTMLElement>(`[data-tour="${step.target}"]`);
        targetRef.current = target;
        if (!target) {
          setRect(null);
          return;
        }

        const targetRect = target.getBoundingClientRect();
        const stepKey = `${state.chapter}:${state.step}`;
        const outsideViewport = targetRect.bottom < 24
          || targetRect.top > window.innerHeight - 24
          || targetRect.right < 24
          || targetRect.left > window.innerWidth - 24;

        if (outsideViewport && scrolledStepRef.current !== stepKey) {
          scrolledStepRef.current = stepKey;
          const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
          target.scrollIntoView({
            behavior: reduceMotion ? 'auto' : 'smooth',
            block: 'center',
            inline: 'nearest',
          });
          return;
        }

        setRect(padRect(targetRect));
      });
    };

    locate();
    const observer = new MutationObserver(locate);
    observer.observe(document.body, { childList: true, subtree: true, attributes: true });
    window.addEventListener('resize', locate);
    window.addEventListener('scroll', locate, true);

    return () => {
      window.cancelAnimationFrame(frame);
      observer.disconnect();
      window.removeEventListener('resize', locate);
      window.removeEventListener('scroll', locate, true);
    };
  }, [state?.running, state?.chapter, state?.step, step]);

  useEffect(() => {
    if (optionalTimerRef.current !== null) {
      window.clearTimeout(optionalTimerRef.current);
      optionalTimerRef.current = null;
    }
    if (!state?.running || !step?.optional || rect) return;

    optionalTimerRef.current = window.setTimeout(() => {
      optionalTimerRef.current = null;
      advance(false);
    }, 1200);

    return () => {
      if (optionalTimerRef.current !== null) {
        window.clearTimeout(optionalTimerRef.current);
        optionalTimerRef.current = null;
      }
    };
  }, [advance, rect, state?.running, state?.chapter, state?.step, step?.optional]);

  useEffect(() => {
    if (!state?.running || !step || step.advanceOn === 'manual' || step.advanceOn === 'signal') return;
    const target = targetRef.current;
    if (!target) return;

    const eventName = step.advanceOn === 'click' ? 'click' : 'input';
    const handler = () => advance();
    target.addEventListener(eventName, handler, { once: true });
    return () => target.removeEventListener(eventName, handler);
  }, [advance, rect, state?.running, state?.chapter, state?.step, step]);

  useEffect(() => {
    if (!userId || !state?.running) return;
    const onAction = (event: Event) => {
      const custom = event as CustomEvent<{ userId?: string; action?: SyllonautGuideAction }>;
      if (custom.detail?.userId !== userId || !custom.detail.action) return;

      if (custom.detail.action === 'lesson-created' && state.chapter === 'lesson') {
        const createdKey = syllonautGuideStepKey('lesson', 1);
        const satisfiedSteps = state.satisfiedSteps.includes(createdKey)
          ? state.satisfiedSteps
          : [...state.satisfiedSteps, createdKey];
        persist({
          ...state,
          step: SYLLONAUT_LESSON_REVIEW_STEP,
          satisfiedSteps,
        });
        return;
      }

      if (!step?.signal || custom.detail.action !== step.signal) return;
      advance();
    };
    window.addEventListener(SYLLONAUT_GUIDE_ACTION_EVENT, onAction);
    return () => window.removeEventListener(SYLLONAUT_GUIDE_ACTION_EVENT, onAction);
  }, [advance, persist, state, step, userId]);

  const blockerStyles = useMemo(() => {
    if (!rect) return null;
    return {
      top: { top: 0, left: 0, right: 0, height: Math.max(0, rect.top) },
      bottom: { top: rect.bottom, left: 0, right: 0, bottom: 0 },
      left: { top: rect.top, left: 0, width: Math.max(0, rect.left), height: rect.height },
      right: { top: rect.top, left: rect.right, right: 0, height: rect.height },
    } satisfies Record<string, CSSProperties>;
  }, [rect]);

  if (!userId || !state?.running || !step || !rect || !blockerStyles) return null;
  if (phonePresenterHidden && state.chapter === 'live' && state.step < 2) return null;

  const chapterNumber = chapterOrder.indexOf(state.chapter) + 1;
  const title = english ? step.title.en : step.title.cs;
  const body = english ? step.body.en : step.body.cs;
  const button = step.button ? (english ? step.button.en : step.button.cs) : (english ? 'Continue' : 'Pokračovat');
  const currentStepKey = syllonautGuideStepKey(state.chapter, state.step);
  const stepSatisfied = state.satisfiedSteps.includes(currentStepKey);
  const canGoBack = state.step > 0
    && !(phonePresenterHidden && state.chapter === 'live' && state.step <= 2);
  const displayedStepNumber = state.chapter === 'live' && phonePresenterHidden
    ? Math.max(1, state.step - 1)
    : state.step + 1;
  const displayedStepCount = state.chapter === 'live' && phonePresenterHidden
    ? Math.max(1, steps.length - 2)
    : steps.length;
  const primaryLabel = stepSatisfied ? (english ? 'Next' : 'Další') : button;

  return (
    <>
      {Object.entries(blockerStyles).map(([key, style]) => (
        <div key={key} className="syllonaut-guide-shade" style={style} aria-hidden="true" />
      ))}
      <div
        className="syllonaut-guide-spotlight"
        style={{ top: rect.top, left: rect.left, width: rect.width, height: rect.height }}
        aria-hidden="true"
      />
      <section
        className="syllonaut-guide-card"
        style={panelStyle(rect)}
        role="dialog"
        aria-live="polite"
        aria-label={english ? 'Syllonaut guide' : 'Průvodce Syllonautem'}
      >
        <div className="syllonaut-guide-card-head">
          <div className="syllonaut-guide-brand">
            <SyllonautMark />
            <span>{english ? 'FIRST FLIGHT' : 'PRVNÍ LET'}</span>
          </div>
          <button type="button" className="syllonaut-guide-close" onClick={dismiss} aria-label={english ? 'Close guide' : 'Zavřít průvodce'}>×</button>
        </div>
        <div className="syllonaut-guide-progress">
          <span>{english ? `Chapter ${chapterNumber} of 3` : `Kapitola ${chapterNumber} ze 3`}</span>
          <span>{displayedStepNumber} / {displayedStepCount}</span>
        </div>
        <h2>{title}</h2>
        <p>{body}</p>
        <div className="syllonaut-guide-actions">
          <div className="syllonaut-guide-secondary-actions">
            {canGoBack ? (
              <button type="button" className="syllonaut-guide-back" onClick={retreat}>
                ← {english ? 'Back' : 'Zpět'}
              </button>
            ) : null}
            <button type="button" className="syllonaut-guide-skip" onClick={dismiss}>
              {english ? 'Finish later' : 'Dokončit později'}
            </button>
          </div>
          {step.advanceOn === 'manual' || stepSatisfied ? (
            <button type="button" className="primary" onClick={() => advance()}>{primaryLabel}</button>
          ) : (
            <span className="syllonaut-guide-action-hint">
              {english ? 'Use the highlighted control to continue.' : 'Pokračujte zvýrazněnou akcí.'}
            </span>
          )}
        </div>
      </section>
    </>
  );
}
