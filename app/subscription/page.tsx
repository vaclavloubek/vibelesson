import type { Metadata } from 'next';
import Link from 'next/link';
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import AuthControls from '@/components/AuthControls';
import HeaderMobileNav from '@/components/HeaderMobileNav';
import LocaleSwitcher from '@/components/LocaleSwitcher';
import PublicHeaderAccountMenu from '@/components/PublicHeaderAccountMenu';
import SyllonautMark from '@/components/SyllonautMark';
import SubscriptionManagement from '@/components/SubscriptionManagement';
import { getLiveSubscriptionManagementState } from '@/lib/billing-subscription-state';
import { LOCALE_REQUEST_HEADER, normalizeUiLocale } from '@/lib/i18n';
import { createClient } from '@/lib/supabase/server';
import type { AiQuotaSnapshot } from '@/lib/ai-quota';
import { getServiceChangeNotices, type ServiceChangeNotice } from '@/lib/service-change-state';
import { getOnlineWithdrawalOpportunity, type OnlineWithdrawalOpportunity } from '@/lib/online-withdrawal';
import landing from '@/components/LandingPage.module.css';

export const dynamic = 'force-dynamic';

export async function generateMetadata(): Promise<Metadata> {
  const requestHeaders = await headers();
  const locale = normalizeUiLocale(requestHeaders.get(LOCALE_REQUEST_HEADER)) ?? 'cs';
  const english = locale === 'en';
  return {
    title: english ? 'Subscription — Syllonaut' : 'Předplatné — Syllonaut',
    description: english ? 'Manage your Syllonaut subscription.' : 'Správa předplatného Syllonaut.',
    robots: { index: false, follow: false },
  };
}

export default async function SubscriptionPage() {
  const requestHeaders = await headers();
  const locale = normalizeUiLocale(requestHeaders.get(LOCALE_REQUEST_HEADER)) ?? 'cs';
  const english = locale === 'en';
  const ui = (cs: string, en: string) => english ? en : cs;
  const supabase = await createClient();
  const { data: claimsData } = await supabase.auth.getClaims();
  const userId = typeof claimsData?.claims?.sub === 'string' ? claimsData.claims.sub : null;
  if (!userId) redirect(`/${locale}`);

  let state;
  let quotaWindow: { end: string; source: string | null; gradingUsed: number; gradingLimit: number | null; gradingRemaining: number | null; gradingEnabled: boolean } | null = null;
  let loadError = false;
  let serviceChangeNotices: ServiceChangeNotice[] = [];
  let withdrawalOpportunity: OnlineWithdrawalOpportunity | null = null;
  try {
    state = await getLiveSubscriptionManagementState(userId);
  } catch (error) {
    console.error('load subscription management failed', {
      error: error instanceof Error ? error.message : 'unknown',
      userId,
    });
    state = { kind: 'none' } as const;
    loadError = true;
  }

  try {
    serviceChangeNotices = await getServiceChangeNotices(userId);
  } catch (error) {
    console.error('load service change notices failed', {
      error: error instanceof Error ? error.message : 'unknown',
      userId,
    });
  }

  try {
    withdrawalOpportunity = await getOnlineWithdrawalOpportunity(userId);
  } catch (error) {
    console.error('load online withdrawal opportunity failed', {
      error: error instanceof Error ? error.message : 'unknown',
      userId,
    });
  }

  const { data: quotaData, error: quotaError } = await supabase.rpc('get_ai_quota');
  if (quotaError) {
    console.error('load subscription AI quota window failed', {
      error: quotaError.message,
      userId,
    });
  } else {
    const quotaRow = (Array.isArray(quotaData) ? quotaData[0] : quotaData) as AiQuotaSnapshot | undefined;
    if (quotaRow?.quota_window_end) {
      quotaWindow = {
        end: quotaRow.quota_window_end,
        source: quotaRow.quota_source,
        gradingUsed: quotaRow.grading_used,
        gradingLimit: quotaRow.grading_limit,
        gradingRemaining: quotaRow.grading_remaining,
        gradingEnabled: quotaRow.grading_enabled,
      };
    }
  }

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
        <Link href={`/${locale}`} className={landing.brand} aria-label={ui('Syllonaut – domů', 'Syllonaut – home')}>
          <SyllonautMark />
          <span>Syllonaut</span>
          <span className={landing.beta}>BETA</span>
        </Link>
        <nav className={landing.nav} aria-label={ui('Hlavní navigace', 'Main navigation')}>
          <Link href={`/${locale}#jak-to-funguje`}>{ui('Jak to funguje', 'How it works')}</Link>
          <Link href={`/${locale}/pricing`}>{ui('Ceník', 'Pricing')}</Link>
          <Link href="/lessons">{ui('Moje lekce', 'My lessons')}</Link>
        </nav>
        <div className={landing.headerActions}>
          <LocaleSwitcher />
          <PublicHeaderAccountMenu user={accountUser} />
          <Link href="/new" className={landing.headerCta}>{ui('Připravit hodinu', 'Prepare a lesson')}</Link>
          <HeaderMobileNav signedIn />
        </div>
      </header>

      {loadError ? (
        <section style={{ width: 'min(960px, calc(100% - 40px))', margin: '56px auto 0' }} className="error">
          {ui('Správu předplatného se nepodařilo načíst. Zkus stránku obnovit.', 'Subscription management could not be loaded. Refresh the page and try again.')}
        </section>
      ) : <SubscriptionManagement
        state={state}
        quotaWindow={quotaWindow}
        serviceChangeNotices={serviceChangeNotices}
        withdrawalOpportunity={withdrawalOpportunity}
        accountEmail={accountUser.email ?? ''}
      />}
    </main>
  );
}
