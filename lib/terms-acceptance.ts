import { TERMS_ACCEPTANCE_KEY, TERMS_VERSION } from '@/lib/legal';
import { createAdminClient } from '@/lib/supabase/admin';

export const TERMS_RECONSENT_SOURCE = 'reconsent';

export async function hasCurrentTermsAcceptance(userId: string) {
  const admin = createAdminClient();
  const { data, error } = await admin.rpc('has_terms_acceptance_for_service', {
    p_user_id: userId,
    p_acceptance_key: TERMS_ACCEPTANCE_KEY,
  });

  if (error) {
    console.error('current Terms acceptance lookup failed', {
      userId,
      error: error.message,
      termsVersion: TERMS_VERSION,
      acceptanceKey: TERMS_ACCEPTANCE_KEY,
    });
    throw new Error('terms_acceptance_lookup_failed');
  }

  return data === true;
}

export async function recordCurrentTermsReconsent(userId: string) {
  const admin = createAdminClient();
  const { data, error } = await admin.rpc('record_terms_reconsent_for_service', {
    p_user_id: userId,
    p_acceptance_key: TERMS_ACCEPTANCE_KEY,
  });

  if (error || typeof data !== 'string') {
    console.error('Terms re-consent audit write failed', {
      userId,
      error: error?.message ?? null,
      termsVersion: TERMS_VERSION,
      acceptanceKey: TERMS_ACCEPTANCE_KEY,
    });
    throw new Error('terms_reconsent_write_failed');
  }

  return data;
}
