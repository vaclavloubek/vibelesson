'use client';

import Link from 'next/link';
import { useState } from 'react';
import type { User } from '@supabase/supabase-js';
import AuthControls from '@/components/AuthControls';
import HeaderMobileNav from '@/components/HeaderMobileNav';
import SyllonautMark from '@/components/SyllonautMark';
import styles from './LandingPage.module.css';
import polish from './LandingPagePolish.module.css';

const activities = ['Hlasování', 'Kvíz', 'Týmový úkol', 'Řazení', 'Otevřená odpověď', 'Odhalení', 'Timer'];
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

export default function LandingPage() {
  const [user, setUser] = useState<User | null>(null);

  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <Link href="/" className={styles.brand} aria-label="Syllonaut – domů">
          <SyllonautMark />
          <span>Syllonaut</span>
          <span className={styles.beta}>BETA</span>
        </Link>
        <nav className={styles.nav} aria-label="Hlavní navigace">
          <a href="#jak-to-funguje">Jak to funguje</a>
          <Link href="/pricing">Ceník</Link>
          {user ? <Link href="/lessons">Moje lekce</Link> : null}
        </nav>
        <div className={styles.headerActions}>
          <AuthControls onAuthChange={setUser} />
          <Link href="/new" className={`${styles.headerCta} ${polish.headerCta}`}>Připravit hodinu</Link>
          <HeaderMobileNav signedIn={Boolean(user)} current="home" />
        </div>
      </header>

      <section className={styles.hero}>
        <div className={styles.heroCopy}>
          <div className={styles.eyebrow}>AI navigátor pro interaktivní výuku</div>
          <h1>Z nápadu do živé interaktivní hodiny.</h1>
          <p className={styles.lead}>Popište, co chcete učit. Syllonaut připraví strukturovanou lekci, kterou můžete upravit přirozeným jazykem a rovnou vést se studenty.</p>
          <div className={styles.heroActions}>
            <Link href="/new" className={styles.primaryCta}>Připravit hodinu</Link>
            <a href="#jak-to-funguje" className={styles.secondaryCta}>Jak to funguje</a>
          </div>
          <p className={styles.microcopy}>Začněte zadáním. Účet je potřeba až ve chvíli, kdy necháte AI lekci vytvořit.</p>
        </div>

        <div className={styles.heroVisual} aria-hidden="true">
          <div className={styles.visualGlow} />
          <div className={styles.productWindow}>
            <div className={styles.windowBar}>
              <div className={styles.windowBrand}><SyllonautMark /><strong>Syllonaut</strong></div>
              <span>Nová lekce</span>
            </div>
            <div className={styles.windowGrid}>
              <div className={styles.composerCard}>
                <span className={styles.uiEyebrow} style={previewMutedText}>Zadání</span>
                <strong>Co mají studenti dnes zažít?</strong>
                <div className={styles.fakeTextarea}>90 minut mediální gramotnosti. Minimum výkladu, práce ve skupinách, praktické příklady a závěrečný exit ticket.</div>
                <div className={styles.fakeMeta}><span style={previewMutedText}>90 min</span><span style={previewMutedText}>VŠ</span><span style={previewMutedText}>3–4 studenti</span></div>
                <div className={styles.fakeButton}>Vytvořit lekci</div>
              </div>

              <div className={styles.routeCard}>
                <div className={styles.routeHeader}>
                  <div><span className={styles.uiEyebrow} style={previewMutedText}>AI návrh</span><strong>Mediální gramotnost bez filtru</strong></div>
                  <span style={previewMutedText}>90 min</span>
                </div>
                <div className={styles.routeList}>
                  <div className={styles.routeItem}><i /><span>1</span><div><strong>Rychlý start</strong><small style={previewMutedText}>Hlasování · 8 min</small></div></div>
                  <div className={styles.routeItem}><i /><span>2</span><div><strong>Najděte slabinu</strong><small style={previewMutedText}>Týmový úkol · 25 min</small></div></div>
                  <div className={styles.routeItem}><i /><span>3</span><div><strong>Seřaďte důvěryhodnost</strong><small style={previewMutedText}>Řazení · 20 min</small></div></div>
                  <div className={styles.routeItem}><i /><span>4</span><div><strong>Co si odnášíte?</strong><small style={previewMutedText}>Exit ticket · 7 min</small></div></div>
                </div>
              </div>
            </div>
          </div>

          <div className={styles.phone}>
            <div className={styles.phoneTop}><span style={previewMutedText}>3 / 8</span><i /></div>
            <div className={styles.phoneProgress}><i /></div>
            <span className={styles.phoneEyebrow} style={previewMutedText}>Řazení</span>
            <strong>Co je nejspolehlivější signál důvěryhodnosti?</strong>
            <div className={`${styles.phoneRank} ${styles.rankOne}`}><b>1.</b><span>Primární zdroj</span></div>
            <div className={`${styles.phoneRank} ${styles.rankTwo}`}><b>2.</b><span>Ověřitelný autor</span></div>
            <div className={`${styles.phoneRank} ${styles.rankThree}`}><b>3.</b><span>Počet sdílení</span></div>
            <div className={styles.phoneButton}>Odeslat pořadí</div>
          </div>
        </div>
      </section>

      <a href="#jak-to-funguje" className={polish.scrollCue}>
        <span>Pokračovat níže</span>
        <span className={polish.scrollArrow} aria-hidden="true">↓</span>
      </a>

      <section className={styles.trustStrip} aria-label="Hlavní schopnosti produktu">
        <span>Příprava</span><i />
        <span>AI úpravy</span><i />
        <span>Živá hodina</span><i />
        <span>Studentské mobily</span>
      </section>

      <section className={`${styles.how} ${polish.guidedSection}`} id="jak-to-funguje">
        <div className={styles.sectionHeading}>
          <span className={styles.eyebrow}>Jeden souvislý tok</span>
          <h2>Od zadání až do učebny.</h2>
          <p>Syllonaut neskládá jen osnovu. Připraví prostředí, které učitel i studenti skutečně používají.</p>
        </div>
        <div className={styles.steps}>
          <article><span>01</span><h3>Řekněte, co chcete učit.</h3><p>Téma, cílovka, délka, velikost skupin a tón. Zbytek můžete popsat normální větou.</p></article>
          <article><span>02</span><h3>Upravujte běžnou řečí.</h3><p>Zkraťte úvod, změňte jedinou aktivitu nebo přidejte týmovou práci, aniž byste stavěli lekci znovu.</p></article>
          <article><span>03</span><h3>Spusťte živou hodinu.</h3><p>Studenti se připojí telefonem. Vy řídíte tempo a v Řídicím centru vidíte odpovědi i průběh.</p></article>
        </div>
        <SectionCue href="#ziva-hodina" label="Podívat se na živou hodinu" />
      </section>

      <section className={`${styles.notSlides} ${polish.guidedSection}`} id="ziva-hodina">
        <div className={styles.notSlidesCopy}>
          <span className={styles.eyebrow}>Ne další prezentace</span>
          <h2>Příprava, interakce a vedení hodiny v jednom nástroji.</h2>
          <p>Nemusíte zvlášť skládat slajdy, formulář, kvíz a odkaz pro studenty. Lekce vzniká jako jeden interaktivní scénář a zůstává propojená s živou session.</p>
          <div className={styles.capabilityGrid}>
            <div><strong>Učitel</strong><span>vidí trasu hodiny, poznámky a živé odpovědi</span></div>
            <div><strong>Student</strong><span>vidí vždy jen to, co právě potřebuje</span></div>
            <div><strong>AI</strong><span>mění obsah, ne stabilitu aplikace</span></div>
          </div>
        </div>

        <div className={styles.missionControl} aria-hidden="true" style={{ pointerEvents: 'none' }}>
          <div className={styles.mcTop}>
            <span><i /> LIVE</span>
            <strong>Mediální gramotnost bez filtru</strong>
            <small>18 studentů</small>
          </div>
          <div className={styles.mcProgress}><i /></div>
          <div className={styles.mcGrid}>
            <div className={styles.mcActivity}><span>Blok 3 / 8</span><h3>Seřaďte signály důvěryhodnosti</h3><p>Ve dvojicích vytvořte pořadí a krátce vysvětlete první a poslední volbu.</p><button type="button" tabIndex={-1} style={previewPrimaryAction}>Další →</button></div>
            <div className={styles.mcResponses}><span>Průběžné odpovědi</span><strong>14 z 18</strong><div><i style={{ width: '78%' }} /></div><small>78 % studentů odeslalo odpověď</small></div>
          </div>
        </div>
        <SectionCue href="#aktivity" label="Prohlédnout typy aktivit" />
      </section>

      <section className={`${styles.activities} ${polish.guidedSection}`} id="aktivity">
        <div>
          <span className={styles.eyebrow}>Stavebnice aktivit</span>
          <h2>AI vybírá formu. Vy určujete, co má výuka přinést.</h2>
        </div>
        <div className={styles.activityTags}>{activities.map((activity) => <span key={activity}>{activity}</span>)}</div>
        <SectionCue href="#pripravit-hodinu" label="Připravit vlastní hodinu" />
      </section>

      <section className={styles.finalCta} id="pripravit-hodinu">
        <SyllonautMark />
        <span className={styles.eyebrow}>Syllonaut</span>
        <h2>Připravte si další hodinu jinak.</h2>
        <p>Začněte popisem toho, co mají studenti zažít. Syllonaut připraví zbytek trasy.</p>
        <Link href="/new" className={styles.primaryCta}>Připravit hodinu</Link>
      </section>

      <footer className={styles.footer}>
        <span>© 2026 Syllonaut</span>
        <span>AI navigátor pro interaktivní výuku.</span>
      </footer>
    </main>
  );
}
