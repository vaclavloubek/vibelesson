import type { Metadata } from 'next';
import Link from 'next/link';
import { headers } from 'next/headers';
import HeaderMobileNav from '@/components/HeaderMobileNav';
import LocaleSwitcher from '@/components/LocaleSwitcher';
import PublicHeaderAccountMenu from '@/components/PublicHeaderAccountMenu';
import SiteFooter from '@/components/SiteFooter';
import SyllonautMark from '@/components/SyllonautMark';
import { LOCALE_REQUEST_HEADER, normalizeUiLocale } from '@/lib/i18n';
import { TERMS_VERSION } from '@/lib/legal';
import { renderTermsDocumentBodyHtml } from '@/lib/terms-document';
import { createClient } from '@/lib/supabase/server';
import landing from '@/components/LandingPage.module.css';
import styles from '@/app/gdpr/GdprPage.module.css';

export async function generateMetadata(): Promise<Metadata> {
  const requestHeaders = await headers();
  const locale = normalizeUiLocale(requestHeaders.get(LOCALE_REQUEST_HEADER)) ?? 'cs';
  const english = locale === 'en';
  return {
    title: english ? 'Terms of Service — Syllonaut' : 'Obchodní podmínky — Syllonaut',
    description: english
      ? 'Terms governing Syllonaut accounts, subscriptions, payments, use of AI features and consumer rights.'
      : 'Podmínky používání Syllonautu, účtů, předplatného, plateb, AI funkcí a práva spotřebitelů.',
    alternates: {
      canonical: `/${locale}/terms`,
      languages: { cs: '/cs/terms', en: '/en/terms', 'x-default': '/en/terms' },
    },
    robots: { index: true, follow: true },
  };
}

export default async function TermsPage() {
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
        <Link href={`/${locale}`} className={landing.brand} aria-label={ui('Syllonaut – domů', 'Syllonaut – home')}><SyllonautMark /><span>Syllonaut</span><span className={landing.beta}>BETA</span></Link>
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
          <span className={styles.eyebrow}>{ui('Právní informace', 'Legal')}</span>
          <h1>{ui('Obchodní podmínky', 'Terms of Service')}</h1>
          <p>{ui(
            'Tyto podmínky upravují používání služby Syllonaut, bezplatné účty i placené tarify pro jednotlivce a organizace.',
            'These Terms govern use of Syllonaut, including Free accounts and paid plans for individuals and organizations.'
          )}</p>
          <div className={styles.meta}>{ui(
            `Verze ${TERMS_VERSION} · účinná od 21. 9. 2026`,
            `Version ${TERMS_VERSION} · effective 21 September 2026`
          )}</div>
        </div>

        <div dangerouslySetInnerHTML={{ __html: renderTermsDocumentBodyHtml(locale) }} />
      </article>
      <SiteFooter />
    </main>
  );
}
