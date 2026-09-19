export type BillingLifecycleNotification =
  | 'subscription_activated'
  | 'cancellation_scheduled'
  | 'cancellation_revoked'
  | 'subscription_ended';

export type BillingLifecycleSync = {
  livemode: boolean;
  eventType: string;
  status: string;
  cancelAtPeriodEnd: boolean;
  previousStatus: string | null;
  previousCancelAtPeriodEnd: boolean | null;
};

type UiLocale = 'cs' | 'en';
type IndividualPlanCode = 'teacher' | 'teacher_pro';

type RenderInput = {
  notification: BillingLifecycleNotification;
  locale: UiLocale;
  planCode: IndividualPlanCode;
  currentPeriodEnd: string;
};

export function billingLifecycleNotification(
  sync: BillingLifecycleSync,
): BillingLifecycleNotification | null {
  if (!sync.livemode) return null;

  if (
    sync.eventType === 'customer.subscription.deleted'
    || (
      sync.eventType === 'customer.subscription.updated'
      && sync.status === 'canceled'
      && sync.previousStatus !== 'canceled'
    )
  ) {
    return 'subscription_ended';
  }

  if (
    sync.eventType === 'customer.subscription.updated'
    && sync.previousCancelAtPeriodEnd === false
    && sync.cancelAtPeriodEnd
    && sync.status !== 'canceled'
  ) {
    return 'cancellation_scheduled';
  }

  if (
    sync.eventType === 'customer.subscription.updated'
    && sync.previousCancelAtPeriodEnd === true
    && !sync.cancelAtPeriodEnd
    && ['trialing', 'active', 'past_due'].includes(sync.status)
  ) {
    return 'cancellation_revoked';
  }

  if (
    (
      sync.eventType === 'customer.subscription.created'
      && ['trialing', 'active'].includes(sync.status)
    )
    || (
      sync.eventType === 'customer.subscription.updated'
      && ['incomplete', 'incomplete_expired'].includes(sync.previousStatus ?? '')
      && ['trialing', 'active'].includes(sync.status)
    )
  ) {
    return 'subscription_activated';
  }

  return null;
}

function planName(planCode: IndividualPlanCode) {
  return planCode === 'teacher_pro' ? 'Teacher Pro' : 'Teacher';
}

function formatPeriodEnd(value: string, locale: UiLocale) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) throw new Error('billing_email_period_invalid');
  return new Intl.DateTimeFormat(locale === 'cs' ? 'cs-CZ' : 'en-US', {
    dateStyle: 'long',
    timeZone: 'UTC',
  }).format(date);
}

function shell(content: string, ctaLabel: string, ctaHref: string, locale: UiLocale) {
  const footer = locale === 'cs'
    ? 'Tento e-mail se týká vašeho předplatného Syllonautu. Nejde o marketingové sdělení.'
    : 'This email concerns your Syllonaut subscription. It is not a marketing message.';

  return `<!doctype html>
<html lang="${locale}">
  <body style="margin:0;padding:0;background:#f6f5f1;color:#151721;font-family:Inter,-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f6f5f1;padding:32px 16px;">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:620px;background:#ffffff;border:1px solid #e2e1dc;border-radius:20px;overflow:hidden;">
            <tr>
              <td style="padding:24px 28px;border-bottom:1px solid #e2e1dc;">
                <table role="presentation" cellspacing="0" cellpadding="0">
                  <tr>
                    <td style="width:36px;height:36px;border-radius:11px;background:#1d2030;color:#ffffff;text-align:center;font-size:17px;font-weight:800;">S</td>
                    <td style="padding-left:10px;font-size:19px;font-weight:760;letter-spacing:-0.02em;">Syllonaut</td>
                  </tr>
                </table>
              </td>
            </tr>
            <tr>
              <td style="padding:30px 28px 28px;">
                ${content}
                <p style="margin:26px 0 0;">
                  <a href="${ctaHref}" style="display:inline-block;padding:12px 17px;border-radius:10px;background:#5b57e8;color:#ffffff;text-decoration:none;font-size:14px;font-weight:700;">${ctaLabel}</a>
                </p>
              </td>
            </tr>
            <tr>
              <td style="padding:18px 28px;background:#fbfaf7;border-top:1px solid #e2e1dc;color:#686b74;font-size:11px;line-height:1.5;">
                ${footer}
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}

export function renderBillingLifecycleEmail(input: RenderInput) {
  const name = planName(input.planCode);
  const endDate = formatPeriodEnd(input.currentPeriodEnd, input.locale);
  const baseUrl = `https://www.syllonaut.com/${input.locale}`;
  const pricingUrl = `${baseUrl}/pricing`;

  if (input.locale === 'cs') {
    if (input.notification === 'subscription_activated') {
      const benefits = input.planCode === 'teacher_pro'
        ? '60 nových AI lekcí a 250 AI úprav měsíčně, lekce v libovolném jazyce, AI hodnocení a složky.'
        : '25 nových AI lekcí a 100 AI úprav měsíčně a lekce v libovolném jazyce.';
      const text = `Tarif ${name} je aktivní.\n\nPlatba proběhla v pořádku a placené funkce Syllonautu jsou připravené. ${benefits}\n\nOtevřít Syllonaut: ${baseUrl}`;
      const content = `<h1 style="margin:0 0 12px;font-size:28px;line-height:1.15;letter-spacing:-0.035em;">Tarif ${name} je aktivní</h1><p style="margin:0;color:#686b74;font-size:15px;line-height:1.65;">Platba proběhla v pořádku a placené funkce Syllonautu jsou připravené.</p><div style="margin-top:18px;padding:14px 16px;border-radius:13px;background:#efefff;color:#39368f;font-size:14px;line-height:1.55;"><strong>${name}</strong><br>${benefits}</div>`;
      return { subject: `${name} je aktivní · Syllonaut`, text, html: shell(content, 'Otevřít Syllonaut', baseUrl, input.locale) };
    }

    if (input.notification === 'cancellation_scheduled') {
      const text = `Zrušení předplatného je naplánované.\n\nTarif ${name} zůstane aktivní do ${endDate}. Potom se účet přepne na Free. Do té doby můžeš všechny placené funkce dál používat.\n\nSpráva předplatného: ${pricingUrl}`;
      const content = `<h1 style="margin:0 0 12px;font-size:28px;line-height:1.15;letter-spacing:-0.035em;">Zrušení předplatného je naplánované</h1><p style="margin:0;color:#686b74;font-size:15px;line-height:1.65;">Tarif <strong style="color:#151721;">${name}</strong> zůstane aktivní do <strong style="color:#151721;">${endDate}</strong>. Potom se účet přepne na Free.</p><p style="margin:14px 0 0;color:#686b74;font-size:14px;line-height:1.6;">Do té doby můžeš všechny placené funkce dál používat.</p>`;
      return { subject: 'Zrušení předplatného je naplánované · Syllonaut', text, html: shell(content, 'Spravovat předplatné', pricingUrl, input.locale) };
    }

    if (input.notification === 'cancellation_revoked') {
      const text = `Předplatné pokračuje.\n\nZrušení tarifu ${name} bylo odvoláno. Tarif zůstává aktivní a bude pokračovat podle stávajícího fakturačního období.\n\nSpráva předplatného: ${pricingUrl}`;
      const content = `<h1 style="margin:0 0 12px;font-size:28px;line-height:1.15;letter-spacing:-0.035em;">Předplatné pokračuje</h1><p style="margin:0;color:#686b74;font-size:15px;line-height:1.65;">Zrušení tarifu <strong style="color:#151721;">${name}</strong> bylo odvoláno. Tarif zůstává aktivní a bude pokračovat podle stávajícího fakturačního období.</p>`;
      return { subject: 'Předplatné pokračuje · Syllonaut', text, html: shell(content, 'Spravovat předplatné', pricingUrl, input.locale) };
    }

    const text = `Předplatné bylo ukončeno.\n\nTarif ${name} skončil a účet pokračuje v tarifu Free.\n\nZobrazit tarify: ${pricingUrl}`;
    const content = `<h1 style="margin:0 0 12px;font-size:28px;line-height:1.15;letter-spacing:-0.035em;">Předplatné bylo ukončeno</h1><p style="margin:0;color:#686b74;font-size:15px;line-height:1.65;">Tarif <strong style="color:#151721;">${name}</strong> skončil a účet pokračuje v tarifu Free.</p>`;
    return { subject: 'Předplatné bylo ukončeno · Syllonaut', text, html: shell(content, 'Zobrazit tarify', pricingUrl, input.locale) };
  }

  if (input.notification === 'subscription_activated') {
    const benefits = input.planCode === 'teacher_pro'
      ? '60 new AI lessons and 250 AI edits per month, lessons in any language, AI grading and folders.'
      : '25 new AI lessons and 100 AI edits per month, plus lessons in any language.';
    const text = `Your ${name} plan is active.\n\nYour payment was successful and Syllonaut paid features are ready. ${benefits}\n\nOpen Syllonaut: ${baseUrl}`;
    const content = `<h1 style="margin:0 0 12px;font-size:28px;line-height:1.15;letter-spacing:-0.035em;">Your ${name} plan is active</h1><p style="margin:0;color:#686b74;font-size:15px;line-height:1.65;">Your payment was successful and Syllonaut paid features are ready.</p><div style="margin-top:18px;padding:14px 16px;border-radius:13px;background:#efefff;color:#39368f;font-size:14px;line-height:1.55;"><strong>${name}</strong><br>${benefits}</div>`;
    return { subject: `Your ${name} plan is active · Syllonaut`, text, html: shell(content, 'Open Syllonaut', baseUrl, input.locale) };
  }

  if (input.notification === 'cancellation_scheduled') {
    const text = `Your cancellation is scheduled.\n\nYour ${name} plan remains active until ${endDate}. After that, your account will move to Free. You can keep using all paid features until then.\n\nManage subscription: ${pricingUrl}`;
    const content = `<h1 style="margin:0 0 12px;font-size:28px;line-height:1.15;letter-spacing:-0.035em;">Your cancellation is scheduled</h1><p style="margin:0;color:#686b74;font-size:15px;line-height:1.65;">Your <strong style="color:#151721;">${name}</strong> plan remains active until <strong style="color:#151721;">${endDate}</strong>. After that, your account will move to Free.</p><p style="margin:14px 0 0;color:#686b74;font-size:14px;line-height:1.6;">You can keep using all paid features until then.</p>`;
    return { subject: 'Your cancellation is scheduled · Syllonaut', text, html: shell(content, 'Manage subscription', pricingUrl, input.locale) };
  }

  if (input.notification === 'cancellation_revoked') {
    const text = `Your subscription will continue.\n\nThe cancellation of your ${name} plan was reversed. Your plan remains active and will continue under the current billing period.\n\nManage subscription: ${pricingUrl}`;
    const content = `<h1 style="margin:0 0 12px;font-size:28px;line-height:1.15;letter-spacing:-0.035em;">Your subscription will continue</h1><p style="margin:0;color:#686b74;font-size:15px;line-height:1.65;">The cancellation of your <strong style="color:#151721;">${name}</strong> plan was reversed. Your plan remains active and will continue under the current billing period.</p>`;
    return { subject: 'Your subscription will continue · Syllonaut', text, html: shell(content, 'Manage subscription', pricingUrl, input.locale) };
  }

  const text = `Your subscription has ended.\n\nYour ${name} plan has ended and your account continues on Free.\n\nView plans: ${pricingUrl}`;
  const content = `<h1 style="margin:0 0 12px;font-size:28px;line-height:1.15;letter-spacing:-0.035em;">Your subscription has ended</h1><p style="margin:0;color:#686b74;font-size:15px;line-height:1.65;">Your <strong style="color:#151721;">${name}</strong> plan has ended and your account continues on Free.</p>`;
  return { subject: 'Your subscription has ended · Syllonaut', text, html: shell(content, 'View plans', pricingUrl, input.locale) };
}
