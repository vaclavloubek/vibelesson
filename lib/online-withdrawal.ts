import { z } from 'zod';
import { BillingEmailDeliveryError, sendResendEmail } from '@/lib/billing-email';
import { createPrivilegedRpcClient } from '@/lib/neon/privileged-rpc';

const OpportunitySchema = z.object({
  snapshotId: z.string().uuid(),
  subscriptionId: z.string(),
  planCode: z.enum(['teacher', 'teacher_pro']),
  billingPeriod: z.enum(['monthly', 'annual']),
  currency: z.enum(['czk', 'eur', 'usd']),
  amountMinor: z.number().int().nonnegative(),
  locale: z.enum(['cs', 'en']),
  acceptedAt: z.string(),
  deadline: z.string(),
  eligible: z.boolean(),
  receiptId: z.string().uuid().nullable(),
  receivedAt: z.string().nullable(),
  confirmationStatus: z.enum(['pending', 'sent']).nullable(),
  confirmationSentAt: z.string().nullable(),
});

export type OnlineWithdrawalOpportunity = z.infer<typeof OpportunitySchema>;

const ConfirmationSchema = z.object({
  receiptId: z.string().uuid(),
  locale: z.enum(['cs', 'en']),
  consumerName: z.string(),
  electronicContact: z.string().email(),
  noticePayload: z.object({
    version: z.literal('syllonaut-online-withdrawal-v1'),
    statement: z.string(),
    provider: z.string(),
    snapshotId: z.string().uuid(),
    planCode: z.enum(['teacher', 'teacher_pro']),
    billingPeriod: z.enum(['monthly', 'annual']),
    orderedAt: z.string(),
    consumerName: z.string(),
    electronicContact: z.string().email(),
    submittedAt: z.string(),
    locale: z.enum(['cs', 'en']),
  }),
  noticeSha256: z.string().regex(/^[0-9a-f]{64}$/),
  submittedAt: z.string(),
  status: z.enum(['pending', 'sent']),
  attemptCount: z.number().int().nonnegative(),
  sentAt: z.string().nullable(),
});

export type OnlineWithdrawalReceipt = {
  receiptId: string;
  snapshotId: string;
  submittedAt: string;
  noticePayload: z.infer<typeof ConfirmationSchema>['noticePayload'];
  noticeSha256: string;
  confirmationStatus: 'pending' | 'sent';
};

function escapeHtml(value: string) {
  return value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#39;');
}

export async function getOnlineWithdrawalOpportunity(userId: string) {
  const { data, error } = await createPrivilegedRpcClient().rpc('get_online_individual_withdrawal_for_service', { p_user_id: userId });
  if (error) throw new Error('online_withdrawal_lookup_failed');
  if (!data) return null;
  return OpportunitySchema.parse(data);
}

export async function registerOnlineWithdrawal(input: {
  userId: string;
  snapshotId: string;
  consumerName: string;
  electronicContact: string;
  locale: 'cs' | 'en';
}) {
  const { data, error } = await createPrivilegedRpcClient().rpc('register_online_individual_withdrawal_for_service', {
    p_user_id: input.userId,
    p_snapshot_id: input.snapshotId,
    p_consumer_name: input.consumerName,
    p_electronic_contact: input.electronicContact,
    p_locale: input.locale,
    p_consumer_confirmed: true,
  });
  if (error || !data) {
    const message = error?.message ?? '';
    if (message.includes('deadline_expired')) throw new Error('online_withdrawal_deadline_expired');
    if (message.includes('receipt_conflict')) throw new Error('online_withdrawal_already_recorded');
    throw new Error('online_withdrawal_registration_failed');
  }
  return data as OnlineWithdrawalReceipt;
}

export async function deliverOnlineWithdrawalConfirmation(receiptId: string, userId: string) {
  const admin = createPrivilegedRpcClient();
  const { data, error } = await admin.rpc('get_online_individual_withdrawal_confirmation_for_service', {
    p_receipt_id: receiptId,
    p_user_id: userId,
  });
  if (error || !data) throw new Error('online_withdrawal_confirmation_lookup_failed');
  const confirmation = ConfirmationSchema.parse(data);
  if (confirmation.status === 'sent') return { sent: true as const, alreadySent: true as const, sentAt: confirmation.sentAt };

  const english = confirmation.locale === 'en';
  const submitted = new Intl.DateTimeFormat(english ? 'en-GB' : 'cs-CZ', {
    dateStyle: 'long', timeStyle: 'long', timeZone: 'Europe/Prague',
  }).format(new Date(confirmation.submittedAt));
  const plan = confirmation.noticePayload.planCode === 'teacher_pro' ? 'Teacher Pro' : 'Teacher';
  const period = confirmation.noticePayload.billingPeriod === 'annual'
    ? (english ? 'annual' : 'roční') : (english ? 'monthly' : 'měsíční');
  const subject = english ? 'Confirmation of withdrawal from your Syllonaut contract' : 'Potvrzení odstoupení od smlouvy Syllonaut';
  const heading = english ? 'We received your withdrawal' : 'Přijali jsme vaše odstoupení';
  const text = english
    ? `${heading}\n\n${confirmation.noticePayload.statement}\n\nName: ${confirmation.consumerName}\nPlan: ${plan} (${period})\nOrder: ${confirmation.noticePayload.orderedAt}\nReceived: ${submitted}\nReceipt ID: ${confirmation.receiptId}\nEvidence hash: ${confirmation.noticeSha256}\n\nWe will assess and return the refundable balance through the original payment method. This confirmation records the content, date and time of your submission.`
    : `${heading}\n\n${confirmation.noticePayload.statement}\n\nJméno: ${confirmation.consumerName}\nTarif: ${plan} (${period})\nObjednávka: ${confirmation.noticePayload.orderedAt}\nPřijato: ${submitted}\nID potvrzení: ${confirmation.receiptId}\nKontrolní hash: ${confirmation.noticeSha256}\n\nVyčíslíme a vrátíme vratnou část ceny původní platební metodou. Toto potvrzení zachycuje obsah, datum a čas vašeho podání.`;
  const html = `<!doctype html><html lang="${confirmation.locale}" dir="ltr"><head><meta charset="utf-8"><title>${escapeHtml(subject)}</title></head><body lang="${confirmation.locale}" dir="ltr" style="margin:0;background:#f4f3ef;color:#171821;font-family:Arial,Helvetica,sans-serif"><main style="max-width:640px;margin:0 auto;padding:32px 20px"><section style="background:#fff;border:1px solid #dedde8;border-radius:16px;padding:28px"><h1 style="margin:0 0 18px;font-size:26px">${escapeHtml(heading)}</h1><p style="line-height:1.6">${escapeHtml(confirmation.noticePayload.statement)}</p><table role="presentation" style="width:100%;border-collapse:collapse;margin:22px 0"><tr><td style="padding:8px 0;color:#62646d">${english ? 'Name' : 'Jméno'}</td><td style="padding:8px 0;text-align:right"><strong>${escapeHtml(confirmation.consumerName)}</strong></td></tr><tr><td style="padding:8px 0;color:#62646d">${english ? 'Plan' : 'Tarif'}</td><td style="padding:8px 0;text-align:right">${escapeHtml(plan)} · ${escapeHtml(period)}</td></tr><tr><td style="padding:8px 0;color:#62646d">${english ? 'Received' : 'Přijato'}</td><td style="padding:8px 0;text-align:right">${escapeHtml(submitted)}</td></tr></table><p style="line-height:1.6">${english ? 'We will assess and return the refundable balance through the original payment method.' : 'Vyčíslíme a vrátíme vratnou část ceny původní platební metodou.'}</p><p style="font-size:12px;line-height:1.5;color:#62646d">${english ? 'Receipt ID' : 'ID potvrzení'}: ${escapeHtml(confirmation.receiptId)}<br>${english ? 'Evidence hash' : 'Kontrolní hash'}: ${escapeHtml(confirmation.noticeSha256)}</p></section></main></body></html>`;

  try {
    const resendId = await sendResendEmail({
      to: confirmation.electronicContact,
      subject,
      text,
      html,
      idempotencyKey: `syllonaut:withdrawal:${receiptId}:confirmation-v1`,
    });
    const { error: recordError } = await admin.rpc('record_online_individual_withdrawal_confirmation_for_service', {
      p_receipt_id: receiptId,
      p_resend_email_id: resendId,
      p_error_code: null,
    });
    if (recordError) throw new Error('online_withdrawal_confirmation_state_failed');
    return { sent: true as const, alreadySent: false as const, sentAt: new Date().toISOString() };
  } catch (cause) {
    const code = cause instanceof BillingEmailDeliveryError ? cause.code : 'online_withdrawal_confirmation_failed';
    await admin.rpc('record_online_individual_withdrawal_confirmation_for_service', {
      p_receipt_id: receiptId,
      p_resend_email_id: null,
      p_error_code: code,
    });
    throw new Error('online_withdrawal_confirmation_failed');
  }
}
