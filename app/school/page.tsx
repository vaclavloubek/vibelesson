import { headers } from 'next/headers';
import SchoolAdmin from '@/components/SchoolAdmin';
import { LOCALE_REQUEST_HEADER, normalizeUiLocale } from '@/lib/i18n';
import { isPublicSchoolBillingEnabled } from '@/lib/school-billing-launch';
import { createClient } from '@/lib/supabase/server';
import { hasCurrentTermsAcceptance } from '@/lib/terms-acceptance';

export const dynamic = 'force-dynamic';

export default async function SchoolPage({
  searchParams,
}: {
  searchParams: Promise<{
    plan?: string | string[];
    billing?: string | string[];
    billing_env?: string | string[];
    checkout?: string | string[];
    session_id?: string | string[];
  }>;
}) {
  const requestHeaders = await headers();
  const locale = normalizeUiLocale(requestHeaders.get(LOCALE_REQUEST_HEADER)) ?? 'cs';
  const params = await searchParams;
  const planValue = Array.isArray(params.plan) ? params.plan[0] : params.plan;
  const billingValue = Array.isArray(params.billing) ? params.billing[0] : params.billing;
  const initialPlan =
    planValue === 'team' || planValue === 'school' || planValue === 'campus'
      ? planValue
      : 'school';
  const initialBilling = billingValue === 'monthly' ? 'monthly' : 'annual';
  const environmentValue = Array.isArray(params.billing_env)
    ? params.billing_env[0]
    : params.billing_env;
  const billingEnvironment = environmentValue === 'sandbox' ? 'sandbox' : 'live';
  const checkoutValue = Array.isArray(params.checkout) ? params.checkout[0] : params.checkout;
  const initialCheckoutResult =
    checkoutValue === 'success' || checkoutValue === 'cancelled'
      ? checkoutValue
      : null;

  // session_id is intentionally ignored here. Stripe webhook state remains
  // the only authority that may activate an organization licence.
  void params.session_id;

  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const userId = typeof data?.claims?.sub === 'string' ? data.claims.sub : null;
  const email = typeof data?.claims?.email === 'string' ? data.claims.email : null;
  let appRole: string | null = null;
  let termsAcceptanceRequired = false;

  if (userId) {
    const { data: profile } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', userId)
      .maybeSingle();
    appRole = profile?.role ?? null;
    try {
      termsAcceptanceRequired = !(await hasCurrentTermsAcceptance(userId));
    } catch (error) {
      console.error('school Terms acceptance lookup failed closed', error);
      termsAcceptanceRequired = true;
    }
  }

  const schoolBillingAvailable = billingEnvironment === 'live'
    ? isPublicSchoolBillingEnabled() || appRole === 'admin'
    : appRole === 'admin';

  return (
    <SchoolAdmin
      locale={locale}
      initialPlan={initialPlan}
      initialBilling={initialBilling}
      billingEnvironment={billingEnvironment}
      initialCheckoutResult={initialCheckoutResult}
      schoolBillingAvailable={schoolBillingAvailable}
      initialUser={userId ? { id: userId, email } : null}
      termsAcceptanceRequired={termsAcceptanceRequired}
    />
  );
}
