import { createAdminClient } from '@/lib/supabase/admin';

export const AI_BILLING_PAYMENT_REQUIRED_CODE = 'billing_payment_required';

export type AiBillingPauseReason = 'past_due' | 'dispute';

export function aiBillingPausedMessage(
  locale: 'cs' | 'en',
  reason: AiBillingPauseReason | null = null,
) {
  if (reason === 'dispute') {
    return locale === 'en'
      ? 'AI features are temporarily paused because a subscription payment is under dispute. Saved lessons and live teaching remain available. AI unlocks automatically if Stripe confirms the funds were returned to Syllonaut; after a lost dispute it unlocks after the next confirmed payment.'
      : 'AI funkce jsou dočasně pozastavené, protože platba předplatného je reklamovaná. Uložené lekce a živá výuka zůstávají dostupné. AI se automaticky odemkne, pokud Stripe potvrdí vrácení prostředků Syllonautu; po prohraném sporu se odemkne po další potvrzené platbě.';
  }

  if (reason === 'past_due') {
    return locale === 'en'
      ? 'AI features are temporarily paused because the subscription payment needs attention. Your saved lessons and live teaching remain available. AI unlocks automatically as soon as Stripe confirms the payment.'
      : 'AI funkce jsou dočasně pozastavené, protože platba předplatného vyžaduje pozornost. Uložené lekce a živá výuka zůstávají dostupné. AI se automaticky odemkne, jakmile Stripe platbu potvrdí.';
  }

  return locale === 'en'
    ? 'AI features are temporarily paused because the subscription payment or a payment dispute needs attention. Saved lessons and live teaching remain available.'
    : 'AI funkce jsou dočasně pozastavené kvůli platbě předplatného nebo reklamaci platby. Uložené lekce a živá výuka zůstávají dostupné.';
}

export async function getIndividualAiBillingPauseReason(
  userId: string,
): Promise<AiBillingPauseReason | null> {
  const admin = createAdminClient();
  const { data, error } = await admin.rpc('get_individual_ai_billing_pause_reason_server', {
    p_user_id: userId,
  });
  if (error) {
    console.error('individual AI billing state lookup failed', { userId, code: error.code });
    throw new Error('ai_billing_state_lookup_failed');
  }
  if (data === null) return null;
  if (data === 'past_due' || data === 'dispute') return data;
  console.error('individual AI billing state returned unknown reason', { userId });
  throw new Error('ai_billing_state_invalid');
}

export async function isIndividualAiBillingPaused(userId: string) {
  return (await getIndividualAiBillingPauseReason(userId)) !== null;
}
