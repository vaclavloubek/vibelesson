import type { Metadata } from 'next';
import Link from 'next/link';
import { headers } from 'next/headers';
import HeaderMobileNav from '@/components/HeaderMobileNav';
import LocaleSwitcher from '@/components/LocaleSwitcher';
import PublicHeaderAccountMenu from '@/components/PublicHeaderAccountMenu';
import SiteFooter from '@/components/SiteFooter';
import SyllonautMark from '@/components/SyllonautMark';
import { getDpaDocument } from '@/lib/dpa-document';
import { LOCALE_REQUEST_HEADER, normalizeUiLocale } from '@/lib/i18n';
import { createClient } from '@/lib/supabase/server';
import landing from '@/components/LandingPage.module.css';
import styles from '@/app/gdpr/GdprPage.module.css';

export async function generateMetadata(): Promise<Metadata> {
  const requestHeaders = await headers();
  const locale = normalizeUiLocale(requestHeaders.get(LOCALE_REQUEST_HEADER)) ?? 'cs';
  const english = locale === 'en';
  return {
    title: english ? 'Data Processing Agreement — Syllonaut' : 'Smlouva o zpracování osobních údajů — Syllonaut',
    description: english
      ? 'Syllonaut Data Processing Agreement for Team, School and Campus organisations under Article 28 GDPR.'
      : 'Zpracovatelská smlouva Syllonautu pro organizace Team, School a Campus podle čl. 28 GDPR.',
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
  const document = getDpaDocument(locale);

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

  const effectiveDate = new Intl.DateTimeFormat(english ? 'en-GB' : 'cs-CZ').format(
    new Date(document.effectiveDate + 'T12:00:00Z'),
  );

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
          <span className={styles.eyebrow}>{ui('Právní informace · organizace', 'Legal · organisations')}</span>
          <h1>{document.title}</h1>
          <p>{document.intro}</p>
          <div className={styles.meta}>{ui(
            `Verze ${document.version} · účinná od ${effectiveDate}`,
            `Version ${document.version} · effective ${effectiveDate}`,
          )}</div>
        </div>

        {document.sections.map((section, index) => (
          <section key={section.heading}>
            <h2>{section.heading}</h2>
            {section.paragraphs?.map((paragraph) => <p key={paragraph}>{paragraph}</p>)}
            {section.bullets?.length ? (
              <ul>{section.bullets.map((bullet) => <li key={bullet}>{bullet}</li>)}</ul>
            ) : null}

            {index === 5 ? (
              <div className={styles.tableWrap}>
                <table>
                  <thead>
                    <tr>
                      <th>{ui('Další zpracovatel', 'Sub-processor')}</th>
                      <th>{ui('Účel', 'Purpose')}</th>
                      <th>{ui('Rozsah dat', 'Data scope')}</th>
                      <th>{ui('Lokalita / předávání', 'Location / transfers')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {document.subprocessors.map((subprocessor) => (
                      <tr key={subprocessor.provider}>
                        <td><strong>{subprocessor.provider}</strong></td>
                        <td>{subprocessor.purpose}</td>
                        <td>{subprocessor.dataScope}</td>
                        <td>{subprocessor.transfer}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : null}
          </section>
        ))}

        <section>
          <h2>{ui('Související dokumenty', 'Related documents')}</h2>
          <p>
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
