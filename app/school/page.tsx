import { headers } from 'next/headers';
import SchoolAdmin from '@/components/SchoolAdmin';
import { LOCALE_REQUEST_HEADER, normalizeUiLocale } from '@/lib/i18n';
import { createClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

export default async function SchoolPage({
  searchParams,
}: {
  searchParams: Promise<{
    plan?: string | string[];
    billing?: string | string[];
    billing_env?: string | string[];
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

  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const userId = typeof data?.claims?.sub === 'string' ? data.claims.sub : null;
  const email = typeof data?.claims?.email === 'string' ? data.claims.email : null;
  let appRole: string | null = null;

  if (userId) {
    const { data: profile } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', userId)
      .maybeSingle();
    appRole = profile?.role ?? null;
  }

  const schoolBillingAvailable =
    process.env.STRIPE_LIVE_SCHOOL_BILLING_PUBLIC_ENABLED === 'true'
    || (appRole === 'admin' && billingEnvironment === 'sandbox')
    || appRole === 'admin';

  return (
    <SchoolAdmin
      locale={locale}
      initialPlan={initialPlan}
      initialBilling={initialBilling}
      billingEnvironment={billingEnvironment}
      schoolBillingAvailable={schoolBillingAvailable}
      initialUser={userId ? { id: userId, email } : null}
    />
  );
}
