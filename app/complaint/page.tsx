import type { Metadata } from 'next';
import Link from 'next/link';
import { headers } from 'next/headers';
import AuthControls from '@/components/AuthControls';
import ComplaintForm from '@/components/ComplaintForm';
import HeaderMobileNav from '@/components/HeaderMobileNav';
import LocaleSwitcher from '@/components/LocaleSwitcher';
import PublicHeaderAccountMenu from '@/components/PublicHeaderAccountMenu';
import SiteFooter from '@/components/SiteFooter';
import SyllonautMark from '@/components/SyllonautMark';
import { COMPLAINT_RESOLUTION_DAYS } from '@/lib/complaint-options';
import { complaintsAvailable } from '@/lib/complaints';
import { LOCALE_REQUEST_HEADER, normalizeUiLocale } from '@/lib/i18n';
import { PROVIDER_CONTACT } from '@/lib/provider-contact';
import { createClient } from '@/lib/supabase/server';
import landing from '@/components/LandingPage.module.css';
import styles from '@/app/withdrawal/WithdrawalPage.module.css';

export const dynamic = 'force-dynamic';

export async function generateMetadata(): Promise<Metadata> {
  const requestHeaders = await headers();
  const locale = normalizeUiLocale(requestHeaders.get(LOCALE_REQUEST_HEADER)) ?? 'cs';
  const english = locale === 'en';
  return {
    title: english ? 'Complaint — Syllonaut' : 'Reklamace — Syllonaut',
    description: english ? 'Submit a complaint about the Syllonaut service with a durable confirmation.' : 'Reklamace služby Syllonaut s písemným potvrzením o přijetí a vyřízení.',
    alternates: { canonical: `/${locale}/complaint`, languages: { cs: '/cs/complaint', en: '/en/complaint', 'x-default': '/en/complaint' } },
    robots: { index: true, follow: true },
  };
}

export default async function ComplaintPage() {
  const requestHeaders = await headers();
  const locale = normalizeUiLocale(requestHeaders.get(LOCALE_REQUEST_HEADER)) ?? 'cs';
  const english = locale === 'en';
  const ui = (cs: string, en: string) => (english ? en : cs);
  const supabase = await createClient();
  const { data: claimsData } = await supabase.auth.getClaims();
  const userId = typeof claimsData?.claims?.sub === 'string' ? claimsData.claims.sub : null;
  const email = typeof claimsData?.claims?.email === 'string' ? claimsData.claims.email : '';
  const accountUser = userId ? {
    id: userId,
    email: email || undefined,
    user_metadata: claimsData?.claims?.user_metadata && typeof claimsData.claims.user_metadata === 'object'
      ? claimsData.claims.user_metadata as Record<string, unknown> : {},
  } : null;
  const available = await complaintsAvailable();

  return (
    <main className={landing.page}>
      <header className={landing.header}>
        <Link href={`/${locale}`} className={landing.brand} aria-label={ui('Syllonaut – domů', 'Syllonaut – home')}><SyllonautMark /><span>Syllonaut</span><span className={landing.beta}>BETA</span></Link>
        <nav className={landing.nav} aria-label={ui('Hlavní navigace', 'Main navigation')}><Link href={`/${locale}#jak-to-funguje`}>{ui('Jak to funguje', 'How it works')}</Link><Link href={`/${locale}/pricing`}>{ui('Ceník', 'Pricing')}</Link>{accountUser ? <Link href="/lessons">{ui('Moje lekce', 'My lessons')}</Link> : null}</nav>
        <div className={landing.headerActions}><LocaleSwitcher />{accountUser ? <PublicHeaderAccountMenu user={accountUser} /> : <AuthControls />}<HeaderMobileNav signedIn={Boolean(accountUser)} /></div>
      </header>

      <article className={styles.page}>
        <div className={styles.hero}>
          <span className={styles.eyebrow}>{ui('Práva z vadného plnění', 'Rights for defective performance')}</span>
          <h1>{ui('Reklamace', 'Complaint')}</h1>
          <p>{ui(
            `Pokud služba neodpovídá smlouvě nebo nefunguje, můžete ji reklamovat. Potvrdíme vám přijetí reklamace i její vyřízení písemně e-mailem a vyřídíme ji bez zbytečného odkladu, nejpozději do ${COMPLAINT_RESOLUTION_DAYS} dnů.`,
            `If the service does not conform to the contract or does not work, you can submit a complaint. We confirm both receipt and resolution in writing by email and resolve it without undue delay, no later than ${COMPLAINT_RESOLUTION_DAYS} days.`,
          )}</p>
        </div>

        <div className={styles.info}>{ui(
          'Reklamaci můžete uplatnit také e-mailem nebo poštou na adresu poskytovatele; i pak vám přijetí a vyřízení písemně potvrdíme. Zákonná práva spotřebitele zůstávají zachována.',
          'You may also submit a complaint by email or post to the provider’s address; we will still confirm receipt and resolution in writing. Statutory consumer rights remain unaffected.',
        )}</div>

        <section className={styles.form} aria-labelledby="complaint-form-title">
          <h2 id="complaint-form-title">{ui('Online reklamace', 'Online complaint')}</h2>
          {!available ? (
            <p className={styles.instruction}>{ui('Online reklamace je dočasně nedostupná. Pošlete prosím reklamaci na', 'Online complaints are temporarily unavailable. Please send your complaint to')} <a href={PROVIDER_CONTACT.emailHref}>{PROVIDER_CONTACT.email}</a>.</p>
          ) : accountUser ? (
            <ComplaintForm locale={locale} defaultEmail={email} supportEmail={PROVIDER_CONTACT.email} />
          ) : (
            <p className={styles.instruction}>{ui(
              'Pro online reklamaci se přihlaste ke svému účtu tlačítkem v záhlaví stránky, abychom reklamaci spolehlivě přiřadili k vaší smlouvě. Bez přihlášení můžete reklamaci poslat na',
              'Sign in with the button in the page header to submit a complaint online, so we can reliably match it to your contract. Without signing in, you can send your complaint to',
            )} <a href={PROVIDER_CONTACT.emailHref}>{PROVIDER_CONTACT.email}</a>.</p>
          )}
        </section>

        <p className={styles.support}>
          {PROVIDER_CONTACT.legalName}, {PROVIDER_CONTACT.addressLine1}, {PROVIDER_CONTACT.postalCity} · {ui('Telefon', 'Phone')}: <a href={PROVIDER_CONTACT.phoneHref}>{PROVIDER_CONTACT.phoneDisplay}</a> · <a href={PROVIDER_CONTACT.emailHref}>{PROVIDER_CONTACT.email}</a>
        </p>
      </article>
      <SiteFooter />
    </main>
  );
}
