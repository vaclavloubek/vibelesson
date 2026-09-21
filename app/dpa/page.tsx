import type { Metadata } from 'next';
import Link from 'next/link';
import { headers } from 'next/headers';
import HeaderMobileNav from '@/components/HeaderMobileNav';
import LocaleSwitcher from '@/components/LocaleSwitcher';
import PublicHeaderAccountMenu from '@/components/PublicHeaderAccountMenu';
import SiteFooter from '@/components/SiteFooter';
import SyllonautMark from '@/components/SyllonautMark';
import { DPA_DOCUMENT } from '@/lib/dpa-document';
import { LOCALE_REQUEST_HEADER, normalizeUiLocale } from '@/lib/i18n';
import { createClient } from '@/lib/supabase/server';
import landing from '@/components/LandingPage.module.css';
import styles from '@/app/gdpr/GdprPage.module.css';

export async function generateMetadata(): Promise<Metadata> {
  const requestHeaders = await headers();
  const locale = normalizeUiLocale(requestHeaders.get(LOCALE_REQUEST_HEADER)) ?? 'cs';
  const english = locale === 'en';
  return {
    title: english ? 'Data Processing Addendum — Syllonaut' : 'Zpracovatelská smlouva (DPA) — Syllonaut',
    description: english
      ? 'Article 28 GDPR Data Processing Addendum for organisations using Syllonaut Team, School or Campus.'
      : 'Smlouva o zpracování osobních údajů podle čl. 28 GDPR pro organizace využívající Syllonaut Team, School nebo Campus.',
    alternates: {
      canonical: `/${locale}/dpa`,
      languages: { cs: '/cs/dpa', en: '/en/dpa', 'x-default': '/en/dpa' },
    },
    robots: { index: true, follow: true },
  };
}

export default async function DpaPage() {
  const requestHeaders = await headers();
  const locale = normalizeUiLocale(requestHeaders.get(LOCALE_REQUEST_HEADER)) ?? 'cs';
  const english = locale === 'en';
  const ui = (cs: string, en: string) => english ? en : cs;
  const document = DPA_DOCUMENT[locale];

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
          <span className={styles.eyebrow}>{document.eyebrow}</span>
          <h1>{document.title}</h1>
          <p>{document.intro}</p>
          <div className={styles.meta}>{document.versionLabel}</div>
        </div>

        {document.sections.map((section) => (
          <section key={section.title}>
            <h2>{section.title}</h2>
            {section.paragraphs?.map((paragraph) => <p key={paragraph}>{paragraph}</p>)}
            {section.bullets?.length ? (
              <ul>{section.bullets.map((bullet) => <li key={bullet}>{bullet}</li>)}</ul>
            ) : null}
            {section.table ? (
              <div className={styles.tableWrap}>
                <table>
                  <thead>
                    <tr>{section.table.headers.map((header) => <th key={header}>{header}</th>)}</tr>
                  </thead>
                  <tbody>
                    {section.table.rows.map((row) => (
                      <tr key={row[0]}>
                        <td><strong>{row[0]}</strong></td>
                        <td>{row[1]}</td>
                        <td>{row[2]}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : null}
          </section>
        ))}

        <section>
          <h2>{ui('Kontakt pro ochranu osobních údajů', 'Data-protection contact')}</h2>
          <p><a href="mailto:vaclav@syllonaut.com">vaclav@syllonaut.com</a></p>
          <p>{ui('Související informace najdete také v ', 'Related information is also available in the ')}
            <Link href={`/${locale}/gdpr`}>{ui('Privacy Notice', 'Privacy Notice')}</Link>.
          </p>
        </section>
      </article>
      <SiteFooter />
    </main>
  );
}
