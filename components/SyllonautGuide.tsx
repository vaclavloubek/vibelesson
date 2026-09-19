'use client';

import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import SyllonautMark from '@/components/SyllonautMark';
import { useUiLocale } from '@/components/LocaleProvider';
import {
  readSyllonautGuideState,
  SYLLONAUT_GUIDE_ACTION_EVENT,
  SYLLONAUT_GUIDE_EVENT,
  type SyllonautGuideAction,
  type SyllonautGuideChapter,
  type SyllonautGuideState,
  writeSyllonautGuideState,
} from '@/lib/onboarding-guide';

type AdvanceMode = 'manual' | 'click' | 'input' | 'signal';

type GuideCopy = {
  cs: string;
  en: string;
};

type GuideStep = {
  target: string;
  title: GuideCopy;
  body: GuideCopy;
  advanceOn: AdvanceMode;
  signal?: SyllonautGuideAction;
  optional?: boolean;
  button?: GuideCopy;
};

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

const lessonSteps: GuideStep[] = [
  {
    target: 'lesson-create-brief',
    title: { cs: 'Začněte tím nejdůležitějším', en: 'Start with what matters' },
    body: {
      cs: 'Popište vlastními slovy, co mají studenti zažít a zvládnout. Klidně přidejte věk, délku hodiny, styl práce nebo zvláštní požadavky.',
      en: 'Describe in your own words what students should experience and learn. Add age, lesson length, working style or any special requirements.',
    },
    advanceOn: 'manual',
    button: { cs: 'Zadání mám', en: 'Brief ready' },
  },
  {
    target: 'lesson-create-submit',
    title: { cs: 'Nechte Syllonauta postavit lekci', en: 'Let Syllonaut build the lesson' },
    body: {
      cs: 'Až je zadání připravené, klikněte sem. Po vygenerování se průvodce sám přesune k úpravám.',
      en: 'When the brief is ready, click here. The guide will continue with editing after generation.',
    },
    advanceOn: 'signal',
    signal: 'lesson-created',
  },
  {
    target: 'lesson-edit-whole',
    title: { cs: 'Celou lekci upravíte jedním pokynem', en: 'Edit the whole lesson with one instruction' },
    body: {
      cs: 'Napište například „zkrátit na 45 minut“, „více týmové práce“ nebo „udělat druhou polovinu náročnější“ a spusťte Upravit celou lekci. Další krok se otevře po dokončení změny.',
      en: 'Try “shorten it to 45 minutes”, “add more teamwork” or “make the second half more challenging”, then run Edit whole lesson. The guide continues after the edit succeeds.',
    },
    advanceOn: 'signal',
    signal: 'lesson-revised',
  },
  {
    target: 'lesson-edit-block',
    title: { cs: 'Chcete změnit jen jeden úkol?', en: 'Want to change just one activity?' },
    body: {
      cs: 'Klikněte na Upravit blok u konkrétní aktivity. Zbytek lekce zůstane beze změny.',
      en: 'Click Edit block on a specific activity. The rest of the lesson stays unchanged.',
    },
    advanceOn: 'click',
  },
  {
    target: 'lesson-edit-block-editor',
    title: { cs: 'Úprava jedné aktivity', en: 'Edit one activity' },
    body: {
      cs: 'Napište přesně, co chcete změnit, a spusťte Upravit jen tuto aktivitu. Syllonaut změní pouze vybraný úkol; další krok se otevře po úspěšném uložení.',
      en: 'Describe exactly what should change and run Edit this activity only. Syllonaut changes only the selected task; the guide continues after the edit is saved.',
    },
    advanceOn: 'signal',
    signal: 'activity-revised',
  },
  {
    target: 'lesson-start',
    title: { cs: 'Lekce je připravená k výuce', en: 'The lesson is ready to teach' },
    body: {
      cs: 'Kliknutím vytvoříte živou hodinu. Otevře se řídicí centrum pro učitele; studenti se pak připojí přes kód nebo QR.',
      en: 'Click to create a live lesson. The teacher control centre opens and students can join by code or QR.',
    },
    advanceOn: 'signal',
    signal: 'session-created',
  },
];

const liveSteps: GuideStep[] = [
  {
    target: 'live-join',
    title: { cs: 'Nejdřív připojte studenty', en: 'Connect students first' },
    body: {
      cs: 'Promítněte kód nebo QR. Studenti nepotřebují plnohodnotný účet a mohou se připojit i po startu hodiny.',
      en: 'Show the code or QR. Students do not need a full account and can still join after the lesson starts.',
    },
    advanceOn: 'manual',
    button: { cs: 'Další: týmy', en: 'Next: teams' },
  },
  {
    target: 'live-team-create',
    title: { cs: 'Vytvořte týmy', en: 'Create teams' },
    body: {
      cs: 'Pokud lekce obsahuje týmový úkol, nastavte počet týmů a vytvořte je. Studenti si tým vyberou ve startovní zóně.',
      en: 'If the lesson includes a team task, choose the number of teams and create them. Students select a team in the lobby.',
    },
    advanceOn: 'signal',
    signal: 'teams-created',
    optional: true,
  },
  {
    target: 'live-presenter',
    title: { cs: 'Teď otevřete prezentační režim', en: 'Now open Presenter mode' },
    body: {
      cs: 'Klikněte sem. Syllonaut otevře nové okno určené studentům; vaše učitelské ovládání zůstane v tomto okně.',
      en: 'Click here. Syllonaut opens a new window for students while teacher controls stay in this window.',
    },
    advanceOn: 'click',
  },
  {
    target: 'live-presenter',
    title: { cs: 'Nové okno patří na projektor', en: 'Move the new window to the projector' },
    body: {
      cs: 'Přetáhněte nově otevřené okno na projektor nebo druhý displej a dejte ho přes celou obrazovku. Toto okno je pro studenty; hodinu dál řídíte tady.',
      en: 'Move the newly opened window to the projector or second display and make it full screen. That window is for students; keep controlling the lesson here.',
    },
    advanceOn: 'manual',
    button: { cs: 'Hotovo, pokračovat', en: 'Done, continue' },
  },
  {
    target: 'live-start',
    title: { cs: 'Odstartujte hodinu', en: 'Start the lesson' },
    body: {
      cs: 'Až jsou studenti připojení a případné týmy připravené, spusťte hodinu. Prezentační i studentská obrazovka se budou řídit stejným stavem.',
      en: 'When students are connected and any teams are ready, start the lesson. Presenter and student views follow the same lesson state.',
    },
    advanceOn: 'signal',
    signal: 'live-started',
  },
  {
    target: 'live-controls',
    title: { cs: 'Tady řídíte průběh hodiny', en: 'Control the lesson here' },
    body: {
      cs: 'Přecházejte mezi aktivitami tlačítky Předchozí a Další. Průběžné odpovědi, časovač i další nástroje zůstávají na učitelské obrazovce.',
      en: 'Move between activities with Previous and Next. Live responses, timers and other tools stay on the teacher screen.',
    },
    advanceOn: 'manual',
    button: { cs: 'Další: ukončení', en: 'Next: finish' },
  },
  {
    target: 'live-end',
    title: { cs: 'Po hodině ji uzavřete tady', en: 'Finish the lesson here' },
    body: {
      cs: 'Až skutečně skončíte, použijte Ukončit hodinu. Po potvrzení se uzamkne studentský vstup a Syllonaut připraví vyhodnocení.',
      en: 'When the lesson is truly over, use End lesson. After confirmation, student access closes and Syllonaut prepares the evaluation.',
    },
    advanceOn: 'signal',
    signal: 'live-ended',
  },
];

const evaluationSteps: GuideStep[] = [
  {
    target: 'session-ended-summary',
    title: { cs: 'Hodina je uzavřená', en: 'The lesson is closed' },
    body: {
      cs: 'Tady máte rychlé potvrzení, že live session skončila. Pod tím se automaticky načte podrobné vyhodnocení.',
      en: 'This confirms the live session has ended. The detailed evaluation loads automatically below.',
    },
    advanceOn: 'manual',
    button: { cs: 'Ukázat vyhodnocení', en: 'Show evaluation' },
  },
  {
    target: 'session-report',
    title: { cs: 'Výsledky máte na jednom místě', en: 'Your results are in one place' },
    body: {
      cs: 'Vidíte účast, odpovědi a výsledky jednotlivých aktivit. Odpovědi můžete stáhnout také jako CSV pro další práci.',
      en: 'Review participation, responses and activity results. You can also export responses as CSV for further work.',
    },
    advanceOn: 'manual',
    button: { cs: 'Dokončit průvodce', en: 'Finish guide' },
  },
];

const stepsByChapter: Record<SyllonautGuideChapter, GuideStep[]> = {
  lesson: lessonSteps,
  live: liveSteps,
  evaluation: evaluationSteps,
};

const chapterOrder: SyllonautGuideChapter[] = ['lesson', 'live', 'evaluation'];

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
  const targetRef = useRef<HTMLElement | null>(null);
  const optionalTimerRef = useRef<number | null>(null);
  const scrolledStepRef = useRef<string>('');

  const steps = state ? stepsByChapter[state.chapter] : lessonSteps;
  const step = state ? steps[state.step] ?? null : null;

  const persist = useCallback((next: SyllonautGuideState) => {
    if (!userId) return;
    setState(next);
    writeSyllonautGuideState(userId, next);
  }, [userId]);

  const advance = useCallback(() => {
    if (!state || !userId) return;
    const currentSteps = stepsByChapter[state.chapter];
    if (state.step + 1 < currentSteps.length) {
      persist({ ...state, step: state.step + 1 });
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
      });
      return;
    }

    persist({
      ...state,
      running: false,
      dismissed: false,
      completed,
    });
  }, [persist, state, userId]);

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

    const onGuideState = (event: Event) => {
      const custom = event as CustomEvent<{ userId?: string; state?: SyllonautGuideState }>;
      if (custom.detail?.userId !== userId) return;
      setState(custom.detail.state ?? readSyllonautGuideState(userId));
    };
    window.addEventListener(SYLLONAUT_GUIDE_EVENT, onGuideState);
    return () => window.removeEventListener(SYLLONAUT_GUIDE_EVENT, onGuideState);
  }, [userId]);

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
      advance();
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
    if (!userId || !state?.running || !step || step.advanceOn !== 'signal' || !step.signal) return;
    const onAction = (event: Event) => {
      const custom = event as CustomEvent<{ userId?: string; action?: SyllonautGuideAction }>;
      if (custom.detail?.userId !== userId || custom.detail.action !== step.signal) return;
      advance();
    };
    window.addEventListener(SYLLONAUT_GUIDE_ACTION_EVENT, onAction);
    return () => window.removeEventListener(SYLLONAUT_GUIDE_ACTION_EVENT, onAction);
  }, [advance, state?.running, state?.chapter, state?.step, step, userId]);

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

  const chapterNumber = chapterOrder.indexOf(state.chapter) + 1;
  const title = english ? step.title.en : step.title.cs;
  const body = english ? step.body.en : step.body.cs;
  const button = step.button ? (english ? step.button.en : step.button.cs) : (english ? 'Continue' : 'Pokračovat');

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
          <span>{state.step + 1} / {steps.length}</span>
        </div>
        <h2>{title}</h2>
        <p>{body}</p>
        <div className="syllonaut-guide-actions">
          <button type="button" className="syllonaut-guide-skip" onClick={dismiss}>
            {english ? 'Finish later' : 'Dokončit později'}
          </button>
          {step.advanceOn === 'manual' ? (
            <button type="button" className="primary" onClick={advance}>{button}</button>
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
