import type { Metadata } from 'next';
import Link from 'next/link';
import { headers } from 'next/headers';
import HeaderMobileNav from '@/components/HeaderMobileNav';
import LocaleSwitcher from '@/components/LocaleSwitcher';
import PrintPageButton from '@/components/PrintPageButton';
import PublicHeaderAccountMenu from '@/components/PublicHeaderAccountMenu';
import SiteFooter from '@/components/SiteFooter';
import SyllonautMark from '@/components/SyllonautMark';
import { LOCALE_REQUEST_HEADER, normalizeUiLocale } from '@/lib/i18n';
import { PROVIDER_CONTACT } from '@/lib/provider-contact';
import { createClient } from '@/lib/supabase/server';
import { WITHDRAWAL_FORM_COPY } from '@/lib/withdrawal-form';
import landing from '@/components/LandingPage.module.css';
import styles from './WithdrawalPage.module.css';

export async function generateMetadata(): Promise<Metadata> {
  const requestHeaders = await headers();
  const locale = normalizeUiLocale(requestHeaders.get(LOCALE_REQUEST_HEADER)) ?? 'cs';
  const english = locale === 'en';
  return {
    title: english ? 'Withdrawal from contract — Syllonaut' : 'Odstoupení od smlouvy — Syllonaut',
    description: english ? 'Statutory model withdrawal form and online withdrawal for Syllonaut consumers.' : 'Zákonný vzorový formulář a online odstoupení pro spotřebitele Syllonautu.',
    alternates: { canonical: `/${locale}/withdrawal`, languages: { cs: '/cs/withdrawal', en: '/en/withdrawal', 'x-default': '/en/withdrawal' } },
    robots: { index: true, follow: true },
  };
}

export default async function WithdrawalPage() {
  const requestHeaders = await headers();
  const locale = normalizeUiLocale(requestHeaders.get(LOCALE_REQUEST_HEADER)) ?? 'cs';
  const english = locale === 'en';
  const ui = (cs: string, en: string) => english ? en : cs;
  const copy = WITHDRAWAL_FORM_COPY[locale];
  const supabase = await createClient();
  const { data: claimsData } = await supabase.auth.getClaims();
  const userId = typeof claimsData?.claims?.sub === 'string' ? claimsData.claims.sub : null;
  const accountUser = userId ? {
    id: userId,
    email: typeof claimsData?.claims?.email === 'string' ? claimsData.claims.email : undefined,
    user_metadata: claimsData?.claims?.user_metadata && typeof claimsData.claims.user_metadata === 'object'
      ? claimsData.claims.user_metadata as Record<string, unknown> : {},
  } : null;
  const country = english ? PROVIDER_CONTACT.countryEn : PROVIDER_CONTACT.countryCs;

  return (
    <main className={landing.page}>
      <header className={landing.header}>
        <Link href={`/${locale}`} className={landing.brand} aria-label={ui('Syllonaut – domů', 'Syllonaut – home')}><SyllonautMark /><span>Syllonaut</span><span className={landing.beta}>BETA</span></Link>
        <nav className={landing.nav} aria-label={ui('Hlavní navigace', 'Main navigation')}><Link href={`/${locale}#jak-to-funguje`}>{ui('Jak to funguje', 'How it works')}</Link><Link href={`/${locale}/pricing`}>{ui('Ceník', 'Pricing')}</Link>{accountUser ? <Link href="/lessons">{ui('Moje lekce', 'My lessons')}</Link> : null}</nav>
        <div className={landing.headerActions}><LocaleSwitcher />{accountUser ? <PublicHeaderAccountMenu user={accountUser} /> : null}<Link href="/new" className={landing.headerCta}>{ui('Připravit hodinu', 'Prepare a lesson')}</Link><HeaderMobileNav signedIn={Boolean(accountUser)} /></div>
      </header>

      <article className={styles.page}>
        <div className={styles.hero}>
          <span className={styles.eyebrow}>{ui('Právo spotřebitele', 'Consumer right')}</span>
          <h1>{ui('Odstoupení od smlouvy', 'Withdrawal from contract')}</h1>
          <p>{ui('Níže je zákonný vzorový formulář. Spotřebitel s individuální placenou smlouvou může během 14denní lhůty odstoupit také online ve své správě předplatného.', 'The statutory model form appears below. A consumer with an individual paid contract may also withdraw online from subscription management during the 14-day period.')}</p>
          <div className={styles.actions}><Link href="/subscription#withdrawal">{ui('Odstoupit online', 'Withdraw online')}</Link><PrintPageButton>{ui('Vytisknout formulář', 'Print form')}</PrintPageButton></div>
        </div>

        <div className={styles.info}>{ui('Pro dodržení lhůty stačí odstoupení před jejím uplynutím odeslat. Online podání zaznamená obsah, datum a čas a bezodkladně odešle potvrzení e-mailem. Stále můžete použít také e-mail nebo poštu.', 'To meet the deadline, it is sufficient to send the withdrawal before it expires. The online flow records the content, date and time and promptly sends an email confirmation. You may still use email or post.')}</div>

        <section className={styles.form} aria-labelledby="model-withdrawal-title">
          <h2 id="model-withdrawal-title">{copy.title}</h2>
          <p className={styles.instruction}>{copy.instruction}</p>
          <address><strong>{copy.addressee}:</strong><br />{PROVIDER_CONTACT.legalName}<br />{PROVIDER_CONTACT.addressLine1}<br />{PROVIDER_CONTACT.postalCity}<br />{country}<br />{ui('Telefon', 'Phone')}: {PROVIDER_CONTACT.phoneDisplay}<br />{ui('E-mail', 'Email')}: {PROVIDER_CONTACT.email}</address>
          <p className={styles.statement}>{copy.statement}</p><div className={styles.line} aria-hidden="true" />
          <table className={styles.fields}><tbody>
            <tr><th scope="row">{copy.ordered}</th><td /></tr>
            <tr><th scope="row">{copy.names}</th><td /></tr>
            <tr><th scope="row">{copy.address}</th><td /></tr>
          </tbody></table>
          <p className={styles.signature}>{copy.signature}: __________________________________</p>
          <table className={styles.fields}><tbody><tr><th scope="row">{copy.date}</th><td /></tr></tbody></table>
          <p className={styles.note}>{copy.note}</p>
        </section>

        <p className={styles.support}>{ui('Vyplněný formulář nebo jiné jednoznačné prohlášení pošlete na', 'Send the completed form or another unequivocal statement to')} <a href={PROVIDER_CONTACT.emailHref}>{PROVIDER_CONTACT.email}</a> {ui('nebo na adresu poskytovatele uvedenou ve formuláři.', 'or to the provider address shown in the form.')}</p>
      </article>
      <SiteFooter />
    </main>
  );
}
