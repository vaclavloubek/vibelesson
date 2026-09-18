'use client';

import Link from 'next/link';
import { useEffect, useMemo, useRef, useState } from 'react';
import type { User } from '@supabase/supabase-js';
import AuthControls from '@/components/AuthControls';
import HeaderMobileNav from '@/components/HeaderMobileNav';
import SyllonautMark from '@/components/SyllonautMark';
import SiteFooter from '@/components/SiteFooter';
import VisuallyHidden from '@/components/VisuallyHidden';
import { trackEvent } from '@/lib/analytics';
import { billingRouteForCountry, type BillingCurrency } from '@/lib/billing-region';
import { COUNTRY_CODES, isSupportedCountryCode } from '@/lib/countries';
import landing from './LandingPage.module.css';
import styles from './PricingPage.module.css';

type Audience = 'teachers' | 'schools';
type Billing = 'monthly' | 'annual';

type Price = {
  monthlyCzk: number;
  annualCzk: number;
  monthlyEur: number;
  annualEur: number;
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
    price: { monthlyCzk: 0, annualCzk: 0, monthlyEur: 0, annualEur: 0, monthlyUsd: 0, annualUsd: 0 },
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
    price: { monthlyCzk: 199, annualCzk: 1990, monthlyEur: 7.99, annualEur: 79.9, monthlyUsd: 8.99, annualUsd: 89 },
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
    price: { monthlyCzk: 329, annualCzk: 3290, monthlyEur: 13.99, annualEur: 139.9, monthlyUsd: 14.99, annualUsd: 149 },
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
    price: { monthlyCzk: 1290, annualCzk: 12900, monthlyEur: 54.99, annualEur: 549.9, monthlyUsd: 59.99, annualUsd: 599 },
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
    price: { monthlyCzk: 3190, annualCzk: 31900, monthlyEur: 139.99, annualEur: 1399.9, monthlyUsd: 149.99, annualUsd: 1499 },
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
    price: { monthlyCzk: 8490, annualCzk: 84900, monthlyEur: 369.99, annualEur: 3699.9, monthlyUsd: 399.99, annualUsd: 3999 },
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

function formatPrice(value: number, currency: BillingCurrency) {
  if (currency === 'czk') return `${czk.format(value)} Kč`;
  if (currency === 'eur') return `${value.toFixed(2).replace('.', ',')} €`;
  if (value === 0) return '$0';
  return '$' + (Number.isInteger(value) ? value.toFixed(0) : value.toFixed(2));
}

function priceValue(plan: Plan, billing: Billing, currency: BillingCurrency) {
  if (currency === 'czk') return billing === 'annual' ? plan.price.annualCzk : plan.price.monthlyCzk;
  if (currency === 'eur') return billing === 'annual' ? plan.price.annualEur : plan.price.monthlyEur;
  return billing === 'annual' ? plan.price.annualUsd : plan.price.monthlyUsd;
}

function PlanCard({
  plan,
  billing,
  currency,
  canSandboxCheckout,
  onSandboxCheckout,
}: {
  plan: Plan;
  billing: Billing;
  currency: BillingCurrency;
  canSandboxCheckout: boolean;
  onSandboxCheckout: (plan: Plan) => void;
}) {
  const annual = billing === 'annual';
  const primary = priceValue(plan, billing, currency);
  const annualPrice = priceValue(plan, 'annual', currency);
  const monthlyEquivalent = plan.free ? 0 : annualPrice / 12;

  return (
    <article className={`${styles.card} ${plan.featured ? styles.featured : ''}`} id={plan.id}>
      {plan.featured ? <span className={styles.badge}>Doporučený plán</span> : null}
      <div className={styles.cardHeader}>
        <h2>{plan.name}</h2>
        <p>{plan.description}</p>
      </div>

      <div className={styles.priceBlock}>
        <div className={styles.priceLine}>
          <strong>{formatPrice(primary, currency)}</strong>
          <span>{annual ? '/ rok' : '/ měsíc'}</span>
        </div>
        {annual && !plan.free ? (
          <div className={styles.priceNote}>≈ {formatPrice(monthlyEquivalent, currency)} / měsíc · 2 měsíce zdarma</div>
        ) : null}
        {plan.free ? <div className={styles.priceNote}>Bez platební karty.</div> : null}
      </div>

      <ul className={styles.features}>
        {plan.features.map((feature) => {
          const premiumHook = feature.startsWith('AI hodnocení') || feature.startsWith('Složky a podsložky');
          return <li key={feature} className={premiumHook ? styles.premiumFeature : undefined}>{feature}</li>;
        })}
      </ul>

      {plan.free ? (
        <a className={styles.activeCta} href="/pricing?signup=1" onClick={() => trackEvent('free_signup_click', { location: 'pricing' })}>Vytvořit Free účet</a>
      ) : canSandboxCheckout && (plan.id === 'teacher' || plan.id === 'teacher-pro') ? (
        <button type="button" className={styles.activeCta} onClick={() => onSandboxCheckout(plan)}>Otestovat nákup</button>
      ) : (
        <button type="button" className={styles.disabledCta} disabled>Připravujeme</button>
      )}
    </article>
  );
}

export default function PricingPage({
  startSignup = false,
  currency,
  initialCountry,
  sandboxCheckoutEnabled = false,
  checkoutResult = null,
}: {
  startSignup?: boolean;
  currency: BillingCurrency;
  initialCountry?: string | null;
  sandboxCheckoutEnabled?: boolean;
  checkoutResult?: 'success' | 'cancelled' | null;
}) {
  const [user, setUser] = useState<User | null>(null);
  const [audience, setAudience] = useState<Audience>('teachers');
  const [billing, setBilling] = useState<Billing>('monthly');
  const [checkoutPlan, setCheckoutPlan] = useState<Plan | null>(null);
  const [checkoutCountry, setCheckoutCountry] = useState<string>(() => {
    const candidate = initialCountry?.toUpperCase() ?? '';
    if (isSupportedCountryCode(candidate)) return candidate;
    if (currency === 'czk') return 'CZ';
    if (currency === 'eur') return 'DE';
    return 'US';
  });
  const [checkoutBusy, setCheckoutBusy] = useState(false);
  const [checkoutError, setCheckoutError] = useState('');
  const checkoutDialogRef = useRef<HTMLDivElement | null>(null);
  const pricingViewTrackedRef = useRef(false);
  const countryOptions = useMemo(() => {
    let displayNames: Intl.DisplayNames | null = null;
    try {
      displayNames = new Intl.DisplayNames(['cs'], { type: 'region' });
    } catch {
      displayNames = null;
    }

    return COUNTRY_CODES
      .map((code) => ({ code, label: displayNames?.of(code) ?? code }))
      .sort((left, right) => left.label.localeCompare(right.label, 'cs'));
  }, []);
  const plans = audience === 'teachers' ? teacherPlans : schoolPlans;
  const pricingStatus = `${audience === 'teachers' ? 'Zobrazeny plány pro učitele' : 'Zobrazeny plány pro školy'}, ${billing === 'monthly' ? 'měsíční fakturace' : 'roční fakturace'}, měna ${currency.toUpperCase()}.`;

  useEffect(() => {
    if (pricingViewTrackedRef.current) return;
    pricingViewTrackedRef.current = true;
    trackEvent('pricing_view', { segment: 'teacher', billing_period: 'monthly' });
  }, []);

  useEffect(() => {
    if (checkoutResult === 'success') {
      trackEvent('checkout_complete', { source: 'stripe_sandbox' });
    }
  }, [checkoutResult]);

  useEffect(() => {
    if (!checkoutPlan) return;

    const frame = window.requestAnimationFrame(() => {
      checkoutDialogRef.current?.querySelector<HTMLElement>('select, button:not([disabled])')?.focus();
    });
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || checkoutBusy) return;
      event.preventDefault();
      setCheckoutPlan(null);
      setCheckoutError('');
    };
    document.addEventListener('keydown', handleKeyDown);

    return () => {
      window.cancelAnimationFrame(frame);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [checkoutBusy, checkoutPlan]);

  function changeAudience(next: Audience) {
    if (next === audience) return;
    setAudience(next);
    trackEvent('pricing_segment_change', { segment: next === 'teachers' ? 'teacher' : 'school' });
  }

  function changeBilling(next: Billing) {
    if (next === billing) return;
    setBilling(next);
    trackEvent('pricing_billing_period_change', { billing_period: next });
  }

  function openSandboxCheckout(plan: Plan) {
    if (plan.id !== 'teacher' && plan.id !== 'teacher-pro') return;
    setCheckoutPlan(plan);
    setCheckoutError('');
    trackEvent('plan_select', {
      plan: plan.id,
      billing_period: billing,
      source: 'pricing_sandbox',
    });
  }

  async function startSandboxCheckout() {
    if (!checkoutPlan || checkoutBusy) return;
    if (checkoutPlan.id !== 'teacher' && checkoutPlan.id !== 'teacher-pro') return;
    const planId = checkoutPlan.id;
    setCheckoutBusy(true);
    setCheckoutError('');

    try {
      const response = await fetch('/api/billing/stripe/checkout', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        cache: 'no-store',
        body: JSON.stringify({
          planId,
          billing,
          country: checkoutCountry,
        }),
      });
      const payload = await response.json() as {
        url?: string;
        error?: string;
        diagnostics?: {
          stripeType?: string | null;
          stripeCode?: string | null;
          stripeMessage?: string | null;
        };
      };

      if (!response.ok || !payload.url) {
        const diagnosticParts = [
          payload.diagnostics?.stripeCode,
          payload.diagnostics?.stripeMessage,
        ].filter(Boolean);
        throw new Error(
          diagnosticParts.length > 0
            ? diagnosticParts.join(': ')
            : (payload.error ?? 'checkout_creation_failed'),
        );
      }

      trackEvent('checkout_start', {
        plan: planId,
        billing_period: billing,
        billing_country: checkoutCountry,
        source: 'pricing_sandbox',
      });
      window.location.assign(payload.url);
    } catch (error) {
      console.error('sandbox checkout start failed', error);
      const message = error instanceof Error ? error.message : '';
      setCheckoutError(
        message && message !== 'checkout_creation_failed'
          ? `Stripe: ${message}`
          : 'Testovací Checkout se nepodařilo spustit. Zkontroluj serverové nastavení Stripe.',
      );
      setCheckoutBusy(false);
    }
  }

  const checkoutRoute = checkoutPlan ? billingRouteForCountry(checkoutCountry) : null;

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
          <Link href="/new" className={landing.headerCta} style={{ whiteSpace: 'nowrap' }} onClick={() => trackEvent('prepare_lesson_cta_click', { location: 'pricing' })}>Připravit hodinu</Link>
          <HeaderMobileNav signedIn={Boolean(user)} current="pricing" />
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

      {checkoutResult && sandboxCheckoutEnabled ? (
        <div className={styles.checkoutNotice} role="status">
          {checkoutResult === 'success'
            ? 'Sandbox Checkout byl dokončen. Stav předplatného ověří webhook v databázi.'
            : 'Sandbox Checkout byl zrušen. Nic se nezměnilo.'}
        </div>
      ) : null}

      <section className={styles.controls} aria-label="Nastavení ceníku">
        <div className={styles.controlGroup}>
          <span>Typ předplatného</span>
          <div className={styles.segmented} role="group" aria-label="Typ předplatného">
            <button type="button" className={audience === 'teachers' ? styles.selected : ''} aria-pressed={audience === 'teachers'} onClick={() => changeAudience('teachers')}>Pro učitele</button>
            <button type="button" className={audience === 'schools' ? styles.selected : ''} aria-pressed={audience === 'schools'} onClick={() => changeAudience('schools')}>Pro školy</button>
          </div>
        </div>
        <div className={styles.controlGroup}>
          <span>Fakturace</span>
          <div className={styles.segmented} role="group" aria-label="Fakturace">
            <button type="button" className={billing === 'monthly' ? styles.selected : ''} aria-pressed={billing === 'monthly'} onClick={() => changeBilling('monthly')}>Měsíčně</button>
            <button type="button" className={billing === 'annual' ? styles.selected : ''} aria-pressed={billing === 'annual'} onClick={() => changeBilling('annual')}>Ročně <em>2 měsíce zdarma</em></button>
          </div>
        </div>
      </section>

      <div role="status" aria-live="polite" aria-atomic="true">
        <VisuallyHidden>{pricingStatus}</VisuallyHidden>
      </div>

      <section className={styles.cards}>
        {plans.map((plan) => (
          <PlanCard
            key={plan.id}
            plan={plan}
            billing={billing}
            currency={currency}
            canSandboxCheckout={sandboxCheckoutEnabled && Boolean(user)}
            onSandboxCheckout={openSandboxCheckout}
          />
        ))}
      </section>

      {checkoutPlan && checkoutRoute ? (
        <div
          className={styles.checkoutOverlay}
          onMouseDown={(event) => {
            if (event.target === event.currentTarget && !checkoutBusy) {
              setCheckoutPlan(null);
              setCheckoutError('');
            }
          }}
        >
          <div
            ref={checkoutDialogRef}
            className={styles.checkoutDialog}
            role="dialog"
            aria-modal="true"
            aria-labelledby="sandbox-checkout-title"
          >
            <span className={styles.checkoutKicker}>Stripe sandbox</span>
            <h2 id="sandbox-checkout-title">Otestovat {checkoutPlan.name}</h2>
            <p>
              Vyber fakturační zemi. Syllonaut podle ní zvolí měnu a způsob zpracování platby.
              Ve Stripe Checkout pak použij stejnou fakturační zemi.
            </p>

            <label className={styles.checkoutField}>
              Fakturační země
              <select
                value={checkoutCountry}
                onChange={(event) => {
                  setCheckoutCountry(event.target.value);
                  setCheckoutError('');
                }}
                disabled={checkoutBusy}
              >
                {countryOptions.map((option) => (
                  <option key={option.code} value={option.code}>{option.label} ({option.code})</option>
                ))}
              </select>
            </label>

            <div className={styles.checkoutRoute}>
              <span>Měna</span>
              <strong>{checkoutRoute.currency.toUpperCase()}</strong>
              <span>Zpracování</span>
              <strong>{checkoutRoute.managedPayments ? 'Managed Payments' : 'Standardní Stripe'}</strong>
            </div>

            {checkoutError ? <div className={styles.checkoutError} role="alert">{checkoutError}</div> : null}

            <div className={styles.checkoutActions}>
              <button
                type="button"
                className={styles.dialogSecondary}
                onClick={() => {
                  setCheckoutPlan(null);
                  setCheckoutError('');
                }}
                disabled={checkoutBusy}
              >
                Zrušit
              </button>
              <button
                type="button"
                className={styles.activeCta}
                onClick={startSandboxCheckout}
                disabled={checkoutBusy}
              >
                {checkoutBusy ? 'Otevírám Stripe…' : 'Pokračovat do Stripe'}
              </button>
            </div>
          </div>
        </div>
      ) : null}

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

      <SiteFooter />
    </main>
  );
}
