import { createAdminClient } from '@/lib/supabase/admin';
import { localeFromCountry, normalizeUiLocale } from '@/lib/i18n';
import { INDIVIDUAL_PLAN_ALLOWANCES } from '@/lib/individual-billing-catalog';
import type { StripeSubscriptionSync } from '@/lib/stripe-webhook';
import {
  billingLifecycleNotification,
  renderBillingLifecycleEmail,
  type BillingLifecycleNotification,
} from '@/lib/billing-email-core';

export {
  billingLifecycleNotification,
  renderBillingLifecycleEmail,
};
export type { BillingLifecycleNotification };

export class BillingEmailDeliveryError extends Error {
  readonly code: string;

  constructor(code: string) {
    super(code);
    this.code = code;
    this.name = 'BillingEmailDeliveryError';
  }
}

async function sendResendEmail({
  to,
  subject,
  text,
  html,
  idempotencyKey,
}: {
  to: string;
  subject: string;
  text: string;
  html: string;
  idempotencyKey: string;
}) {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey || !apiKey.startsWith('re_')) {
    throw new BillingEmailDeliveryError('resend_api_key_missing');
  }

  let response: Response;
  try {
    response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'Idempotency-Key': idempotencyKey,
      },
      body: JSON.stringify({
        from: process.env.BILLING_EMAIL_FROM ?? 'Syllonaut <billing@syllonaut.com>',
        to: [to],
        reply_to: process.env.BILLING_EMAIL_REPLY_TO ?? 'vaclav@syllonaut.com',
        subject,
        text,
        html,
      }),
      signal: AbortSignal.timeout(10_000),
    });
  } catch {
    throw new BillingEmailDeliveryError('resend_network_error');
  }

  if (!response.ok) {
    throw new BillingEmailDeliveryError(`resend_http_${response.status}`);
  }

  const payload = await response.json().catch(() => null) as { id?: unknown } | null;
  if (!payload || typeof payload.id !== 'string' || !payload.id) {
    throw new BillingEmailDeliveryError('resend_response_invalid');
  }
  return payload.id;
}

async function markDeliveryFailure(
  eventId: string,
  notification: BillingLifecycleNotification,
  attemptCount: number,
  code: string,
) {
  const admin = createAdminClient();
  await admin
    .from('billing_email_deliveries')
    .update({
      attempt_count: attemptCount + 1,
      last_error_code: code,
      updated_at: new Date().toISOString(),
    })
    .eq('provider', 'stripe')
    .eq('livemode', true)
    .eq('external_event_id', eventId)
    .eq('notification_type', notification);
}

export async function deliverBillingLifecycleEmail(
  sync: StripeSubscriptionSync,
  notification: BillingLifecycleNotification,
) {
  if (!sync.livemode) return { skipped: 'sandbox' as const };

  const admin = createAdminClient();
  const { error: queueError } = await admin
    .from('billing_email_deliveries')
    .upsert({
      provider: 'stripe',
      livemode: true,
      external_event_id: sync.eventId,
      notification_type: notification,
      user_id: sync.userId,
      external_subscription_id: sync.subscriptionId,
      status: 'pending',
    }, {
      onConflict: 'provider,livemode,external_event_id,notification_type',
      ignoreDuplicates: true,
    });

  if (queueError) throw new BillingEmailDeliveryError('billing_email_queue_failed');

  const { data: delivery, error: deliveryError } = await admin
    .from('billing_email_deliveries')
    .select('status, attempt_count')
    .eq('provider', 'stripe')
    .eq('livemode', true)
    .eq('external_event_id', sync.eventId)
    .eq('notification_type', notification)
    .maybeSingle();

  if (deliveryError || !delivery) throw new BillingEmailDeliveryError('billing_email_delivery_lookup_failed');
  if (delivery.status === 'sent') return { skipped: 'already_sent' as const };

  const { data: subscription, error: subscriptionError } = await admin
    .from('billing_subscriptions')
    .select('plan_code, current_period_end')
    .eq('provider', 'stripe')
    .eq('livemode', true)
    .eq('external_subscription_id', sync.subscriptionId)
    .maybeSingle();

  if (subscriptionError || !subscription) {
    await markDeliveryFailure(sync.eventId, notification, delivery.attempt_count, 'billing_email_subscription_lookup_failed');
    throw new BillingEmailDeliveryError('billing_email_subscription_lookup_failed');
  }

  if (subscription.plan_code !== 'teacher' && subscription.plan_code !== 'teacher_pro') {
    await markDeliveryFailure(sync.eventId, notification, delivery.attempt_count, 'billing_email_plan_invalid');
    throw new BillingEmailDeliveryError('billing_email_plan_invalid');
  }

  const { data: profile, error: profileError } = await admin
    .from('profiles')
    .select('ui_locale')
    .eq('id', sync.userId)
    .maybeSingle();

  if (profileError) {
    await markDeliveryFailure(sync.eventId, notification, delivery.attempt_count, 'billing_email_locale_lookup_failed');
    throw new BillingEmailDeliveryError('billing_email_locale_lookup_failed');
  }

  const { data: authUser, error: authError } = await admin.auth.admin.getUserById(sync.userId);
  const recipient = authUser.user?.email?.trim();
  if (authError || !recipient) {
    await markDeliveryFailure(sync.eventId, notification, delivery.attempt_count, 'billing_email_recipient_missing');
    throw new BillingEmailDeliveryError('billing_email_recipient_missing');
  }

  const metadataLocale = typeof authUser.user?.user_metadata?.ui_locale === 'string'
    ? normalizeUiLocale(authUser.user.user_metadata.ui_locale)
    : null;
  const locale = normalizeUiLocale(profile?.ui_locale)
    ?? metadataLocale
    ?? localeFromCountry(sync.billingCountry)
    ?? 'en';

  const rendered = renderBillingLifecycleEmail({
    notification,
    locale,
    planCode: subscription.plan_code,
    currentPeriodEnd: subscription.current_period_end ?? sync.currentPeriodEnd,
    allowance: INDIVIDUAL_PLAN_ALLOWANCES[subscription.plan_code],
  });

  let resendEmailId: string;
  try {
    resendEmailId = await sendResendEmail({
      to: recipient,
      subject: rendered.subject,
      text: rendered.text,
      html: rendered.html,
      idempotencyKey: `syllonaut:${sync.eventId}:${notification}`,
    });
  } catch (error) {
    const code = error instanceof BillingEmailDeliveryError ? error.code : 'billing_email_unknown_error';
    await markDeliveryFailure(sync.eventId, notification, delivery.attempt_count, code);
    throw error;
  }

  const { error: sentError } = await admin
    .from('billing_email_deliveries')
    .update({
      status: 'sent',
      attempt_count: delivery.attempt_count + 1,
      resend_email_id: resendEmailId,
      last_error_code: null,
      sent_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('provider', 'stripe')
    .eq('livemode', true)
    .eq('external_event_id', sync.eventId)
    .eq('notification_type', notification);

  if (sentError) throw new BillingEmailDeliveryError('billing_email_sent_state_failed');

  return { sent: true as const, notification, locale };
}
