import { createAdminClient } from '@/lib/supabase/admin';

export const AI_BILLING_PAYMENT_REQUIRED_CODE = 'billing_payment_required';

export function aiBillingPausedMessage(locale: 'cs' | 'en') {
  return locale === 'en'
    ? 'AI features are temporarily paused because the subscription payment needs attention. Your saved lessons and live teaching remain available. AI unlocks automatically as soon as Stripe confirms the payment.'
    : 'AI funkce jsou dočasně pozastavené, protože platba předplatného vyžaduje pozornost. Uložené lekce a živá výuka zůstávají dostupné. AI se automaticky odemkne, jakmile Stripe platbu potvrdí.';
}

export async function isIndividualAiBillingPaused(userId: string) {
  const admin = createAdminClient();
  const { data, error } = await admin.rpc('get_individual_ai_billing_paused_server', {
    p_user_id: userId,
  });
  if (error) {
    console.error('individual AI billing state lookup failed', { userId, code: error.code });
    throw new Error('ai_billing_state_lookup_failed');
  }
  return data === true;
}
