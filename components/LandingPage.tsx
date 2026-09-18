'use client';

import Link from 'next/link';
import { useState } from 'react';
import type { User } from '@supabase/supabase-js';
import AuthControls from '@/components/AuthControls';
import HeaderMobileNav from '@/components/HeaderMobileNav';
import LocaleSwitcher from '@/components/LocaleSwitcher';
import { useUiLocale } from '@/components/LocaleProvider';
import SyllonautMark from '@/components/SyllonautMark';
import SiteFooter from '@/components/SiteFooter';
import { trackEvent } from '@/lib/analytics';
import styles from './LandingPage.module.css';
import polish from './LandingPagePolish.module.css';

const previewMutedText = { color: '#686b74' } as const;
const previewPrimaryAction = { background: '#5b57e8' } as const;

function SectionCue({ href, label }: { href: string; label: string }) {
  return (
    <a href={href} className={polish.sectionCue}>
      <span>{label}</span>
      <span className={polish.scrollArrow} aria-hidden="true">↓</span>
    </a>
  );
}

const copy = {
  cs: {
    brandHome: 'Syllonaut – domů',
    navLabel: 'Hlavní navigace',
    how: 'Jak to funguje',
    pricing: 'Ceník',
    lessons: 'Moje lekce',
    prepare: 'Připravit hodinu',
    eyebrow: 'AI navigátor pro interaktivní výuku',
    heroTitle: 'Z nápadu do živé interaktivní hodiny.',
    heroLead: 'Popište, co chcete učit. Syllonaut připraví strukturovanou lekci, kterou můžete upravit přirozeným jazykem a rovnou vést se studenty.',
    microcopy: 'Začněte zadáním. Účet je potřeba až ve chvíli, kdy necháte AI lekci vytvořit.',
    languageNote: 'Pište v jazyce, ve kterém chcete učit. Syllonaut vytvoří lekci ve stejném jazyce — nebo si jazyk výsledku zvolíte ručně.',
    newLesson: 'Nová lekce',
    brief: 'Zadání',
    briefQuestion: 'Co mají studenti dnes zažít?',
    briefExample: '90 minut mediální gramotnosti. Minimum výkladu, práce ve skupinách, praktické příklady a závěrečný exit ticket.',
    university: 'VŠ',
    students: '3–4 studenti',
    create: 'Vytvořit lekci',
    aiDraft: 'AI návrh',
    demoTitle: 'Mediální gramotnost bez filtru',
    route: [
      ['Rychlý start', 'Hlasování · 8 min'],
      ['Najděte slabinu', 'Týmový úkol · 25 min'],
      ['Seřaďte důvěryhodnost', 'Řazení · 20 min'],
      ['Co si odnášíte?', 'Exit ticket · 7 min'],
    ],
    ranking: 'Řazení',
    phoneQuestion: 'Co je nejspolehlivější signál důvěryhodnosti?',
    phoneRanks: ['Primární zdroj', 'Ověřitelný autor', 'Počet sdílení'],
    submitRanking: 'Odeslat pořadí',
    continue: 'Pokračovat níže',
    trustLabel: 'Hlavní schopnosti produktu',
    trust: ['Příprava', 'AI úpravy', 'Živá hodina', 'Studentské mobily'],
    flowEyebrow: 'Jeden souvislý tok',
    flowTitle: 'Od zadání až do učebny.',
    flowBody: 'Syllonaut neskládá jen osnovu. Připraví prostředí, které učitel i studenti skutečně používají.',
    steps: [
      ['Řekněte, co chcete učit.', 'Téma, cílovka, délka, velikost skupin a tón. Zbytek můžete popsat normální větou.'],
      ['Upravujte běžnou řečí.', 'Zkraťte úvod, změňte jedinou aktivitu nebo přidejte týmovou práci, aniž byste stavěli lekci znovu.'],
      ['Spusťte živou hodinu.', 'Studenti se připojí telefonem. Vy řídíte tempo a v Řídicím centru vidíte odpovědi i průběh.'],
    ],
    liveCue: 'Podívat se na živou hodinu',
    notSlidesEyebrow: 'Ne další prezentace',
    notSlidesTitle: 'Příprava, interakce a vedení hodiny v jednom nástroji.',
    notSlidesBody: 'Nemusíte zvlášť skládat slajdy, formulář, kvíz a odkaz pro studenty. Lekce vzniká jako jeden interaktivní scénář a zůstává propojená s živou session.',
    roles: [
      ['Učitel', 'vidí trasu hodiny, poznámky a živé odpovědi'],
      ['Student', 'vidí vždy jen to, co právě potřebuje'],
      ['AI', 'mění obsah, ne stabilitu aplikace'],
    ],
    liveStudents: '18 studentů',
    block: 'Blok 3 / 8',
    liveTask: 'Seřaďte signály důvěryhodnosti',
    liveTaskBody: 'Ve dvojicích vytvořte pořadí a krátce vysvětlete první a poslední volbu.',
    next: 'Další →',
    responses: 'Průběžné odpovědi',
    submitted: '78 % studentů odeslalo odpověď',
    activityCue: 'Prohlédnout typy aktivit',
    kitEyebrow: 'Stavebnice aktivit',
    kitTitle: 'AI vybírá formu. Vy určujete, co má výuka přinést.',
    activities: ['Hlasování', 'Kvíz', 'Týmový úkol', 'Řazení', 'Otevřená odpověď', 'Odhalení', 'Timer'],
    ownCue: 'Připravit vlastní hodinu',
    finalTitle: 'Připravte si další hodinu jinak.',
    finalBody: 'Začněte popisem toho, co mají studenti zažít. Syllonaut připraví zbytek trasy.',
  },
  en: {
    brandHome: 'Syllonaut – home',
    navLabel: 'Main navigation',
    how: 'How it works',
    pricing: 'Pricing',
    lessons: 'My lessons',
    prepare: 'Prepare a lesson',
    eyebrow: 'AI navigator for interactive teaching',
    heroTitle: 'From an idea to a live interactive lesson.',
    heroLead: 'Describe what you want to teach. Syllonaut creates a structured lesson you can refine in natural language and run with students straight away.',
    microcopy: 'Start with the brief. You only need an account when you ask AI to generate and save the lesson.',
    languageNote: 'Write in the language you want to teach in. Syllonaut can create the lesson in that language — or you can choose the output language explicitly.',
    newLesson: 'New lesson',
    brief: 'Brief',
    briefQuestion: 'What should students experience today?',
    briefExample: '90 minutes of media literacy. Minimal lecturing, group work, practical examples and a final exit ticket.',
    university: 'University',
    students: '3–4 students',
    create: 'Create lesson',
    aiDraft: 'AI draft',
    demoTitle: 'Media literacy without filters',
    route: [
      ['Quick start', 'Poll · 8 min'],
      ['Find the weak spot', 'Team task · 25 min'],
      ['Rank the evidence', 'Ranking · 20 min'],
      ['What will you take away?', 'Exit ticket · 7 min'],
    ],
    ranking: 'Ranking',
    phoneQuestion: 'Which signal is the strongest indicator of credibility?',
    phoneRanks: ['Primary source', 'Verifiable author', 'Number of shares'],
    submitRanking: 'Submit ranking',
    continue: 'Continue below',
    trustLabel: 'Core product capabilities',
    trust: ['Preparation', 'AI refinement', 'Live lesson', 'Student phones'],
    flowEyebrow: 'One continuous flow',
    flowTitle: 'From the brief to the classroom.',
    flowBody: 'Syllonaut does not stop at an outline. It creates an environment teachers and students actually use.',
    steps: [
      ['Say what you want to teach.', 'Add the topic, audience, duration, group size and tone. Describe everything else in a normal sentence.'],
      ['Refine it in plain language.', 'Shorten the intro, change one activity or add team work without rebuilding the whole lesson.'],
      ['Run the lesson live.', 'Students join on their phones. You control the pace and see responses and progress in the control centre.'],
    ],
    liveCue: 'See the live lesson',
    notSlidesEyebrow: 'Not another slide deck',
    notSlidesTitle: 'Preparation, interaction and live teaching in one tool.',
    notSlidesBody: 'You do not need separate slides, forms, quizzes and student links. The lesson is built as one interactive flow and stays connected to the live session.',
    roles: [
      ['Teacher', 'sees the lesson route, notes and live responses'],
      ['Student', 'sees only what they need at that moment'],
      ['AI', 'changes the content, not the stability of the app'],
    ],
    liveStudents: '18 students',
    block: 'Block 3 / 8',
    liveTask: 'Rank the signals of credibility',
    liveTaskBody: 'In pairs, create a ranking and briefly explain your first and last choice.',
    next: 'Next →',
    responses: 'Live responses',
    submitted: '78% of students submitted an answer',
    activityCue: 'Explore activity types',
    kitEyebrow: 'Activity toolkit',
    kitTitle: 'AI chooses the format. You decide what the learning should achieve.',
    activities: ['Poll', 'Quiz', 'Team task', 'Ranking', 'Open response', 'Reveal', 'Timer'],
    ownCue: 'Prepare your own lesson',
    finalTitle: 'Prepare your next lesson differently.',
    finalBody: 'Start by describing what students should experience. Syllonaut prepares the rest of the route.',
  },
} as const;

export default function LandingPage() {
  const [user, setUser] = useState<User | null>(null);
  const locale = useUiLocale();
  const t = copy[locale];

  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <Link href={`/${locale}`} className={styles.brand} aria-label={t.brandHome}>
          <SyllonautMark />
          <span>Syllonaut</span>
          <span className={styles.beta}>BETA</span>
        </Link>
        <nav className={styles.nav} aria-label={t.navLabel}>
          <a href="#jak-to-funguje">{t.how}</a>
          <Link href={`/${locale}/pricing`}>{t.pricing}</Link>
          {user ? <Link href="/lessons">{t.lessons}</Link> : null}
        </nav>
        <div className={styles.headerActions}>
          <LocaleSwitcher />
          <AuthControls onAuthChange={setUser} />
          <Link href="/new" className={`${styles.headerCta} ${polish.headerCta}`} onClick={() => trackEvent('prepare_lesson_cta_click', { location: 'header' })}>{t.prepare}</Link>
          <HeaderMobileNav signedIn={Boolean(user)} current="home" />
        </div>
      </header>

      <section className={styles.hero}>
        <div className={styles.heroCopy}>
          <div className={styles.eyebrow}>{t.eyebrow}</div>
          <h1>{t.heroTitle}</h1>
          <p className={styles.lead}>{t.heroLead}</p>
          <div className={styles.heroActions}>
            <Link href="/new" className={styles.primaryCta} onClick={() => trackEvent('prepare_lesson_cta_click', { location: 'hero' })}>{t.prepare}</Link>
            <a href="#jak-to-funguje" className={styles.secondaryCta}>{t.how}</a>
          </div>
          <p className={styles.microcopy}>{t.microcopy}</p>
          <p className={styles.microcopy}><strong>{t.languageNote}</strong></p>
        </div>

        <div className={styles.heroVisual} aria-hidden="true">
          <div className={styles.visualGlow} />
          <div className={styles.productWindow}>
            <div className={styles.windowBar}>
              <div className={styles.windowBrand}><SyllonautMark /><strong>Syllonaut</strong></div>
              <span>{t.newLesson}</span>
            </div>
            <div className={styles.windowGrid}>
              <div className={styles.composerCard}>
                <span className={styles.uiEyebrow} style={previewMutedText}>{t.brief}</span>
                <strong>{t.briefQuestion}</strong>
                <div className={styles.fakeTextarea}>{t.briefExample}</div>
                <div className={styles.fakeMeta}><span style={previewMutedText}>90 min</span><span style={previewMutedText}>{t.university}</span><span style={previewMutedText}>{t.students}</span></div>
                <div className={styles.fakeButton}>{t.create}</div>
              </div>

              <div className={styles.routeCard}>
                <div className={styles.routeHeader}>
                  <div><span className={styles.uiEyebrow} style={previewMutedText}>{t.aiDraft}</span><strong>{t.demoTitle}</strong></div>
                  <span style={previewMutedText}>90 min</span>
                </div>
                <div className={styles.routeList}>
                  {t.route.map(([title, meta], index) => <div className={styles.routeItem} key={title}><i /><span>{index + 1}</span><div><strong>{title}</strong><small style={previewMutedText}>{meta}</small></div></div>)}
                </div>
              </div>
            </div>
          </div>

          <div className={styles.phone}>
            <div className={styles.phoneTop}><span style={previewMutedText}>3 / 8</span><i /></div>
            <div className={styles.phoneProgress}><i /></div>
            <span className={styles.phoneEyebrow} style={previewMutedText}>{t.ranking}</span>
            <strong>{t.phoneQuestion}</strong>
            {t.phoneRanks.map((item, index) => (
              <div className={`${styles.phoneRank} ${index === 0 ? styles.rankOne : index === 1 ? styles.rankTwo : styles.rankThree}`} key={item}><b>{index + 1}.</b><span>{item}</span></div>
            ))}
            <div className={styles.phoneButton}>{t.submitRanking}</div>
          </div>
        </div>
      </section>

      <a href="#jak-to-funguje" className={polish.scrollCue}>
        <span>{t.continue}</span>
        <span className={polish.scrollArrow} aria-hidden="true">↓</span>
      </a>

      <section className={styles.trustStrip} aria-label={t.trustLabel}>
        {t.trust.map((item, index) => [<span key={`${item}-label`}>{item}</span>, index < t.trust.length - 1 ? <i key={`${item}-separator`} /> : null])}
      </section>

      <section className={`${styles.how} ${polish.guidedSection}`} id="jak-to-funguje">
        <div className={styles.sectionHeading}>
          <span className={styles.eyebrow}>{t.flowEyebrow}</span>
          <h2>{t.flowTitle}</h2>
          <p>{t.flowBody}</p>
        </div>
        <div className={styles.steps}>
          {t.steps.map(([title, body], index) => <article key={title}><span>{String(index + 1).padStart(2, '0')}</span><h3>{title}</h3><p>{body}</p></article>)}
        </div>
        <SectionCue href="#ziva-hodina" label={t.liveCue} />
      </section>

      <section className={`${styles.notSlides} ${polish.guidedSection}`} id="ziva-hodina">
        <div className={styles.notSlidesCopy}>
          <span className={styles.eyebrow}>{t.notSlidesEyebrow}</span>
          <h2>{t.notSlidesTitle}</h2>
          <p>{t.notSlidesBody}</p>
          <div className={styles.capabilityGrid}>
            {t.roles.map(([title, body]) => <div key={title}><strong>{title}</strong><span>{body}</span></div>)}
          </div>
        </div>

        <div className={styles.missionControl} aria-hidden="true" style={{ pointerEvents: 'none' }}>
          <div className={styles.mcTop}>
            <span><i /> LIVE</span>
            <strong>{t.demoTitle}</strong>
            <small>{t.liveStudents}</small>
          </div>
          <div className={styles.mcProgress}><i /></div>
          <div className={styles.mcGrid}>
            <div className={styles.mcActivity}><span>{t.block}</span><h3>{t.liveTask}</h3><p>{t.liveTaskBody}</p><button type="button" tabIndex={-1} style={previewPrimaryAction}>{t.next}</button></div>
            <div className={styles.mcResponses}><span>{t.responses}</span><strong>14 / 18</strong><div><i style={{ width: '78%' }} /></div><small>{t.submitted}</small></div>
          </div>
        </div>
        <SectionCue href="#aktivity" label={t.activityCue} />
      </section>

      <section className={`${styles.activities} ${polish.guidedSection}`} id="aktivity">
        <div>
          <span className={styles.eyebrow}>{t.kitEyebrow}</span>
          <h2>{t.kitTitle}</h2>
        </div>
        <div className={styles.activityTags}>{t.activities.map((activity) => <span key={activity}>{activity}</span>)}</div>
        <SectionCue href="#pripravit-hodinu" label={t.ownCue} />
      </section>

      <section className={styles.finalCta} id="pripravit-hodinu">
        <SyllonautMark />
        <span className={styles.eyebrow}>Syllonaut</span>
        <h2>{t.finalTitle}</h2>
        <p>{t.finalBody}</p>
        <Link href="/new" className={styles.primaryCta} onClick={() => trackEvent('prepare_lesson_cta_click', { location: 'other' })}>{t.prepare}</Link>
      </section>

      <SiteFooter />
    </main>
  );
}
