import { createAdminClient } from '@/lib/supabase/admin';

export const AI_BILLING_PAYMENT_REQUIRED_CODE = 'billing_payment_required';

export type AiBillingPauseReason = 'past_due' | 'dispute' | 'refund';
export type AiBillingPauseScope = 'individual' | 'organization';

export type EffectiveAiBillingPauseState = {
  reason: AiBillingPauseReason | null;
  scope: AiBillingPauseScope | null;
  organizationId: string | null;
  manager: boolean;
};

export function aiBillingPausedMessage(
  locale: 'cs' | 'en',
  reason: AiBillingPauseReason | null = null,
  scope: AiBillingPauseScope | null = 'individual',
  manager = false,
) {
  if (scope === 'organization') {
    if (reason === 'dispute') {
      return locale === 'en'
        ? manager
          ? 'AI features for your school are temporarily paused because a school subscription payment is under dispute. Saved lessons, school administration and live teaching remain available. Review the school billing details to resolve the payment.'
          : 'AI features for your school are temporarily paused because a school subscription payment is under dispute. Saved lessons and live teaching remain available. A school administrator needs to resolve the payment.'
        : manager
          ? 'AI funkce školy jsou dočasně pozastavené kvůli reklamaci platby školního předplatného. Uložené lekce, správa školy a živá výuka zůstávají dostupné. Platbu vyřešte ve správě školy.'
          : 'AI funkce školy jsou dočasně pozastavené kvůli reklamaci platby školního předplatného. Uložené lekce a živá výuka zůstávají dostupné. Platbu musí vyřešit správce školy.';
    }

    if (reason === 'refund') {
      return locale === 'en'
        ? manager
          ? 'AI features for your school are temporarily paused because a school subscription payment was fully refunded. Saved lessons, school administration and live teaching remain available. Review the school billing details to restore AI access.'
          : 'AI features for your school are temporarily paused because a school subscription payment was fully refunded. Saved lessons and live teaching remain available. A school administrator needs to resolve the billing state.'
        : manager
          ? 'AI funkce školy jsou dočasně pozastavené, protože platba školního předplatného byla plně vrácena. Uložené lekce, správa školy a živá výuka zůstávají dostupné. Obnovení AI vyřešte ve správě školy.'
          : 'AI funkce školy jsou dočasně pozastavené, protože platba školního předplatného byla plně vrácena. Uložené lekce a živá výuka zůstávají dostupné. Stav fakturace musí vyřešit správce školy.';
    }

    return locale === 'en'
      ? manager
        ? 'AI features for your school are temporarily paused because the school subscription payment needs attention. Saved lessons, school administration and live teaching remain available. AI unlocks when the payment is resolved.'
        : 'AI features for your school are temporarily paused because the school subscription payment needs attention. Saved lessons and live teaching remain available. A school administrator needs to resolve the payment.'
      : manager
        ? 'AI funkce školy jsou dočasně pozastavené, protože platba školního předplatného vyžaduje pozornost. Uložené lekce, správa školy a živá výuka zůstávají dostupné. AI se odemkne po vyřešení platby.'
        : 'AI funkce školy jsou dočasně pozastavené, protože platba školního předplatného vyžaduje pozornost. Uložené lekce a živá výuka zůstávají dostupné. Platbu musí vyřešit správce školy.';
  }
  if (reason === 'dispute') {
    return locale === 'en'
      ? 'AI features are temporarily paused because a subscription payment is under dispute. Saved lessons and live teaching remain available. AI unlocks automatically if Stripe confirms the funds were returned to Syllonaut; after a lost dispute it unlocks once later confirmed subscription payments cover the lost amount.'
      : 'AI funkce jsou dočasně pozastavené, protože platba předplatného je reklamovaná. Uložené lekce a živá výuka zůstávají dostupné. AI se automaticky odemkne, pokud Stripe potvrdí vrácení prostředků Syllonautu; po prohraném sporu se odemkne, až pozdější potvrzené platby předplatného pokryjí ztracenou částku.';
  }

  if (reason === 'refund') {
    return locale === 'en'
      ? 'AI features are temporarily paused because the current subscription payment was fully refunded. Saved lessons and live teaching remain available. AI unlocks automatically once later confirmed subscription payments cover the refunded amount.'
      : 'AI funkce jsou dočasně pozastavené, protože platba za aktuální předplatné byla plně vrácena. Uložené lekce a živá výuka zůstávají dostupné. AI se automaticky odemkne, až pozdější potvrzené platby předplatného pokryjí vrácenou částku.';
  }

  if (reason === 'past_due') {
    return locale === 'en'
      ? 'AI features are temporarily paused because the subscription payment needs attention. Your saved lessons and live teaching remain available. AI unlocks automatically as soon as Stripe confirms the payment.'
      : 'AI funkce jsou dočasně pozastavené, protože platba předplatného vyžaduje pozornost. Uložené lekce a živá výuka zůstávají dostupné. AI se automaticky odemkne, jakmile Stripe platbu potvrdí.';
  }

  return locale === 'en'
    ? 'AI features are temporarily paused because the subscription payment, a payment dispute, or a full refund needs attention. Saved lessons and live teaching remain available.'
    : 'AI funkce jsou dočasně pozastavené kvůli platbě předplatného, reklamaci platby nebo plnému refundu. Uložené lekce a živá výuka zůstávají dostupné.';
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
  if (data === 'past_due' || data === 'dispute' || data === 'refund') return data;
  console.error('individual AI billing state returned unknown reason', { userId });
  throw new Error('ai_billing_state_invalid');
}

export async function isIndividualAiBillingPaused(userId: string) {
  return (await getIndividualAiBillingPauseReason(userId)) !== null;
}

export async function getEffectiveAiBillingPauseState(
  userId: string,
): Promise<EffectiveAiBillingPauseState> {
  const admin = createAdminClient();
  const { data, error } = await admin.rpc('get_effective_ai_billing_pause_state_server', {
    p_user_id: userId,
  });
  if (error) {
    // Safe app-first rollout: the new RPC can be briefly absent from PostgREST
    // before the matching DB migration is applied. Fall back only for that
    // explicit schema-cache condition; all other lookup errors remain fail-closed.
    if (error.code === 'PGRST202' || error.message?.includes('get_effective_ai_billing_pause_state_server')) {
      const reason = await getIndividualAiBillingPauseReason(userId);
      return {
        reason,
        scope: reason ? 'individual' : null,
        organizationId: null,
        manager: false,
      };
    }
    console.error('effective AI billing state lookup failed', { userId, code: error.code });
    throw new Error('ai_billing_state_lookup_failed');
  }

  const value = data as Partial<EffectiveAiBillingPauseState> | null;
  const reason = value?.reason ?? null;
  const scope = value?.scope ?? null;
  if (reason !== null && reason !== 'past_due' && reason !== 'dispute' && reason !== 'refund') {
    throw new Error('ai_billing_state_invalid');
  }
  if (scope !== null && scope !== 'individual' && scope !== 'organization') {
    throw new Error('ai_billing_state_invalid');
  }

  return {
    reason,
    scope,
    organizationId: typeof value?.organizationId === 'string' ? value.organizationId : null,
    manager: value?.manager === true,
  };
}

export async function isEffectiveAiBillingPaused(userId: string) {
  return (await getEffectiveAiBillingPauseState(userId)).reason !== null;
}
