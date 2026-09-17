'use client';

import Link from 'next/link';
import { useState } from 'react';
import type { User } from '@supabase/supabase-js';
import AuthControls from '@/components/AuthControls';
import SyllonautMark from '@/components/SyllonautMark';
import VisuallyHidden from '@/components/VisuallyHidden';
import landing from './LandingPage.module.css';
import styles from './PricingPage.module.css';

type Audience = 'teachers' | 'schools';
type Billing = 'monthly' | 'annual';

type Price = {
  monthlyCzk: number;
  annualCzk: number;
  monthlyUsd: number;
  annualUsd: number;
};

type Plan = {
  id: string;
  name: string;
  description: string;
  price: Price;
  features: string[];
  featured?: boolean;
  free?: boolean;
};

const teacherPlans: Plan[] = [
  {
    id: 'free',
    name: 'Free',
    description: 'Pro první lekce a občasné použití bez platební karty.',
    price: { monthlyCzk: 0, annualCzk: 0, monthlyUsd: 0, annualUsd: 0 },
    features: [
      '5 nových AI lekcí za měsíc',
      '20 AI úprav za měsíc',
      'Živé hodiny bez tarifního limitu',
      'Studenti se připojují bez plnohodnotného účtu',
      'Automatické bodování kvízů',
      'Ruční hodnocení otevřených a týmových odpovědí',
    ],
    free: true,
  },
  {
    id: 'teacher',
    name: 'Teacher',
    description: 'Pro učitele, kteří Syllonaut používají pravidelně během měsíce.',
    price: { monthlyCzk: 199, annualCzk: 1990, monthlyUsd: 8.99, annualUsd: 89 },
    features: [
      '25 nových AI lekcí za měsíc',
      '100 AI úprav za měsíc',
      'Živé hodiny bez tarifního limitu',
      'Studenti se připojují bez plnohodnotného účtu',
      'Automatické bodování kvízů',
      'Ruční hodnocení otevřených a týmových odpovědí',
    ],
    featured: true,
  },
  {
    id: 'teacher-pro',
    name: 'Teacher Pro',
    description: 'Pro intenzivní výuku, více kurzů a pokročilou práci s výsledky.',
    price: { monthlyCzk: 329, annualCzk: 3290, monthlyUsd: 14.99, annualUsd: 149 },
    features: [
      '60 nových AI lekcí za měsíc',
      '250 AI úprav za měsíc',
      'AI hodnocení bodovaných otevřených, týmových a exit-ticket odpovědí',
      'Složky a podsložky pro organizaci lekcí',
      'Živé hodiny bez tarifního limitu',
      'Studenti se připojují bez plnohodnotného účtu',
    ],
  },
];

const schoolPlans: Plan[] = [
  {
    id: 'team',
    name: 'Team',
    description: 'Pro menší kabinet, metodický tým nebo skupinu učitelů.',
    price: { monthlyCzk: 1290, annualCzk: 12900, monthlyUsd: 59.99, annualUsd: 599 },
    features: [
      'Až 10 učitelů',
      '200 nových AI lekcí za měsíc společně',
      '800 AI úprav za měsíc společně',
      'Živé hodiny bez tarifního limitu',
      'Sdílený měsíční AI limit pro celý tým',
    ],
  },
  {
    id: 'school',
    name: 'School',
    description: 'Pro školu, která chce Syllonaut zpřístupnit širšímu pedagogickému týmu.',
    price: { monthlyCzk: 3190, annualCzk: 31900, monthlyUsd: 149.99, annualUsd: 1499 },
    features: [
      'Až 30 učitelů',
      '600 nových AI lekcí za měsíc společně',
      '2 400 AI úprav za měsíc společně',
      'AI hodnocení bodovaných otevřených, týmových a exit-ticket odpovědí',
      'Složky a podsložky pro organizaci lekcí',
      'Živé hodiny bez tarifního limitu',
      'Sdílený měsíční AI limit pro celou školu',
    ],
    featured: true,
  },
  {
    id: 'campus',
    name: 'Campus',
    description: 'Pro velkou školu, síť pracovišť nebo instituci s více týmy.',
    price: { monthlyCzk: 8490, annualCzk: 84900, monthlyUsd: 399.99, annualUsd: 3999 },
    features: [
      'Až 100 učitelů',
      '2 000 nových AI lekcí za měsíc společně',
      '8 000 AI úprav za měsíc společně',
      'AI hodnocení bodovaných otevřených, týmových a exit-ticket odpovědí',
      'Složky a podsložky pro organizaci lekcí',
      'Živé hodiny bez tarifního limitu',
      'Sdílený měsíční AI limit pro celou organizaci',
    ],
  },
];

const czk = new Intl.NumberFormat('cs-CZ');

function usd(value: number) {
  if (value === 0) return '$0';
  return `$${Number.isInteger(value) ? value.toFixed(0) : value.toFixed(2)}`;
}

function PlanCard({ plan, billing }: { plan: Plan; billing: Billing }) {
  const annual = billing === 'annual';
  const primary = annual ? plan.price.annualCzk : plan.price.monthlyCzk;
  const secondary = annual ? plan.price.annualUsd : plan.price.monthlyUsd;
  const monthlyEquivalent = plan.free ? 0 : Math.round(plan.price.annualCzk / 12);

  return (
    <article className={`${styles.card} ${plan.featured ? styles.featured : ''}`} id={plan.id}>
      {plan.featured ? <span className={styles.badge}>Doporučený plán</span> : null}
      <div className={styles.cardHeader}>
        <h2>{plan.name}</h2>
        <p>{plan.description}</p>
      </div>

      <div className={styles.priceBlock}>
        <div className={styles.priceLine}>
          <strong>{czk.format(primary)} Kč</strong>
          <span>{annual ? '/ rok' : '/ měsíc'}</span>
        </div>
        <div className={styles.usdPrice}>{usd(secondary)} {annual ? '/ rok' : '/ měsíc'}</div>
        {annual && !plan.free ? (
          <div className={styles.priceNote}>≈ {czk.format(monthlyEquivalent)} Kč / měsíc · 2 měsíce zdarma</div>
        ) : null}
        {plan.free ? <div className={styles.priceNote}>Bez platební karty.</div> : null}
      </div>

      <ul className={styles.features}>
        {plan.features.map((feature) => <li key={feature}>{feature}</li>)}
      </ul>

      {plan.free ? (
        <a className={styles.activeCta} href="/pricing?signup=1">Vytvořit Free účet</a>
      ) : (
        <button type="button" className={styles.disabledCta} disabled>Připravujeme</button>
      )}
    </article>
  );
}

export default function PricingPage({ startSignup = false }: { startSignup?: boolean }) {
  const [user, setUser] = useState<User | null>(null);
  const [audience, setAudience] = useState<Audience>('teachers');
  const [billing, setBilling] = useState<Billing>('monthly');
  const plans = audience === 'teachers' ? teacherPlans : schoolPlans;
  const pricingStatus = `${audience === 'teachers' ? 'Zobrazeny plány pro učitele' : 'Zobrazeny plány pro školy'}, ${billing === 'monthly' ? 'měsíční fakturace' : 'roční fakturace'}.`;

  return (
    <main className={landing.page}>
      <header className={landing.header}>
        <Link href="/" className={landing.brand} aria-label="Syllonaut – domů">
          <SyllonautMark />
          <span>Syllonaut</span>
          <span className={landing.beta}>BETA</span>
        </Link>
        <nav className={landing.nav} aria-label="Hlavní navigace">
          <Link href="/#jak-to-funguje">Jak to funguje</Link>
          <Link href="/pricing" aria-current="page">Ceník</Link>
          {user ? <Link href="/lessons">Moje lekce</Link> : null}
        </nav>
        <div className={landing.headerActions}>
          <AuthControls
            onAuthChange={setUser}
            initialOpen={startSignup}
            initialMode={startSignup ? 'signup' : 'signin'}
          />
          <Link href="/new" className={landing.headerCta} style={{ whiteSpace: 'nowrap' }}>Připravit hodinu</Link>
        </div>
      </header>

      <section className={styles.hero}>
        <span className={styles.eyebrow}>Pricing · Ceník</span>
        <h1>Začněte zdarma. Přidejte výkon, až ho budete potřebovat.</h1>
        <p>
          Free stačí na vyzkoušení celého toku od přípravy po živou hodinu. Placené plány přidají větší AI kapacitu;
          Teacher Pro navíc automatické AI hodnocení a organizaci lekcí do složek.
        </p>
      </section>

      <section className={styles.controls} aria-label="Nastavení ceníku">
        <div className={styles.controlGroup}>
          <span>Typ předplatného</span>
          <div className={styles.segmented} role="group" aria-label="Typ předplatného">
            <button type="button" className={audience === 'teachers' ? styles.selected : ''} aria-pressed={audience === 'teachers'} onClick={() => setAudience('teachers')}>Pro učitele</button>
            <button type="button" className={audience === 'schools' ? styles.selected : ''} aria-pressed={audience === 'schools'} onClick={() => setAudience('schools')}>Pro školy</button>
          </div>
        </div>
        <div className={styles.controlGroup}>
          <span>Fakturace</span>
          <div className={styles.segmented} role="group" aria-label="Fakturace">
            <button type="button" className={billing === 'monthly' ? styles.selected : ''} aria-pressed={billing === 'monthly'} onClick={() => setBilling('monthly')}>Měsíčně</button>
            <button type="button" className={billing === 'annual' ? styles.selected : ''} aria-pressed={billing === 'annual'} onClick={() => setBilling('annual')}>Ročně <em>2 měsíce zdarma</em></button>
          </div>
        </div>
      </section>

      <div role="status" aria-live="polite" aria-atomic="true">
        <VisuallyHidden>{pricingStatus}</VisuallyHidden>
      </div>

      <section className={styles.cards}>
        {plans.map((plan) => <PlanCard key={plan.id} plan={plan} billing={billing} />)}
      </section>

      <section className={styles.notes}>
        <div>
          <span className={styles.noteIndex}>01</span>
          <strong>Měsíční limity se obnovují každý kalendářní měsíc.</strong>
          <p>U školních plánů jsou lekce a AI úpravy společným limitem pro všechny učitele v daném účtu.</p>
        </div>
        <div>
          <span className={styles.noteIndex}>02</span>
          <strong>Placené plány zatím neaktivujeme.</strong>
          <p>Tlačítka jsou proto záměrně neaktivní. Free účet je dostupný už nyní a nevyžaduje platební kartu.</p>
        </div>
        <div>
          <span className={styles.noteIndex}>03</span>
          <strong>Školní správa se ještě připravuje.</strong>
          <p>U školních plánů nyní zveřejňujeme kapacitu, společné AI limity a ceny; detail týmové správy doplníme před spuštěním.</p>
        </div>
      </section>

      <footer className={landing.footer}>
        <span>© 2026 Syllonaut</span>
        <span>AI navigátor pro interaktivní výuku.</span>
      </footer>
    </main>
  );
}
