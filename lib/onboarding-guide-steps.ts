import type { SyllonautGuideAction, SyllonautGuideChapter } from '@/lib/onboarding-guide';

export type AdvanceMode = 'manual' | 'click' | 'input' | 'signal';

export type GuideCopy = {
  cs: string;
  en: string;
};

export type GuideStep = {
  target: string;
  title: GuideCopy;
  body: GuideCopy;
  advanceOn: AdvanceMode;
  signal?: SyllonautGuideAction;
  optional?: boolean;
  button?: GuideCopy;
};

const lessonSteps: GuideStep[] = [
  {
    target: 'lesson-create-form',
    title: { cs: 'Nejdřív nastavte celou lekci', en: 'Set up the whole lesson first' },
    body: {
      cs: 'Vyplňte volný popis i parametry lekce: jazyk, cílovku, délku, velikost týmu a tón. Podklady můžete přidat volitelně. Vše v tomto zvýrazněném formuláři zůstává normálně použitelné.',
      en: 'Fill in the lesson brief and settings: language, audience, duration, team size and tone. Source materials are optional. Everything in this highlighted form remains usable.',
    },
    advanceOn: 'manual',
    button: { cs: 'Zadání i parametry mám', en: 'Brief and settings ready' },
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
    target: 'lesson-review',
    title: { cs: 'Nejdřív si lekci projděte', en: 'Review the lesson first' },
    body: {
      cs: 'Projděte si vygenerovanou lekci a její aktivity. Klidně přepněte mezi učitelským a studentským náhledem. Teprve až budete vědět, co případně chcete změnit, pokračujte dál.',
      en: 'Review the generated lesson and its activities. You can switch between teacher and student preview. Continue only after you know whether anything needs changing.',
    },
    advanceOn: 'manual',
    button: { cs: 'Lekci jsem prošel', en: 'I reviewed the lesson' },
  },
  {
    target: 'lesson-edit-whole',
    title: { cs: 'Chcete upravit celou lekci?', en: 'Want to edit the whole lesson?' },
    body: {
      cs: 'Pokud chcete něco změnit napříč celou lekcí, napište pokyn například „zkrátit na 45 minut“ nebo „více týmové práce“ a spusťte úpravu. Jestli je lekce v pořádku, můžete pokračovat bez změny.',
      en: 'If you want to change the whole lesson, enter an instruction such as “shorten it to 45 minutes” or “add more teamwork” and run the edit. If the lesson already looks right, continue without changing it.',
    },
    advanceOn: 'manual',
    signal: 'lesson-revised',
    button: { cs: 'Bez úpravy pokračovat', en: 'Continue without editing' },
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
      cs: 'Pokud chcete něco změnit jen v této aktivitě, napište přesně co a spusťte Upravit jen tuto aktivitu. Jestli ji měnit nechcete, můžete pokračovat bez úpravy.',
      en: 'If you want to change only this activity, describe exactly what should change and run Edit this activity only. If it does not need editing, you can continue without changing it.',
    },
    advanceOn: 'manual',
    signal: 'activity-revised',
    button: { cs: 'Pokračovat bez úpravy', en: 'Continue without editing' },
  },
  {
    target: 'lesson-start',
    title: { cs: 'Lekce je připravená k výuce', en: 'The lesson is ready to teach' },
    body: {
      cs: 'Kliknutím otevřete hodinu pro studenty. Otevře se řídicí centrum pro učitele s kódem a QR pro připojení; samotnou hodinu odstartujete až tam.',
      en: 'Click to open the lesson for students. The teacher control centre opens with the join code and QR; you start the lesson itself from there.',
    },
    advanceOn: 'signal',
    signal: 'session-created',
  },
];

const liveSteps: GuideStep[] = [
  {
    target: 'live-presenter',
    title: { cs: 'Nejdřív prezentační režim', en: 'Start with Presenter mode' },
    body: {
      cs: 'Studenti se už teď mohou připojovat přes kód nebo QR. Vy si mezitím připravte obrazovku pro třídu: Prezentační režim otevře samostatné okno bez učitelského ovládání, určené pro projektor nebo druhý displej.',
      en: 'Students can already join now by code or QR. Meanwhile, prepare the classroom display: Presenter mode opens a separate window without teacher controls, intended for the projector or second display.',
    },
    advanceOn: 'click',
  },
  {
    target: 'live-presenter',
    title: { cs: 'Nové okno patří na projektor', en: 'Move the new window to the projector' },
    body: {
      cs: 'Přetáhněte nově otevřené okno na projektor nebo druhý displej a dejte ho přes celou obrazovku. Toto okno je pro studenty; hodinu dál řídíte v původním učitelském okně.',
      en: 'Move the newly opened window to the projector or second display and make it full screen. That window is for students; keep controlling the lesson in the original teacher window.',
    },
    advanceOn: 'manual',
    button: { cs: 'Hotovo, pokračovat', en: 'Done, continue' },
  },
  {
    target: 'live-join',
    title: { cs: 'Studenti se už mohou připojovat', en: 'Students can already join' },
    body: {
      cs: 'Kód a QR jsou aktivní od chvíle, kdy se live hodina vytvořila. Studenti nepotřebují plnohodnotný účet a nemusíte na všechny čekat — připojit se mohou i po odstartování hodiny.',
      en: 'The code and QR have been active since the live lesson was created. Students do not need a full account, and you do not need to wait for everyone — they can still join after the lesson starts.',
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
    target: 'live-start',
    title: { cs: 'Odstartujte hodinu', en: 'Start the lesson' },
    body: {
      cs: 'Až jsou studenti připojení a případné týmy vytvořené, spusťte hodinu. Není nutné čekat na všechny studenty — připojit se mohou i později.',
      en: 'When students are connected and any teams are set up, start the lesson. You do not need to wait for every student — they can still join later.',
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
      cs: 'Tady máte rychlé potvrzení, že živá hodina skončila. Pod tím se automaticky načte podrobné vyhodnocení.',
      en: 'This confirms the live lesson has ended. The detailed evaluation loads automatically below.',
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

// Shared with the help assistant (lib/help/knowledge.ts), which runs on the
// server and cannot import from the 'use client' guide component.
export const SYLLONAUT_GUIDE_STEPS: Record<SyllonautGuideChapter, GuideStep[]> = {
  lesson: lessonSteps,
  live: liveSteps,
  evaluation: evaluationSteps,
};
