import { headers } from 'next/headers';
import { createClient } from '@/lib/supabase/server';
import { hasCurrentTermsAcceptance } from '@/lib/terms-acceptance';
import { CURRENT_TERMS_REQUIRED_HEADER } from '@/lib/terms-gate';

export async function getAuthenticatedUserId() {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getClaims();
  const authenticatedUserId = typeof data?.claims?.sub === 'string' ? data.claims.sub : null;
  let termsAcceptanceRequired = false;

  if (authenticatedUserId) {
    const requestHeaders = await headers();
    if (requestHeaders.get(CURRENT_TERMS_REQUIRED_HEADER) === '1') {
      try {
        termsAcceptanceRequired = !(await hasCurrentTermsAcceptance(authenticatedUserId));
      } catch (termsError) {
        console.error('current Terms gate lookup failed closed', termsError);
        termsAcceptanceRequired = true;
      }
    }
  }

  return {
    supabase,
    userId: termsAcceptanceRequired ? null : authenticatedUserId,
    authenticatedUserId,
    termsAcceptanceRequired,
    error,
  };
}
