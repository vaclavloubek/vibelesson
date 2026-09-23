import type { Metadata } from 'next';
import Link from 'next/link';
import { headers } from 'next/headers';
import HeaderMobileNav from '@/components/HeaderMobileNav';
import LocaleSwitcher from '@/components/LocaleSwitcher';
import PublicHeaderAccountMenu from '@/components/PublicHeaderAccountMenu';
import SiteFooter from '@/components/SiteFooter';
import SyllonautMark from '@/components/SyllonautMark';
import { LOCALE_REQUEST_HEADER, normalizeUiLocale } from '@/lib/i18n';
import { createClient } from '@/lib/supabase/server';
import { TECHNICAL_REQUIREMENTS } from '@/lib/technical-requirements';
import landing from '@/components/LandingPage.module.css';
import styles from '@/app/gdpr/GdprPage.module.css';

export async function generateMetadata(): Promise<Metadata> {
  const requestHeaders = await headers();
  const locale = normalizeUiLocale(requestHeaders.get(LOCALE_REQUEST_HEADER)) ?? 'cs';
  const english = locale === 'en';
  return {
    title: english ? 'Technical requirements — Syllonaut' : 'Technické požadavky — Syllonaut',
    description: english
      ? 'Supported browsers, devices, cookies, network and file formats for Syllonaut.'
      : 'Podporované prohlížeče, zařízení, cookies, síť a formáty souborů pro Syllonaut.',
    alternates: {
      canonical: `/${locale}/requirements`,
      languages: { cs: '/cs/requirements', en: '/en/requirements', 'x-default': '/en/requirements' },
    },
    robots: { index: true, follow: true },
  };
}

export default async function RequirementsPage() {
  const requestHeaders = await headers();
  const locale = normalizeUiLocale(requestHeaders.get(LOCALE_REQUEST_HEADER)) ?? 'cs';
  const english = locale === 'en';
  const ui = (cs: string, en: string) => english ? en : cs;

  const supabase = await createClient();
  const { data: claimsData } = await supabase.auth.getClaims();
  const userId = typeof claimsData?.claims?.sub === 'string' ? claimsData.claims.sub : null;
  const accountUser = userId ? {
    id: userId,
    email: typeof claimsData?.claims?.email === 'string' ? claimsData.claims.email : undefined,
    user_metadata: claimsData?.claims?.user_metadata && typeof claimsData.claims.user_metadata === 'object'
      ? claimsData.claims.user_metadata as Record<string, unknown>
      : {},
  } : null;

  return (
    <main className={landing.page}>
      <header className={landing.header}>
        <Link href={`/${locale}`} className={landing.brand} aria-label={ui('Syllonaut – domů', 'Syllonaut – home')}>
          <SyllonautMark /><span>Syllonaut</span><span className={landing.beta}>BETA</span>
        </Link>
        <nav className={landing.nav} aria-label={ui('Hlavní navigace', 'Main navigation')}>
          <Link href={`/${locale}#jak-to-funguje`}>{ui('Jak to funguje', 'How it works')}</Link>
          <Link href={`/${locale}/pricing`}>{ui('Ceník', 'Pricing')}</Link>
          {accountUser ? <Link href="/lessons">{ui('Moje lekce', 'My lessons')}</Link> : null}
        </nav>
        <div className={landing.headerActions}>
          <LocaleSwitcher />
          {accountUser ? <PublicHeaderAccountMenu user={accountUser} /> : null}
          <Link href="/new" className={landing.headerCta} style={{ whiteSpace: 'nowrap' }}>{ui('Připravit hodinu', 'Prepare a lesson')}</Link>
          <HeaderMobileNav signedIn={Boolean(accountUser)} current="home" />
        </div>
      </header>

      <article className={styles.page}>
        <div className={styles.hero}>
          <span className={styles.eyebrow}>{ui('Před nákupem', 'Before you buy')}</span>
          <h1>{ui('Technické požadavky', 'Technical requirements')}</h1>
          <p>{ui(
            'Co Syllonaut potřebuje, aby fungoval: podporované prohlížeče a zařízení, cookies, připojení a formáty souborů. Doporučujeme si vše ověřit ve Free tarifu ještě před placenou objednávkou.',
            'What Syllonaut needs to work: supported browsers and devices, cookies, connectivity and file formats. We recommend checking everything on the Free plan before placing a paid order.',
          )}</p>
        </div>

        {TECHNICAL_REQUIREMENTS[locale].map((section) => (
          <section key={section.title}>
            <h2>{section.title}</h2>
            <ul>{section.items.map((item) => <li key={item}>{item}</li>)}</ul>
          </section>
        ))}

        <section>
          <h2>{ui('Související dokumenty', 'Related documents')}</h2>
          <p>
            <Link href={`/${locale}/pricing`}>{ui('Ceník', 'Pricing')}</Link>
            {' · '}
            <Link href={`/${locale}/terms`}>{ui('Obchodní podmínky', 'Terms of Service')}</Link>
            {' · '}
            <Link href={`/${locale}/gdpr`}>{ui('Ochrana osobních údajů (GDPR)', 'Privacy Notice')}</Link>
          </p>
        </section>
      </article>
      <SiteFooter />
    </main>
  );
}
