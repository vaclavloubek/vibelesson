import { redirect } from 'next/navigation';
import { hasCurrentTermsAcceptance } from '@/lib/terms-acceptance';
import { termsReconsentPath } from '@/lib/terms-gate';

export async function requireCurrentTermsForPage(userId: string, returnTo: string) {
  try {
    if (await hasCurrentTermsAcceptance(userId)) return;
  } catch (error) {
    console.error('current Terms page gate failed closed', { userId, returnTo, error });
  }

  redirect(termsReconsentPath(returnTo));
}
