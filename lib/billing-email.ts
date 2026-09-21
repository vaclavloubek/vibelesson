import { createHash } from 'node:crypto';
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

type IndividualContractSnapshotForDelivery = {
  snapshot_id: string;
  plan_code: string;
  billing_period: 'monthly' | 'annual';
  currency: 'czk' | 'eur' | 'usd';
  amount_minor: number;
  terms_version: string;
  locale: 'cs' | 'en';
  immediate_performance_requested: boolean;
  contract_html: string;
  withdrawal_form_html: string;
  content_sha256: string;
  accepted_at: string;
  external_checkout_session_id: string;
};

export async function sendResendEmail({
  to,
  subject,
  text,
  html,
  idempotencyKey,
  attachments,
}: {
  to: string;
  subject: string;
  text: string;
  html: string;
  idempotencyKey: string;
  attachments?: Array<{ filename: string; content: string; content_type: string }>;
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
        ...(attachments?.length ? { attachments } : {}),
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
      contract_snapshot_id: sync.contractSnapshotId,
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
  const planCode: 'teacher' | 'teacher_pro' = subscription.plan_code;

  let contractSnapshot: IndividualContractSnapshotForDelivery | null = null;

  if (notification === 'subscription_activated' && sync.contractSnapshotId) {
    const { data: snapshotData, error: snapshotError } = await admin.rpc(
      'get_individual_contract_snapshot_for_delivery',
      {
        p_snapshot_id: sync.contractSnapshotId,
        p_user_id: sync.userId,
        p_livemode: sync.livemode,
      },
    );
    const row = (Array.isArray(snapshotData) ? snapshotData[0] : snapshotData) as IndividualContractSnapshotForDelivery | null;
    if (snapshotError || !row) {
      await markDeliveryFailure(sync.eventId, notification, delivery.attempt_count, 'billing_contract_snapshot_lookup_failed');
      throw new BillingEmailDeliveryError('billing_contract_snapshot_lookup_failed');
    }
    if (
      row.plan_code !== planCode
      || !row.immediate_performance_requested
      || (sync.checkoutSessionId && row.external_checkout_session_id !== sync.checkoutSessionId)
    ) {
      await markDeliveryFailure(sync.eventId, notification, delivery.attempt_count, 'billing_contract_snapshot_mismatch');
      throw new BillingEmailDeliveryError('billing_contract_snapshot_mismatch');
    }
    const digest = createHash('sha256')
      .update(row.contract_html, 'utf8')
      .update('\n--syllonaut-withdrawal-form--\n', 'utf8')
      .update(row.withdrawal_form_html, 'utf8')
      .digest('hex');
    if (digest !== row.content_sha256) {
      await markDeliveryFailure(sync.eventId, notification, delivery.attempt_count, 'billing_contract_snapshot_hash_mismatch');
      throw new BillingEmailDeliveryError('billing_contract_snapshot_hash_mismatch');
    }
    contractSnapshot = row;
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
  const locale = contractSnapshot?.locale
    ?? normalizeUiLocale(profile?.ui_locale)
    ?? metadataLocale
    ?? localeFromCountry(sync.billingCountry)
    ?? 'en';

  let rendered = renderBillingLifecycleEmail({
    notification,
    locale,
    planCode,
    currentPeriodEnd: subscription.current_period_end ?? sync.currentPeriodEnd,
    allowance: INDIVIDUAL_PLAN_ALLOWANCES[planCode],
  });

  let attachments: Array<{ filename: string; content: string; content_type: string }> | undefined;
  if (contractSnapshot) {
    const price = new Intl.NumberFormat(locale === 'cs' ? 'cs-CZ' : 'en-US', {
      style: 'currency',
      currency: contractSnapshot.currency.toUpperCase(),
      minimumFractionDigits: contractSnapshot.currency === 'czk' ? 0 : 2,
      maximumFractionDigits: contractSnapshot.currency === 'czk' ? 0 : 2,
    }).format(contractSnapshot.amount_minor / 100);
    const period = contractSnapshot.billing_period === 'annual'
      ? (locale === 'cs' ? 'roční' : 'annual')
      : (locale === 'cs' ? 'měsíční' : 'monthly');
    const summaryText = locale === 'cs'
      ? `\n\nSmluvní potvrzení: ${price} · ${period} období · automatické obnovení · VOP ${contractSnapshot.terms_version}. Neměnná kopie smluvních informací a vzorový formulář pro odstoupení jsou v příloze.`
      : `\n\nContract confirmation: ${price} · ${period} billing · automatic renewal · Terms ${contractSnapshot.terms_version}. An immutable copy of the contract information and a model withdrawal form are attached.`;
    const summaryHtml = locale === 'cs'
      ? `<p style="margin:18px 28px;color:#39368f;font-size:13px;line-height:1.55;"><strong>Smluvní potvrzení:</strong> ${price} · ${period} období · automatické obnovení · VOP ${contractSnapshot.terms_version}. Neměnná kopie smluvních informací a vzorový formulář pro odstoupení jsou v příloze.</p>`
      : `<p style="margin:18px 28px;color:#39368f;font-size:13px;line-height:1.55;"><strong>Contract confirmation:</strong> ${price} · ${period} billing · automatic renewal · Terms ${contractSnapshot.terms_version}. An immutable copy of the contract information and a model withdrawal form are attached.</p>`;
    rendered = {
      ...rendered,
      text: rendered.text + summaryText,
      html: rendered.html.replace('</body>', `${summaryHtml}</body>`),
    };
    attachments = [
      {
        filename: `syllonaut-contract-${contractSnapshot.snapshot_id}.html`,
        content: Buffer.from(contractSnapshot.contract_html, 'utf8').toString('base64'),
        content_type: 'text/html; charset=utf-8',
      },
      {
        filename: 'syllonaut-withdrawal-form.html',
        content: Buffer.from(contractSnapshot.withdrawal_form_html, 'utf8').toString('base64'),
        content_type: 'text/html; charset=utf-8',
      },
    ];
  }

  let resendEmailId: string;
  try {
    resendEmailId = await sendResendEmail({
      to: recipient,
      subject: rendered.subject,
      text: rendered.text,
      html: rendered.html,
      idempotencyKey: `syllonaut:${sync.eventId}:${notification}`,
      attachments,
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
