'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useRef, useState } from 'react';
import type { User } from '@supabase/supabase-js';
import AuthControls from '@/components/AuthControls';
import HeaderMobileNav from '@/components/HeaderMobileNav';
import LocaleSwitcher from '@/components/LocaleSwitcher';
import { useUiLocale } from '@/components/LocaleProvider';
import SyllonautMark from '@/components/SyllonautMark';
import SiteFooter from '@/components/SiteFooter';
import VisuallyHidden from '@/components/VisuallyHidden';
import { trackEvent } from '@/lib/analytics';
import { billingRouteForCountry, type BillingCurrency } from '@/lib/billing-region';
import { COUNTRY_CODES, isSupportedCountryCode } from '@/lib/countries';
import { pricingPagePrice } from '@/lib/individual-billing-catalog';
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

const teacherPlansCs: Plan[] = [
  {
    id: 'free',
    name: 'Free',
    description: 'Pro první lekce a občasné použití bez platební karty.',
    price: { monthlyCzk: 0, annualCzk: 0, monthlyEur: 0, annualEur: 0, monthlyUsd: 0, annualUsd: 0 },
    features: [
      '5 nových AI lekcí za měsíc',
      '3 importy nebo kopie lekcí za měsíc',
      '20 AI úprav za měsíc',
      'Každou lekci lze živě použít jednou',
      'Archivované lekce lze dál upravovat ručně i pomocí AI',
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
    price: pricingPagePrice('teacher'),
    features: [
      '25 nových AI lekcí za měsíc',
      '100 AI úprav za měsíc',
      'Lekce v libovolném jazyce',
      'Opakované používání lekcí bez omezení',
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
    price: pricingPagePrice('teacher_pro'),
    features: [
      '60 nových AI lekcí za měsíc',
      '250 AI úprav za měsíc',
      'Lekce v libovolném jazyce',
      'Pracovní listy z každé lekce · tisk a PDF',
      'AI hodnocení bodovaných otevřených, týmových a exit-ticket odpovědí',
      'Složky a podsložky pro organizaci lekcí',
      'Opakované používání lekcí bez omezení',
      'Studenti se připojují bez plnohodnotného účtu',
    ],
  },
];

const schoolPlansCs: Plan[] = [
  {
    id: 'team',
    name: 'Team',
    description: 'Pro menší kabinet, metodický tým nebo skupinu učitelů.',
    price: { monthlyCzk: 1290, annualCzk: 12900, monthlyEur: 54.99, annualEur: 549.9, monthlyUsd: 59.99, annualUsd: 599 },
    features: [
      'Až 10 učitelů',
      'Samostatný účet pro každého učitele',
      '200 nových AI lekcí za měsíc společně',
      '800 AI úprav za měsíc společně',
      'Lekce v libovolném jazyce',
      'Opakované používání lekcí bez omezení',
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
      'Samostatný účet pro každého učitele',
      '600 nových AI lekcí za měsíc společně',
      '2 400 AI úprav za měsíc společně',
      'Lekce v libovolném jazyce',
      'Pracovní listy z každé lekce · tisk a PDF',
      'AI hodnocení bodovaných otevřených, týmových a exit-ticket odpovědí',
      'Složky a podsložky pro organizaci lekcí',
      'Opakované používání lekcí bez omezení',
      'Sdílená knihovna lekcí',
      'Licenční zámek školních lekcí',
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
      'Samostatný účet pro každého učitele',
      '2 000 nových AI lekcí za měsíc společně',
      '8 000 AI úprav za měsíc společně',
      'Lekce v libovolném jazyce',
      'Pracovní listy z každé lekce · tisk a PDF',
      'AI hodnocení bodovaných otevřených, týmových a exit-ticket odpovědí',
      'Složky a podsložky pro organizaci lekcí',
      'Opakované používání lekcí bez omezení',
      'Sdílená knihovna lekcí',
      'Licenční zámek školních lekcí',
      'Sdílený měsíční AI limit pro celou organizaci',
    ],
  },
];

const PLAN_TRANSLATIONS: Record<string, { description: string; features: string[] }> = {
  free: {
    description: 'For first lessons and occasional use with no payment card.',
    features: [
      '5 new AI lessons per month',
      '3 lesson imports or copies per month',
      '20 AI edits per month',
      'Each lesson can be used live once',
      'Archived lessons remain editable manually and with AI',
      'Students join without a full account',
      'Automatic quiz scoring',
      'Manual grading of open and team responses',
    ],
  },
  teacher: {
    description: 'For teachers who use Syllonaut regularly throughout the month.',
    features: [
      '25 new AI lessons per month',
      '100 AI edits per month',
      'Lessons in any language',
      'Unlimited repeated use of lessons',
      'Students join without a full account',
      'Automatic quiz scoring',
      'Manual grading of open and team responses',
    ],
  },
  'teacher-pro': {
    description: 'For intensive teaching, multiple courses and advanced work with results.',
    features: [
      '60 new AI lessons per month',
      '250 AI edits per month',
      'Lessons in any language',
      'Printable worksheets from every lesson · print & PDF',
      'AI grading of scored open, team and exit-ticket responses',
      'Folders and subfolders for organising lessons',
      'Unlimited repeated use of lessons',
      'Students join without a full account',
    ],
  },
  team: {
    description: 'For a small department, subject team or group of teachers.',
    features: [
      'Up to 10 teachers',
      'A separate account for every teacher',
      '200 new AI lessons per month shared',
      '800 AI edits per month shared',
      'Lessons in any language',
      'Unlimited repeated use of lessons',
      'Shared monthly AI allowance for the whole team',
    ],
  },
  school: {
    description: 'For a school that wants to make Syllonaut available to a broader teaching team.',
    features: [
      'Up to 30 teachers',
      'A separate account for every teacher',
      '600 new AI lessons per month shared',
      '2,400 AI edits per month shared',
      'Lessons in any language',
      'Printable worksheets from every lesson · print & PDF',
      'AI grading of scored open, team and exit-ticket responses',
      'Folders and subfolders for organising lessons',
      'Unlimited repeated use of lessons',
      'Shared lesson library',
      'School lesson license lock',
      'Shared monthly AI allowance for the whole school',
    ],
  },
  campus: {
    description: 'For a large school, multi-site organisation or institution with several teams.',
    features: [
      'Up to 100 teachers',
      'A separate account for every teacher',
      '2,000 new AI lessons per month shared',
      '8,000 AI edits per month shared',
      'Lessons in any language',
      'Printable worksheets from every lesson · print & PDF',
      'AI grading of scored open, team and exit-ticket responses',
      'Folders and subfolders for organising lessons',
      'Unlimited repeated use of lessons',
      'Shared lesson library',
      'School lesson license lock',
      'Shared monthly AI allowance for the whole organisation',
    ],
  },
};

function localizePlan(plan: Plan, english: boolean): Plan {
  if (!english) return plan;
  const translated = PLAN_TRANSLATIONS[plan.id];
  return translated ? { ...plan, description: translated.description, features: translated.features } : plan;
}

const czk = new Intl.NumberFormat('cs-CZ');

function formatPrice(value: number, currency: BillingCurrency, english: boolean) {
  if (currency === 'czk') return `${czk.format(value)} Kč`;
  if (currency === 'eur') {
    const fixed = value.toFixed(2);
    return `${english ? fixed : fixed.replace('.', ',')} €`;
  }
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
  checkoutEnabled,
  checkoutLabel,
  onCheckout,
  english,
}: {
  plan: Plan;
  billing: Billing;
  currency: BillingCurrency;
  checkoutEnabled: boolean;
  checkoutLabel: string;
  onCheckout: (plan: Plan) => void;
  english: boolean;
}) {
  const annual = billing === 'annual';
  const primary = priceValue(plan, billing, currency);
  const annualPrice = priceValue(plan, 'annual', currency);
  const monthlyEquivalent = plan.free ? 0 : annualPrice / 12;

  return (
    <article className={`${styles.card} ${plan.featured ? styles.featured : ''}`} id={plan.id}>
      {plan.featured ? <span className={styles.badge}>{english ? 'Recommended plan' : 'Doporučený plán'}</span> : null}
      <div className={styles.cardHeader}>
        <h2>{plan.name}</h2>
        <p>{plan.description}</p>
      </div>

      <div className={styles.priceBlock}>
        <div className={styles.priceLine}>
          <strong>{formatPrice(primary, currency, english)}</strong>
          <span>{annual ? (english ? '/ year' : '/ rok') : (english ? '/ month' : '/ měsíc')}</span>
        </div>
        {annual && !plan.free ? (
          <div className={styles.priceNote}>≈ {formatPrice(monthlyEquivalent, currency, english)} {english ? '/ month · 2 months free' : '/ měsíc · 2 měsíce zdarma'}</div>
        ) : null}
        {plan.free ? <div className={styles.priceNote}>{english ? 'No payment card required.' : 'Bez platební karty.'}</div> : null}
      </div>

      <ul className={styles.features}>
        {plan.features.map((feature) => {
          const multilingualTeacherHook = (plan.id === 'teacher' || plan.id === 'teacher-pro')
            && (feature === 'Lekce v libovolném jazyce' || feature === 'Lessons in any language');
          const worksheetHook = feature.startsWith('Pracovní listy')
            || feature.startsWith('Printable worksheets');
          const unlimitedReuseHook = feature === 'Opakované používání lekcí bez omezení'
            || feature === 'Unlimited repeated use of lessons';
          const premiumHook = multilingualTeacherHook
            || worksheetHook
            || unlimitedReuseHook
            || feature.startsWith('AI hodnocení')
            || feature.startsWith('Složky a podsložky')
            || feature === 'Sdílená knihovna lekcí'
            || feature.startsWith('AI grading')
            || feature.startsWith('Folders and subfolders')
            || feature === 'Shared lesson library';
          return <li key={feature} className={premiumHook ? styles.premiumFeature : undefined}>{feature}{worksheetHook ? <span className={styles.newFeatureBadge}>{english ? 'NEW' : 'NOVĚ'}</span> : null}</li>;
        })}
      </ul>

      {plan.free ? (
        <a className={styles.activeCta} href={english ? '/en/pricing?signup=1' : '/cs/pricing?signup=1'} onClick={() => trackEvent('free_signup_click', { location: 'pricing' })}>{english ? 'Create Free account' : 'Vytvořit Free účet'}</a>
      ) : checkoutEnabled && (plan.id === 'teacher' || plan.id === 'teacher-pro') ? (
        <button type="button" className={styles.activeCta} onClick={() => onCheckout(plan)}>{checkoutLabel}</button>
      ) : (
        <button type="button" className={styles.disabledCta} disabled>{english ? 'Coming soon' : 'Připravujeme'}</button>
      )}
    </article>
  );
}

export default function PricingPage({
  startSignup = false,
  currency,
  initialCountry,
  sandboxCheckoutEnabled = false,
  publicLiveBillingEnabled = false,
  billingTestEnvironment = 'sandbox',
  checkoutResult = null,
  checkoutSessionId = null,
  activePlanCode = null,
}: {
  startSignup?: boolean;
  currency: BillingCurrency;
  initialCountry?: string | null;
  sandboxCheckoutEnabled?: boolean;
  publicLiveBillingEnabled?: boolean;
  billingTestEnvironment?: 'sandbox' | 'live';
  checkoutResult?: 'success' | 'cancelled' | null;
  checkoutSessionId?: string | null;
  activePlanCode?: 'teacher' | 'teacher-pro' | null;
}) {
  const router = useRouter();
  const locale = useUiLocale();
  const english = locale === 'en';
  const liveCheckout = billingTestEnvironment === 'live';
  const liveAcceptance = liveCheckout && sandboxCheckoutEnabled;
  const publicPurchaseMode = publicLiveBillingEnabled && liveCheckout && !liveAcceptance;
  const billingAnalyticsSource = liveAcceptance
    ? 'stripe_live_acceptance'
    : liveCheckout
      ? 'stripe_live'
      : 'stripe_sandbox';
  const pricingAnalyticsSource = liveAcceptance
    ? 'pricing_live_acceptance'
    : liveCheckout
      ? 'pricing_live'
      : 'pricing_sandbox';
  const ui = (cs: string, en: string) => english ? en : cs;
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
  const [portalBusy, setPortalBusy] = useState(false);
  const [portalError, setPortalError] = useState('');
  const checkoutDialogRef = useRef<HTMLDivElement | null>(null);
  const pricingViewTrackedRef = useRef(false);
  const activationRefreshAttemptsRef = useRef(0);
  const subscriptionActivationTrackedRef = useRef(false);
  const countryOptions = useMemo(() => {
    let displayNames: Intl.DisplayNames | null = null;
    try {
      displayNames = new Intl.DisplayNames([english ? 'en' : 'cs'], { type: 'region' });
    } catch {
      displayNames = null;
    }

    return COUNTRY_CODES
      .map((code) => ({ code, label: displayNames?.of(code) ?? code }))
      .sort((left, right) => left.label.localeCompare(right.label, english ? 'en' : 'cs'));
  }, [english]);
  const plans = useMemo(
    () => (audience === 'teachers' ? teacherPlansCs : schoolPlansCs).map((plan) => localizePlan(plan, english)),
    [audience, english],
  );
  const pricingStatus = english
    ? `${audience === 'teachers' ? 'Teacher plans shown' : 'School plans shown'}, ${billing === 'monthly' ? 'monthly billing' : 'annual billing'}, currency ${currency.toUpperCase()}.`
    : `${audience === 'teachers' ? 'Zobrazeny plány pro učitele' : 'Zobrazeny plány pro školy'}, ${billing === 'monthly' ? 'měsíční fakturace' : 'roční fakturace'}, měna ${currency.toUpperCase()}.`;

  useEffect(() => {
    if (pricingViewTrackedRef.current) return;
    pricingViewTrackedRef.current = true;
    trackEvent('pricing_view', { segment: 'teacher', billing_period: 'monthly' });
  }, []);

  useEffect(() => {
    if (checkoutResult === 'success') {
      trackEvent('checkout_complete', { source: billingAnalyticsSource });
    }
  }, [billingAnalyticsSource, checkoutResult]);

  useEffect(() => {
    if (
      checkoutResult !== 'success'
      || !liveCheckout
      || !checkoutSessionId
      || subscriptionActivationTrackedRef.current
    ) return;

    if (activePlanCode) {
      const storageKey = `syllonaut_subscription_activated:${checkoutSessionId}`;
      try {
        if (window.sessionStorage.getItem(storageKey) === '1') {
          subscriptionActivationTrackedRef.current = true;
          return;
        }
      } catch {
        // Analytics deduplication is best-effort and must never affect Pricing.
      }

      const sent = trackEvent('subscription_activated', {
        plan: activePlanCode,
        source: 'stripe_live',
      });
      if (sent) {
        subscriptionActivationTrackedRef.current = true;
        try {
          window.sessionStorage.setItem(storageKey, '1');
        } catch {
          // The event was sent; blocked storage only disables browser-side deduplication.
        }
      }
      return;
    }

    if (activationRefreshAttemptsRef.current >= 6) return;
    const timer = window.setTimeout(() => {
      activationRefreshAttemptsRef.current += 1;
      router.refresh();
    }, 750);

    return () => window.clearTimeout(timer);
  }, [activePlanCode, checkoutResult, checkoutSessionId, liveCheckout, router]);

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

    trackEvent('plan_select', {
      plan: plan.id,
      billing_period: billing,
      source: pricingAnalyticsSource,
    });

    if (publicPurchaseMode && !user) {
      window.location.assign(`/${locale}/pricing?signup=1#${plan.id}`);
      return;
    }

    setCheckoutPlan(plan);
    setCheckoutError('');
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
          environment: billingTestEnvironment,
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
        source: pricingAnalyticsSource,
      });
      window.location.assign(payload.url);
    } catch (error) {
      console.error('billing checkout start failed', error);
      const message = error instanceof Error ? error.message : '';
      setCheckoutError(
        message === 'active_subscription_exists'
          ? ui('Už máš aktivní předplatné. Spravovat ho můžeš přes zákaznický portál.', 'You already have an active subscription. You can manage it in the customer portal.')
          : message === 'billing_currency_migration_required'
            ? ui('Změna fakturační země nebo měny vyžaduje řízený převod předplatného. Kontaktuj podporu.', 'Changing billing country or currency requires a controlled subscription migration. Contact support.')
            : message && message !== 'checkout_creation_failed'
              ? `Stripe: ${message}`
              : publicPurchaseMode
                ? ui('Nákup se nepodařilo spustit. Zkus to prosím znovu.', 'The purchase could not be started. Please try again.')
                : ui('Testovací Checkout se nepodařilo spustit. Zkontroluj serverové nastavení Stripe.', 'The test Checkout could not be started. Check the server-side Stripe configuration.'),
      );
      setCheckoutBusy(false);
    }
  }

  async function openSandboxPortal() {
    if (portalBusy) return;
    setPortalBusy(true);
    setPortalError('');

    try {
      const response = await fetch('/api/billing/stripe/portal', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        cache: 'no-store',
        body: JSON.stringify({ environment: billingTestEnvironment }),
      });
      const payload = await response.json() as {
        url?: string;
        error?: string;
        diagnostics?: {
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
            : (payload.error ?? 'portal_creation_failed'),
        );
      }

      trackEvent('billing_portal_open', { source: pricingAnalyticsSource });
      window.location.assign(payload.url);
    } catch (error) {
      console.error('billing portal start failed', error);
      const message = error instanceof Error ? error.message : '';
      setPortalError(
        message && message !== 'portal_creation_failed'
          ? `Stripe: ${message}`
          : publicPurchaseMode
            ? ui('Zákaznický portál se nepodařilo otevřít. Zkus to prosím znovu.', 'The customer portal could not be opened. Please try again.')
            : ui('Testovací zákaznický portál se nepodařilo otevřít.', 'The test customer portal could not be opened.'),
      );
      setPortalBusy(false);
    }
  }

  const checkoutRoute = checkoutPlan ? billingRouteForCountry(checkoutCountry) : null;

  return (
    <main className={landing.page}>
      <header className={landing.header}>
        <Link href={`/${locale}`} className={landing.brand} aria-label={ui('Syllonaut – domů', 'Syllonaut – home')}>
          <SyllonautMark />
          <span>Syllonaut</span>
          <span className={landing.beta}>BETA</span>
        </Link>
        <nav className={landing.nav} aria-label={ui('Hlavní navigace', 'Main navigation')}>
          <Link href={`/${locale}#jak-to-funguje`}>{ui('Jak to funguje', 'How it works')}</Link>
          <Link href={`/${locale}/pricing`} aria-current="page">{ui('Ceník', 'Pricing')}</Link>
          {user ? <Link href="/lessons">{ui('Moje lekce', 'My lessons')}</Link> : null}
        </nav>
        <div className={landing.headerActions}>
          <LocaleSwitcher />
          <AuthControls
            onAuthChange={setUser}
            initialOpen={startSignup}
            initialMode={startSignup ? 'signup' : 'signin'}
          />
          <Link href="/new" className={landing.headerCta} style={{ whiteSpace: 'nowrap' }} onClick={() => trackEvent('prepare_lesson_cta_click', { location: 'pricing' })}>{ui('Připravit hodinu', 'Prepare a lesson')}</Link>
          <HeaderMobileNav signedIn={Boolean(user)} current="pricing" />
        </div>
      </header>

      <section className={styles.hero}>
        <span className={styles.eyebrow}>{english ? 'Pricing' : 'Pricing · Ceník'}</span>
        <h1>{ui('Začněte zdarma. Přidejte výkon, až ho budete potřebovat.', 'Start free. Add more capacity when you need it.')}</h1>
        <p>{ui(
          'Free stačí na vyzkoušení celého toku od přípravy po první živé použití každé lekce. Placené plány odemknou opakované používání lekcí bez omezení, větší AI kapacitu a lekce v libovolném jazyce; Teacher Pro navíc automatické AI hodnocení a organizaci lekcí do složek.',
          'Free is enough to try the full flow from preparation through the first live use of each lesson. Paid plans unlock unlimited repeated use of lessons, more AI capacity and lessons in any language; Teacher Pro also adds automatic AI grading and lesson folders.'
        )}</p>
      </section>

      {checkoutResult && (sandboxCheckoutEnabled || publicLiveBillingEnabled) ? (
        <div className={styles.checkoutNotice} role="status">
          {checkoutResult === 'success'
            ? (liveAcceptance
              ? ui('LIVE Checkout byl dokončen. Webhook nyní ověří skutečnou fakturační zemi a teprve potom může aktivovat tarif.', 'LIVE Checkout completed. The webhook will verify the actual billing country before it can activate the plan.')
              : publicPurchaseMode
                ? (activePlanCode
                  ? ui('Platba proběhla a placený tarif je aktivní.', 'Payment completed and your paid plan is active.')
                  : ui('Platba proběhla. Aktivaci tarifu právě ověřujeme.', 'Payment completed. We are verifying your plan activation now.'))
                : ui('Sandbox Checkout byl dokončen. Stav předplatného ověří webhook v databázi.', 'Sandbox Checkout completed. The webhook will verify the subscription state in the database.'))
            : ui('Nákup byl zrušen. Nic se nezměnilo.', 'The purchase was cancelled. Nothing changed.')}
        </div>
      ) : null}

      {publicPurchaseMode && user && activePlanCode ? (
        <section className={styles.sandboxTools} aria-label={ui('Správa předplatného', 'Subscription management')}>
          <div>
            <span className={styles.checkoutKicker}>{ui('Aktivní předplatné', 'Active subscription')}</span>
            <strong>{activePlanCode === 'teacher-pro' ? 'Teacher Pro' : 'Teacher'}</strong>
            <p>{ui('Tarif, fakturaci, platby, faktury i zrušení teď spravuješ na jednom místě v Syllonautu.', 'Manage your plan, billing period, payments, invoices and cancellation from one Syllonaut page.')}</p>
          </div>
          <Link className={styles.dialogSecondary} href={`/${locale}/subscription`}>
            {ui('Spravovat předplatné', 'Manage subscription')}
          </Link>
        </section>
      ) : null}

      {sandboxCheckoutEnabled && user ? (
        <section className={styles.sandboxTools} aria-label={liveAcceptance ? ui('LIVE acceptance předplatného', 'LIVE subscription acceptance') : ui('Sandbox správa předplatného', 'Sandbox subscription management')}>
          <div>
            <span className={styles.checkoutKicker}>{liveAcceptance ? 'Stripe LIVE acceptance' : 'Stripe sandbox'}</span>
            <strong>{liveAcceptance ? ui('Kontrolovaný ostrý test předplatného', 'Controlled live subscription test') : ui('Správa testovacího předplatného', 'Manage test subscription')}</strong>
            <p>{liveAcceptance
              ? ui('Tento režim vytváří skutečné platby. Je dostupný pouze adminovi během live acceptance.', 'This mode creates real payments. It is available only to the admin during live acceptance.')
              : ui('Platební metodu, faktury a zrušení testujeme přes Stripe Customer Portal.', 'Payment method, invoices and cancellation are tested through Stripe Customer Portal.')}</p>
          </div>
          <button
            type="button"
            className={styles.dialogSecondary}
            onClick={openSandboxPortal}
            disabled={portalBusy}
          >
            {portalBusy ? ui('Otevírám portál…', 'Opening portal…') : ui('Spravovat předplatné', 'Manage subscription')}
          </button>
          {portalError ? <div className={styles.sandboxToolsError} role="alert">{portalError}</div> : null}
        </section>
      ) : null}

      <section className={styles.controls} aria-label={ui('Nastavení ceníku', 'Pricing settings')}>
        <div className={styles.controlGroup}>
          <span>{ui('Typ předplatného', 'Subscription type')}</span>
          <div className={styles.segmented} role="group" aria-label={ui('Typ předplatného', 'Subscription type')}>
            <button type="button" className={audience === 'teachers' ? styles.selected : ''} aria-pressed={audience === 'teachers'} onClick={() => changeAudience('teachers')}>{ui('Pro učitele', 'For teachers')}</button>
            <button type="button" className={audience === 'schools' ? styles.selected : ''} aria-pressed={audience === 'schools'} onClick={() => changeAudience('schools')}>{ui('Pro školy', 'For schools')}</button>
          </div>
        </div>
        <div className={styles.controlGroup}>
          <span>{ui('Fakturace', 'Billing')}</span>
          <div className={styles.segmented} role="group" aria-label={ui('Fakturace', 'Billing')}>
            <button type="button" className={billing === 'monthly' ? styles.selected : ''} aria-pressed={billing === 'monthly'} onClick={() => changeBilling('monthly')}>{ui('Měsíčně', 'Monthly')}</button>
            <button type="button" className={billing === 'annual' ? styles.selected : ''} aria-pressed={billing === 'annual'} onClick={() => changeBilling('annual')}>{ui('Ročně', 'Annual')} <em>{ui('2 měsíce zdarma', '2 months free')}</em></button>
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
            checkoutEnabled={
              (sandboxCheckoutEnabled || publicPurchaseMode)
              && (plan.id === 'teacher' || plan.id === 'teacher-pro')
            }
            checkoutLabel={
              publicPurchaseMode
                ? (user ? ui('Vybrat plán', 'Choose plan') : ui('Přihlásit se a koupit', 'Sign in to buy'))
                : ui('Otestovat nákup', 'Test purchase')
            }
            onCheckout={openSandboxCheckout}
            english={english}
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
            aria-labelledby="billing-checkout-title"
          >
            <span className={styles.checkoutKicker}>{
              liveAcceptance
                ? 'Stripe LIVE acceptance'
                : publicPurchaseMode
                  ? ui('Bezpečná platba přes Stripe', 'Secure payment with Stripe')
                  : 'Stripe sandbox'
            }</span>
            <h2 id="billing-checkout-title">{
              liveAcceptance
                ? ui('Ostrý test', 'Live test')
                : publicPurchaseMode
                  ? ui('Vybrat', 'Choose')
                  : ui('Otestovat', 'Test')
            } {checkoutPlan.name}</h2>
            <p>{liveAcceptance
              ? ui(
                'Jde o skutečnou platbu. Vyber očekávanou fakturační zemi; po dokončení Stripe Checkout Syllonaut serverově ověří zemi, kterou Checkout skutečně vrátil, a při nesouladu tarif neaktivuje.',
                'This is a real payment. Choose the expected billing country; after Stripe Checkout completes, Syllonaut will verify the country actually returned by Checkout and will not activate the plan if the route does not match.'
              )
              : publicPurchaseMode
                ? ui(
                  'Vyber fakturační zemi. Podle ní zvolíme měnu a způsob zpracování platby; samotná platba proběhne bezpečně ve Stripe Checkout.',
                  'Choose your billing country. We will use it to select the currency and payment-processing route; payment itself is completed securely in Stripe Checkout.'
                )
                : ui(
                  'Vyber fakturační zemi. Syllonaut podle ní zvolí měnu a způsob zpracování platby. Ve Stripe Checkout pak použij stejnou fakturační zemi.',
                  'Choose the billing country. Syllonaut will use it to select the currency and payment-processing route. Use the same billing country in Stripe Checkout.'
                )}</p>

            <label className={styles.checkoutField}>
              {ui('Fakturační země', 'Billing country')}
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
              <span>{ui('Měna', 'Currency')}</span>
              <strong>{checkoutRoute.currency.toUpperCase()}</strong>
              <span>{ui('Zpracování', 'Processing')}</span>
              <strong>{checkoutRoute.managedPayments ? 'Managed Payments' : ui('Standardní Stripe', 'Standard Stripe')}</strong>
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
                {ui('Zrušit', 'Cancel')}
              </button>
              <button
                type="button"
                className={styles.activeCta}
                onClick={startSandboxCheckout}
                disabled={checkoutBusy}
              >
                {checkoutBusy ? ui('Otevírám Stripe…', 'Opening Stripe…') : ui('Pokračovat do Stripe', 'Continue to Stripe')}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      <section className={styles.notes}>
        <div>
          <span className={styles.noteIndex}>01</span>
          <strong>{ui('Měsíční limity se obnovují každý kalendářní měsíc.', 'Monthly limits reset every calendar month.')}</strong>
          <p>{ui('U školních plánů má každý učitel vlastní účet. AI lekce a úpravy se čerpají ze společného limitu pracovního prostoru školy.', 'On school plans, every teacher has their own account. AI lessons and edits use the school workspace’s shared allowance.')}</p>
        </div>
        <div>
          <span className={styles.noteIndex}>02</span>
          <strong>{ui('Teacher a Teacher Pro jsou aktivní.', 'Teacher and Teacher Pro are live.')}</strong>
          <p>{ui('Individuální předplatné lze koupit přímo přes Stripe. Školní tarify zatím zůstávají ve fázi přípravy.', 'Individual subscriptions can be purchased directly through Stripe. School plans are still being prepared.')}</p>
        </div>
        <div>
          <span className={styles.noteIndex}>03</span>
          <strong>{ui('Školní správa se ještě připravuje.', 'School administration is still being prepared.')}</strong>
          <p>{ui('U školních plánů nyní zveřejňujeme kapacitu, společné AI limity a ceny; detail týmové správy doplníme před spuštěním.', 'For school plans, we currently show capacity, shared AI allowances and pricing; detailed team administration will be added before launch.')}</p>
        </div>
      </section>

      <SiteFooter />
    </main>
  );
}
