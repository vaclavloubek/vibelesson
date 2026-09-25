import Link from 'next/link';
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import HeaderMobileNav from '@/components/HeaderMobileNav';
import LocaleSwitcher from '@/components/LocaleSwitcher';
import PublicHeaderAccountMenu from '@/components/PublicHeaderAccountMenu';
import SiteFooter from '@/components/SiteFooter';
import SyllonautMark from '@/components/SyllonautMark';
import TermsReconsentForm from '@/components/TermsReconsentForm';
import { getAuthenticatedUserId } from '@/lib/auth';
import { LOCALE_REQUEST_HEADER, normalizeUiLocale } from '@/lib/i18n';
import { TERMS_EFFECTIVE_DATE, TERMS_VERSION } from '@/lib/legal';
import { hasCurrentTermsAcceptance } from '@/lib/terms-acceptance';
import { normalizeTermsReturnTo } from '@/lib/terms-gate';
import landing from '@/components/LandingPage.module.css';
import styles from '@/app/gdpr/GdprPage.module.css';

export const dynamic = 'force-dynamic';

export default async function TermsAcceptPage({
  searchParams,
}: {
  searchParams: Promise<{ returnTo?: string | string[] }>;
}) {
  const requestHeaders = await headers();
  const locale = normalizeUiLocale(requestHeaders.get(LOCALE_REQUEST_HEADER)) ?? 'cs';
  const english = locale === 'en';
  const params = await searchParams;
  const rawReturnTo = Array.isArray(params.returnTo) ? params.returnTo[0] : params.returnTo;
  const returnTo = normalizeTermsReturnTo(rawReturnTo);

  const { authenticatedUserId: userId, supabase } = await getAuthenticatedUserId();
  if (!userId) redirect(`/${locale}`);

  let alreadyAccepted = false;
  try {
    alreadyAccepted = await hasCurrentTermsAcceptance(userId);
  } catch (error) {
    console.error('Terms re-consent page status lookup failed', error);
  }
  if (alreadyAccepted) redirect(returnTo);

  const { data: claimsData } = await supabase.auth.getClaims();
  const accountUser = {
    id: userId,
    email: typeof claimsData?.claims?.email === 'string' ? claimsData.claims.email : undefined,
    user_metadata: claimsData?.claims?.user_metadata && typeof claimsData.claims.user_metadata === 'object'
      ? claimsData.claims.user_metadata as Record<string, unknown>
      : {},
  };

  return (
    <main className={landing.page}>
      <header className={landing.header}>
        <Link href={`/${locale}`} className={landing.brand} aria-label={english ? 'Syllonaut – home' : 'Syllonaut – domů'}>
          <SyllonautMark /><span>Syllonaut</span><span className={landing.beta}>BETA</span>
        </Link>
        <nav className={landing.nav} aria-label={english ? 'Main navigation' : 'Hlavní navigace'}>
          <Link href={`/${locale}/terms`}>{english ? 'Terms of Service' : 'Obchodní podmínky'}</Link>
          <Link href={`/${locale}/gdpr`}>{english ? 'Privacy' : 'Ochrana osobních údajů'}</Link>
        </nav>
        <div className={landing.headerActions}>
          <LocaleSwitcher />
          <PublicHeaderAccountMenu user={accountUser} />
          <HeaderMobileNav signedIn current="home" />
        </div>
      </header>

      <article className={styles.page}>
        <div className={styles.hero}>
          <span className={styles.eyebrow}>{english ? 'One-time confirmation' : 'Jednorázové potvrzení'}</span>
          <h1>{english ? 'Accept the current Terms to continue' : 'Pro pokračování přijmi aktuální obchodní podmínky'}</h1>
          <p>{english
            ? 'Your account was created before the current Terms were introduced. Before you continue creating, editing or running lessons or managing an organisation, we need your explicit acceptance of the current version.'
            : 'Tvůj účet vznikl ještě před zavedením aktuálních obchodních podmínek. Než budeš dál tvořit, upravovat nebo spouštět lekce či spravovat organizaci, potřebujeme tvůj výslovný souhlas s aktuální verzí.'}</p>
          <div className={styles.meta}>
            {english
              ? `Version ${TERMS_VERSION} · effective ${TERMS_EFFECTIVE_DATE}`
              : `Verze ${TERMS_VERSION} · účinná od 25. 9. 2026`}
          </div>
        </div>

        <section>
          <h2>{english ? 'What changes for you' : 'Co to pro tebe znamená'}</h2>
          <p>{english
            ? 'Acceptance is required only before further use of the working features of Syllonaut. Legal documents, invoices, subscription management and cancellation remain available without accepting the updated Terms.'
            : 'Souhlas je vyžadován pouze před dalším používáním pracovních funkcí Syllonautu. Právní dokumenty, faktury, správa předplatného i jeho zrušení zůstávají dostupné i bez přijetí aktualizovaných VOP.'}</p>
          <TermsReconsentForm locale={locale} returnTo={returnTo} />
        </section>
      </article>

      <SiteFooter />
    </main>
  );
}
