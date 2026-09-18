import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { billingRouteForCountry } from '@/lib/billing-region';
import {
  configuredStripeWebhookSecrets,
  normalizeStripeInvoiceEvent,
  normalizeStripeSubscriptionEvent,
  verifyStripeWebhook,
} from '@/lib/stripe-webhook';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const MAX_WEBHOOK_BYTES = 1_000_000;

function jsonError(status: number, code: string) {
  return NextResponse.json({ error: code }, {
    status,
    headers: { 'Cache-Control': 'no-store' },
  });
}

export async function POST(request: Request) {
  const signature = request.headers.get('stripe-signature');
  if (!signature) return jsonError(400, 'missing_signature');

  const contentLength = Number(request.headers.get('content-length') ?? '0');
  if (Number.isFinite(contentLength) && contentLength > MAX_WEBHOOK_BYTES) {
    return jsonError(413, 'payload_too_large');
  }

  const rawBody = await request.text();
  if (Buffer.byteLength(rawBody, 'utf8') > MAX_WEBHOOK_BYTES) {
    return jsonError(413, 'payload_too_large');
  }

  let event;
  try {
    event = verifyStripeWebhook(rawBody, signature, configuredStripeWebhookSecrets());
  } catch (error) {
    const code = error instanceof Error ? error.message : 'signature_verification_failed';
    const status = code === 'stripe_webhook_secret_missing' ? 503 : 400;
    console.warn('stripe webhook rejected', { code });
    return jsonError(status, 'invalid_webhook');
  }

  let invoiceSync;
  try {
    invoiceSync = normalizeStripeInvoiceEvent(event);
  } catch (error) {
    const code = error instanceof Error ? error.message : 'invoice_event_invalid';
    console.warn('stripe invoice event rejected', {
      eventId: event.id,
      eventType: event.type,
      livemode: event.livemode,
      code,
    });
    return jsonError(400, 'invalid_invoice_event');
  }

  if (invoiceSync) {
    try {
      const supabase = createAdminClient();
      const { error } = await supabase
        .from('billing_events')
        .upsert({
          provider: 'stripe',
          livemode: invoiceSync.livemode,
          external_event_id: invoiceSync.eventId,
          event_type: invoiceSync.eventType,
          user_id: invoiceSync.userId,
          external_subscription_id: invoiceSync.subscriptionId,
        }, {
          onConflict: 'provider,livemode,external_event_id',
          ignoreDuplicates: true,
        });

      if (error) {
        console.error('stripe invoice event log failed', {
          eventId: invoiceSync.eventId,
          eventType: invoiceSync.eventType,
          livemode: invoiceSync.livemode,
          code: error.code,
        });
        return jsonError(500, 'invoice_event_log_failed');
      }

      return NextResponse.json({ received: true, paymentEvent: invoiceSync.eventType }, {
        status: 200,
        headers: { 'Cache-Control': 'no-store' },
      });
    } catch (error) {
      console.error('stripe invoice event server configuration failed', {
        eventId: invoiceSync.eventId,
        eventType: invoiceSync.eventType,
        livemode: invoiceSync.livemode,
        error: error instanceof Error ? error.message : 'unknown',
      });
      return jsonError(503, 'billing_not_configured');
    }
  }

  let sync;
  try {
    sync = normalizeStripeSubscriptionEvent(event, billingRouteForCountry);
  } catch (error) {
    const code = error instanceof Error ? error.message : 'subscription_event_invalid';
    console.warn('stripe subscription event rejected', {
      eventId: event.id,
      eventType: event.type,
      livemode: event.livemode,
      code,
    });
    return jsonError(400, 'invalid_subscription_event');
  }

  if (!sync) {
    return NextResponse.json({ received: true, ignored: true }, {
      status: 200,
      headers: { 'Cache-Control': 'no-store' },
    });
  }

  try {
    const supabase = createAdminClient();
    const { data, error } = await supabase.rpc('sync_stripe_subscription_event', {
      p_event_id: sync.eventId,
      p_event_type: sync.eventType,
      p_livemode: sync.livemode,
      p_user_id: sync.userId,
      p_customer_id: sync.customerId,
      p_subscription_id: sync.subscriptionId,
      p_price_id: sync.priceId,
      p_merchant_of_record: sync.merchantOfRecord,
      p_status: sync.status,
      p_cancel_at_period_end: sync.cancelAtPeriodEnd,
      p_current_period_start: sync.currentPeriodStart,
      p_current_period_end: sync.currentPeriodEnd,
      p_canceled_at: sync.canceledAt,
      p_billing_country: sync.billingCountry,
    });

    if (error) {
      console.error('stripe subscription sync failed', {
        eventId: sync.eventId,
        eventType: sync.eventType,
        livemode: sync.livemode,
        code: error.code,
      });
      return jsonError(500, 'subscription_sync_failed');
    }

    return NextResponse.json({ received: true, result: data }, {
      status: 200,
      headers: { 'Cache-Control': 'no-store' },
    });
  } catch (error) {
    console.error('stripe webhook server configuration failed', {
      eventId: sync.eventId,
      eventType: sync.eventType,
      livemode: sync.livemode,
      error: error instanceof Error ? error.message : 'unknown',
    });
    return jsonError(503, 'billing_not_configured');
  }
}
