import { NextResponse } from 'next/server';
import { Resend } from 'resend';
import {
  parseOrganizationBankEmail,
  verifyResendBankWebhook,
} from '@/lib/organization-bank-email';
import { matchOrganizationBankTransaction } from '@/lib/organization-bank-match';
import {
  loadOrganizationFirstActivation,
  scheduleOrganizationOwnerActivated,
} from '@/lib/marketing-lifecycle';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const MAX_WEBHOOK_BYTES = 256_000;

function json(status: number, body: Record<string, unknown>) {
  return NextResponse.json(body, {
    status,
    headers: { 'Cache-Control': 'no-store' },
  });
}
function requiredConfiguration() {
  const apiKey = process.env.RESEND_API_KEY;
  const webhookSecret = process.env.RESEND_BANK_WEBHOOK_SECRET;
  const forwarderEmail = process.env.BANK_NOTIFICATION_FORWARDER_EMAIL;
  const inboxEmail = process.env.BANK_NOTIFICATION_INBOX_EMAIL;

  if (!apiKey?.startsWith('re_')) throw new Error('resend_api_key_missing');
  if (!webhookSecret?.startsWith('whsec_')) throw new Error('resend_webhook_secret_missing');
  if (!forwarderEmail?.includes('@')) throw new Error('bank_forwarder_email_missing');
  if (!inboxEmail?.includes('@')) throw new Error('bank_inbox_email_missing');

  return { apiKey, webhookSecret, forwarderEmail, inboxEmail };
}

export async function POST(request: Request) {
  const contentLength = Number(request.headers.get('content-length') ?? '0');
  if (Number.isFinite(contentLength) && contentLength > MAX_WEBHOOK_BYTES) {
    return json(413, { error: 'payload_too_large' });
  }

  let configuration: ReturnType<typeof requiredConfiguration>;
  try {
    configuration = requiredConfiguration();
  } catch (error) {
    console.error('bank webhook configuration failed', {
      code: error instanceof Error ? error.message : 'configuration_invalid',
    });
    return json(503, { error: 'bank_webhook_not_configured' });
  }

  const webhookId = request.headers.get('svix-id');
  const webhookTimestamp = request.headers.get('svix-timestamp');
  const webhookSignature = request.headers.get('svix-signature');
  if (!webhookId || !webhookTimestamp || !webhookSignature) {
    return json(400, { error: 'missing_signature' });
  }

  const rawBody = await request.text();
  if (Buffer.byteLength(rawBody, 'utf8') > MAX_WEBHOOK_BYTES) {
    return json(413, { error: 'payload_too_large' });
  }

  let event;
  try {
    event = verifyResendBankWebhook({
      apiKey: configuration.apiKey,
      payload: rawBody,
      id: webhookId,
      timestamp: webhookTimestamp,
      signature: webhookSignature,
      webhookSecret: configuration.webhookSecret,
    });
  } catch {
    console.warn('bank webhook signature rejected', { webhookId });
    return json(400, { error: 'invalid_webhook' });
  }

  if (event.type !== 'email.received') {
    return json(200, { accepted: false, reason: 'event_ignored' });
  }

  const eventEmail = event.data;
  const resend = new Resend(configuration.apiKey);
  const { data: receivedEmail, error: receivedEmailError } = await resend.emails.receiving.get(
    eventEmail.email_id,
  );
  if (receivedEmailError || !receivedEmail) {
    console.error('bank webhook email retrieval failed', {
      webhookId,
      emailId: eventEmail.email_id,
      code: receivedEmailError?.name ?? 'response_invalid',
    });
    return json(500, { error: 'bank_email_retrieval_failed' });
  }

  if (
    receivedEmail.id !== eventEmail.email_id
    || receivedEmail.subject !== eventEmail.subject
    || receivedEmail.from !== eventEmail.from
  ) {
    console.warn('bank webhook email metadata mismatch', {
      webhookId,
      emailId: eventEmail.email_id,
    });
    return json(200, { accepted: false, reason: 'email_metadata_mismatch' });
  }

  let transaction;
  try {
    transaction = parseOrganizationBankEmail(
      {
        from: receivedEmail.from,
        to: receivedEmail.to,
        subject: receivedEmail.subject,
        text: receivedEmail.text,
        headers: receivedEmail.headers ?? {},
      },
      {
        forwarderEmail: configuration.forwarderEmail,
        inboxEmail: configuration.inboxEmail,
      },
    );
  } catch (error) {
    const code = error instanceof Error ? error.message : 'bank_email_invalid';
    console.warn('bank webhook email rejected', {
      webhookId,
      emailId: eventEmail.email_id,
      code,
    });
    // The webhook is genuine but the email is not an accepted bank event.
    // Acknowledge it so Resend does not retry untrusted input.
    return json(200, { accepted: false, reason: 'email_rejected' });
  }

  try {
    const firstActivation = await loadOrganizationFirstActivation({
      variableSymbol: transaction.variableSymbol,
    });
    const result = await matchOrganizationBankTransaction(transaction);
    if (!result?.processed) {
      console.warn('bank webhook transaction unmatched', {
        webhookId,
        emailId: eventEmail.email_id,
        bankReference: transaction.bankReference,
        reason: result?.reason ?? 'match_result_missing',
      });
      return json(200, {
        accepted: true,
        matched: false,
        reason: result?.reason ?? 'match_result_missing',
      });
    }

    scheduleOrganizationOwnerActivated(firstActivation);

    console.info('bank webhook transaction matched', {
      webhookId,
      emailId: eventEmail.email_id,
      bankReference: transaction.bankReference,
      organizationId: result.organizationId,
      orderId: result.orderId,
    });
    return json(200, {
      accepted: true,
      matched: true,
      organizationId: result.organizationId,
      orderId: result.orderId,
    });
  } catch (error) {
    const code = error instanceof Error ? error.message : 'bank_match_failed';
    if (code.includes('ambiguous_bank_payment_match')) {
      console.error('bank webhook transaction needs manual review', {
        webhookId,
        emailId: eventEmail.email_id,
        bankReference: transaction.bankReference,
        code,
      });
      return json(200, {
        accepted: true,
        matched: false,
        reason: 'manual_review_required',
      });
    }

    console.error('bank webhook transaction processing failed', {
      webhookId,
      emailId: eventEmail.email_id,
      bankReference: transaction.bankReference,
      code,
    });
    return json(500, { error: 'bank_match_failed' });
  }
}
