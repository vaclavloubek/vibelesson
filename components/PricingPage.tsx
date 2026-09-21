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
import { AI_GRADING_ALLOWANCES, INDIVIDUAL_PLAN_ALLOWANCES, pricingPagePrice } from '@/lib/individual-billing-catalog';
import { TERMS_ACCEPTANCE_KEY } from '@/lib/legal';
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
      '3 nové AI lekce za měsíc',
      '2 importy nebo kopie lekcí za měsíc',
      '10 AI úprav za měsíc',
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
    description: 'Pro pravidelnou výuku: nové lekce tvoříte s AI, hotové pak učíte opakovaně bez omezení.',
    price: pricingPagePrice('teacher'),
    features: [
      `${INDIVIDUAL_PLAN_ALLOWANCES.teacher.lessonGenerations} nových AI lekcí za měsíc`,
      `${INDIVIDUAL_PLAN_ALLOWANCES.teacher.aiEdits} AI úprav za měsíc`,
      'Lekce v libovolném jazyce',
      'Opakované používání lekcí bez omezení',
      'Živé spuštění hotové lekce nespotřebovává AI limit',
      'Studenti se připojují bez plnohodnotného účtu',
      'Automatické bodování kvízů',
      'Ruční hodnocení otevřených a týmových odpovědí',
    ],
    featured: true,
  },
  {
    id: 'teacher-pro',
    name: 'Teacher Pro',
    description: 'Pro intenzivní práci s lekcemi, AI hodnocením, pracovními listy a organizací výuky.',
    price: pricingPagePrice('teacher_pro'),
    features: [
      `${INDIVIDUAL_PLAN_ALLOWANCES.teacher_pro.lessonGenerations} nových AI lekcí za měsíc`,
      `${INDIVIDUAL_PLAN_ALLOWANCES.teacher_pro.aiEdits} AI úprav za měsíc`,
      'Lekce v libovolném jazyce',
      'Pracovní listy z každé lekce · tisk a PDF',
      `${AI_GRADING_ALLOWANCES.teacher_pro} AI hodnocení bodovaných otevřených, týmových a exit-ticket odpovědí za období`,
      'Ochrana proti nepovolenému využití AI ve studentských odpovědích',
      'Složky a podsložky pro organizaci lekcí',
      'Opakované používání lekcí bez omezení',
      'Živé spuštění hotové lekce nespotřebovává AI limit',
      'Studenti se připojují bez plnohodnotného účtu',
    ],
  },
];

const schoolPlansCs: Plan[] = [
  {
    id: 'team',
    name: 'Team',
    description: 'Pro menší tým, který chce připravovat, učit i vyhodnocovat v jednom nástroji.',
    price: { monthlyCzk: 890, annualCzk: 8900, monthlyEur: 37.99, annualEur: 379.9, monthlyUsd: 39.99, annualUsd: 399 },
    features: [
      'Celý tok: AI příprava → živá hodina → vyhodnocení',
      'Až 10 učitelů',
      'Samostatný účet pro každého učitele',
      '40 nových AI lekcí za měsíc společně',
      '80 AI úprav za měsíc společně',
      'Lekce v libovolném jazyce',
      'Opakované používání lekcí bez omezení',
      'Živé spuštění hotové lekce nespotřebovává AI limit',
      'Sdílený měsíční AI limit pro celý tým',
    ],
  },
  {
    id: 'school',
    name: 'School',
    description: 'Pro školu, která chce sjednotit AI přípravu, živou výuku a vyhodnocení napříč sborem.',
    price: { monthlyCzk: 2390, annualCzk: 23900, monthlyEur: 99.99, annualEur: 999.9, monthlyUsd: 109.99, annualUsd: 1099 },
    features: [
      'Celý tok: AI příprava → živá hodina → vyhodnocení',
      'Až 30 učitelů',
      'Samostatný účet pro každého učitele',
      '120 nových AI lekcí za měsíc společně',
      '240 AI úprav za měsíc společně',
      'Lekce v libovolném jazyce',
      'Pracovní listy z každé lekce · tisk a PDF',
      `${AI_GRADING_ALLOWANCES.school} AI hodnocení bodovaných otevřených, týmových a exit-ticket odpovědí za měsíc společně`,
      'Ochrana proti nepovolenému využití AI ve studentských odpovědích',
      'Složky a podsložky pro organizaci lekcí',
      'Opakované používání lekcí bez omezení',
      'Živé spuštění hotové lekce nespotřebovává AI limit',
      'Sdílená knihovna lekcí',
      'Licenční zámek školních lekcí',
      'Sdílený měsíční AI limit pro celou školu',
    ],
    featured: true,
  },
  {
    id: 'campus',
    name: 'Campus',
    description: 'Pro velkou školu nebo instituci, která chce jeden společný workflow pro více týmů a pracovišť.',
    price: { monthlyCzk: 5990, annualCzk: 59900, monthlyEur: 249.99, annualEur: 2499.9, monthlyUsd: 269.99, annualUsd: 2699 },
    features: [
      'Celý tok: AI příprava → živá hodina → vyhodnocení',
      'Až 100 učitelů',
      'Samostatný účet pro každého učitele',
      '300 nových AI lekcí za měsíc společně',
      '600 AI úprav za měsíc společně',
      'Lekce v libovolném jazyce',
      'Pracovní listy z každé lekce · tisk a PDF',
      `${AI_GRADING_ALLOWANCES.campus} AI hodnocení bodovaných otevřených, týmových a exit-ticket odpovědí za měsíc společně`,
      'Ochrana proti nepovolenému využití AI ve studentských odpovědích',
      'Složky a podsložky pro organizaci lekcí',
      'Opakované používání lekcí bez omezení',
      'Živé spuštění hotové lekce nespotřebovává AI limit',
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
      '3 new AI lessons per month',
      '2 lesson imports or copies per month',
      '10 AI edits per month',
      'Each lesson can be used live once',
      'Archived lessons remain editable manually and with AI',
      'Students join without a full account',
      'Automatic quiz scoring',
      'Manual grading of open and team responses',
    ],
  },
  teacher: {
    description: 'For regular teaching: create new lessons with AI, then teach the finished lessons again without limits.',
    features: [
      `${INDIVIDUAL_PLAN_ALLOWANCES.teacher.lessonGenerations} new AI lessons per month`,
      `${INDIVIDUAL_PLAN_ALLOWANCES.teacher.aiEdits} AI edits per month`,
      'Lessons in any language',
      'Unlimited repeated use of lessons',
      'Running a finished lesson live does not use the AI allowance',
      'Students join without a full account',
      'Automatic quiz scoring',
      'Manual grading of open and team responses',
    ],
  },
  'teacher-pro': {
    description: 'For intensive lesson work with AI grading, worksheets and organisation tools.',
    features: [
      `${INDIVIDUAL_PLAN_ALLOWANCES.teacher_pro.lessonGenerations} new AI lessons per month`,
      `${INDIVIDUAL_PLAN_ALLOWANCES.teacher_pro.aiEdits} AI edits per month`,
      'Lessons in any language',
      'Printable worksheets from every lesson · print & PDF',
      `AI grading of scored open, team and exit-ticket responses · ${AI_GRADING_ALLOWANCES.teacher_pro} per allowance period`,
      'Protection against unauthorized AI use in student responses',
      'Folders and subfolders for organising lessons',
      'Unlimited repeated use of lessons',
      'Running a finished lesson live does not use the AI allowance',
      'Students join without a full account',
    ],
  },
  team: {
    description: 'For a small team that wants to prepare, teach and evaluate in one tool.',
    features: [
      'Full workflow: AI preparation → live lesson → evaluation',
      'Up to 10 teachers',
      'A separate account for every teacher',
      '40 new AI lessons per month shared',
      '80 AI edits per month shared',
      'Lessons in any language',
      'Unlimited repeated use of lessons',
      'Running a finished lesson live does not use the AI allowance',
      'Shared monthly AI allowance for the whole team',
    ],
  },
  school: {
    description: 'For schools that want one workflow for AI preparation, live teaching and evaluation across staff.',
    features: [
      'Full workflow: AI preparation → live lesson → evaluation',
      'Up to 30 teachers',
      'A separate account for every teacher',
      '120 new AI lessons per month shared',
      '240 AI edits per month shared',
      'Lessons in any language',
      'Printable worksheets from every lesson · print & PDF',
      `AI grading of scored open, team and exit-ticket responses · ${AI_GRADING_ALLOWANCES.school} per month shared`,
      'Protection against unauthorized AI use in student responses',
      'Folders and subfolders for organising lessons',
      'Unlimited repeated use of lessons',
      'Running a finished lesson live does not use the AI allowance',
      'Shared lesson library',
      'School lesson license lock',
      'Shared monthly AI allowance for the whole school',
    ],
  },
  campus: {
    description: 'For large schools or institutions that want one shared workflow across teams and sites.',
    features: [
      'Full workflow: AI preparation → live lesson → evaluation',
      'Up to 100 teachers',
      'A separate account for every teacher',
      '300 new AI lessons per month shared',
      '600 AI edits per month shared',
      'Lessons in any language',
      'Printable worksheets from every lesson · print & PDF',
      `AI grading of scored open, team and exit-ticket responses · ${AI_GRADING_ALLOWANCES.campus} per month shared`,
      'Protection against unauthorized AI use in student responses',
      'Folders and subfolders for organising lessons',
      'Unlimited repeated use of lessons',
      'Running a finished lesson live does not use the AI allowance',
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

const czk = new Intl.NumberFormat('cs-CZ', { maximumFractionDigits: 2 });

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
  schoolCheckoutHref,
  onCheckout,
  english,
}: {
  plan: Plan;
  billing: Billing;
  currency: BillingCurrency;
  checkoutEnabled: boolean;
  checkoutLabel: string;
  schoolCheckoutHref: string | null;
  onCheckout: (plan: Plan) => void;
  english: boolean;
}) {
  const annual = billing === 'annual';
  const primary = priceValue(plan, billing, currency);
  const annualPrice = priceValue(plan, 'annual', currency);
  const monthlyEquivalent = plan.free ? 0 : Math.round((annualPrice / 12) * 100) / 100;

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
            || feature.startsWith('Celý tok')
            || feature.startsWith('Full workflow')
            || worksheetHook
            || unlimitedReuseHook
            || feature.startsWith('AI hodnocení')
            || feature.startsWith('Ochrana proti nepovolenému využití AI')
            || feature.startsWith('Složky a podsložky')
            || feature === 'Sdílená knihovna lekcí'
            || feature.startsWith('AI grading')
            || feature.startsWith('Protection against unauthorized AI use')
            || feature.startsWith('Folders and subfolders')
            || feature === 'Shared lesson library';
          return <li key={feature} className={premiumHook ? styles.premiumFeature : undefined}>{feature}{worksheetHook ? <span className={styles.newFeatureBadge}>{english ? 'NEW' : 'NOVĚ'}</span> : null}</li>;
        })}
      </ul>

      {plan.free ? (
        <a className={styles.activeCta} href={english ? '/en/pricing?signup=1' : '/cs/pricing?signup=1'} onClick={() => trackEvent('free_signup_click', { location: 'pricing' })}>{english ? 'Create Free account' : 'Vytvořit Free účet'}</a>
      ) : schoolCheckoutHref ? (
        <Link
          className={styles.activeCta}
          href={schoolCheckoutHref}
          onClick={() => {
            if (plan.id !== 'team' && plan.id !== 'school' && plan.id !== 'campus') return;
            trackEvent('plan_select', {
              plan: plan.id,
              billing_period: billing,
              source: 'pricing_school_live',
            });
          }}
        >
          {english ? 'Choose plan' : 'Vybrat plán'}
        </Link>
      ) : checkoutEnabled && (plan.id === 'teacher' || plan.id === 'teacher-pro') ? (
        <button type="button" className={styles.activeCta} onClick={() => onCheckout(plan)}>{checkoutLabel}</button>
      ) : (
        <button type="button" className={styles.disabledCta} disabled>{english ? 'Temporarily unavailable' : 'Dočasně nedostupné'}</button>
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
  publicSchoolBillingEnabled = false,
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
  publicSchoolBillingEnabled?: boolean;
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
  const [checkoutTermsAccepted, setCheckoutTermsAccepted] = useState(false);
  const [immediatePerformanceRequested, setImmediatePerformanceRequested] = useState(false);
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

    setCheckoutTermsAccepted(false);
    setImmediatePerformanceRequested(false);
    setCheckoutPlan(plan);
    setCheckoutError('');
  }

  async function startSandboxCheckout() {
    if (!checkoutPlan || checkoutBusy) return;
    if (!checkoutTermsAccepted || !immediatePerformanceRequested) {
      setCheckoutError(ui('Před objednáním potvrď obchodní podmínky i žádost o okamžité zahájení služby.', 'Before ordering, accept the Terms and request immediate start of the service.'));
      return;
    }
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
          termsAccepted: true,
          immediatePerformanceRequested: true,
          termsVersion: TERMS_ACCEPTANCE_KEY,
          locale,
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
        <h1>{ui('Od nápadu až po odučenou hodinu. V jednom tarifu.', 'From idea to a lesson taught live. In one plan.')}</h1>
        <p>{ui(
          'AI lekci připraví a upraví. Vy ji spustíte, studenti se připojí, Syllonaut sbírá odpovědi a pomůže s vyhodnocením. Free ukáže celý tok; placené tarify přidávají vyšší AI kapacitu, opakované používání a pokročilé nástroje.',
          'AI prepares and refines the lesson. You launch it, students join, Syllonaut collects responses and helps with evaluation. Free shows the full workflow; paid plans add more AI capacity, repeated use and advanced tools.'
        )}</p>
      </section>

      <section className={styles.valueFlow} aria-label={ui('Celý proces v Syllonautu', 'The full Syllonaut workflow')}>
        {[
          [ui('01 · Zadání', '01 · Brief'), ui('Řeknete, co chcete učit.', 'Tell us what you want to teach.')],
          [ui('02 · AI příprava', '02 · AI preparation'), ui('Vznikne celá interaktivní lekce.', 'A complete interactive lesson is created.')],
          [ui('03 · Živá hodina', '03 · Live lesson'), ui('Studenti se připojí a vy řídíte průběh.', 'Students join and you lead the session.')],
          [ui('04 · Vyhodnocení', '04 · Evaluation'), ui('Odpovědi a výsledky zůstávají na jednom místě.', 'Responses and results stay in one place.')],
        ].map(([title, body]) => (
          <div key={title}>
            <span>{title}</span>
            <strong>{body}</strong>
          </div>
        ))}
      </section>

      <p className={styles.usagePromise}>{ui(
        'Jedna AI lekce není jednorázový materiál. AI limit se čerpá jen při nové tvorbě a AI úpravách; hotové lekce můžete v placených tarifech spouštět a učit znovu bez omezení.',
        'An AI lesson is not a one-off material. The AI allowance is used only for new creation and AI edits; finished lessons can be launched and taught repeatedly without limits on paid plans.'
      )}</p>

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
            schoolCheckoutHref={
              publicSchoolBillingEnabled
              && (plan.id === 'team' || plan.id === 'school' || plan.id === 'campus')
                ? `/school?plan=${plan.id}&billing=${billing}`
                : null
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

            <label className={styles.checkoutField} style={{ display: 'flex', flexDirection: 'row', alignItems: 'flex-start', gap: 10 }}>
              <input
                type="checkbox"
                checked={checkoutTermsAccepted}
                onChange={(event) => { setCheckoutTermsAccepted(event.target.checked); setCheckoutError(''); }}
                disabled={checkoutBusy}
                style={{ marginTop: 3, width: 'auto' }}
              />
              <span>
                {ui('Souhlasím s ', 'I agree to the ')}
                <Link href={`/${locale}/terms`} target="_blank">{ui('obchodními podmínkami', 'Terms of Service')}</Link>
                {ui(' a seznámil(a) jsem se s ', ' and I have read the ')}
                <Link href={`/${locale}/gdpr`} target="_blank">{ui('ochranou osobních údajů', 'Privacy Notice')}</Link>.
              </span>
            </label>

            <label className={styles.checkoutField} style={{ display: 'flex', flexDirection: 'row', alignItems: 'flex-start', gap: 10 }}>
              <input
                type="checkbox"
                checked={immediatePerformanceRequested}
                onChange={(event) => { setImmediatePerformanceRequested(event.target.checked); setCheckoutError(''); }}
                disabled={checkoutBusy}
                style={{ marginTop: 3, width: 'auto' }}
              />
              <span>{ui(
                'Výslovně žádám, aby služba začala ihned, tedy ještě před uplynutím 14 dnů pro odstoupení. Beru na vědomí, že při odstoupení mohu hradit poměrnou část ceny za plnění poskytnuté do odstoupení.',
                'I expressly request that the service start immediately, before the 14-day withdrawal period expires. I understand that if I withdraw, I may have to pay a proportionate amount for the service supplied before withdrawal.'
              )}</span>
            </label>

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
                disabled={checkoutBusy || !checkoutTermsAccepted || !immediatePerformanceRequested}
              >
                {checkoutBusy ? ui('Otevírám Stripe…', 'Opening Stripe…') : ui('Objednat a zaplatit přes Stripe', 'Order and pay via Stripe')}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      <section className={styles.notes}>
        <div>
          <span className={styles.noteIndex}>01</span>
          <strong>{ui('AI limity jsou oddělené a předvídatelné.', 'AI allowances are separate and predictable.')}</strong>
          <p>{audience === 'teachers'
            ? ui(
              'Kvóta pro nové AI lekce a AI úpravy je oddělená od kvóty AI hodnocení. U Free se limity tvorby obnovují na začátku kalendářního měsíce; u Teacher a Teacher Pro podle fakturačního cyklu, u ročního předplatného po měsíčních intervalech od data začátku předplatného. Teacher Pro má navíc 60 AI hodnocení ve stejném období. Přesné zbývající počty i datum další obnovy vidíš v účtu. Spuštění a opakované použití hotových lekcí tyto kvóty nespotřebovává.',
              'The allowance for new AI lessons and AI edits is separate from the AI grading allowance. Free creation allowances reset at the start of each calendar month; Teacher and Teacher Pro reset with the billing cycle, with annual subscriptions using monthly intervals anchored to the subscription start date. Teacher Pro also includes 60 AI gradings in the same allowance period. Your account shows the exact remaining counts and next reset date. Launching and reusing finished lessons does not consume these allowances.',
            )
            : ui(
              'U Team, School a Campus se společné AI kvóty pracovního prostoru školy / organizace obnovují na začátku každého kalendářního měsíce. School má navíc 300 a Campus 750 AI hodnocení měsíčně společně. AI hodnocení má vlastní kvótu a nesnižuje počet nových lekcí ani AI úprav.',
              'On Team, School and Campus, shared workspace AI allowances reset at the start of each calendar month. School also includes 300 and Campus 750 shared AI gradings per month. AI grading has its own allowance and does not reduce the lesson-generation or AI-edit allowances.',
            )}</p>
        </div>
        <div>
          <span className={styles.noteIndex}>02</span>
          <strong>{ui('Individuální i školní tarify jsou aktivní.', 'Individual and school plans are live.')}</strong>
          <p>{ui('Teacher a Teacher Pro lze koupit přímo přes Stripe. Team, School a Campus lze objednat včetně školní správy, platby kartou nebo na fakturu.', 'Teacher and Teacher Pro can be purchased directly through Stripe. Team, School and Campus can be ordered with school administration, by card or invoice.')}</p>
        </div>
        <div>
          <span className={styles.noteIndex}>03</span>
          <strong>{ui('Školní správa je součástí licence.', 'School administration is included.')}</strong>
          <p>{ui('Vlastník a administrátoři spravují členy, pozvánky, společný AI limit i fakturaci. School a Campus navíc obsahují sdílenou knihovnu lekcí.', 'Owners and administrators manage members, invitations, the shared AI allowance and billing. School and Campus also include a shared lesson library.')}</p>
        </div>
      </section>

      <SiteFooter />
    </main>
  );
}
