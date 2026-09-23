import { after, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { syncStripeBillingRpc } from '@/lib/neon/billing-rpc';
import { assertApprovedNeonCutover, getDatabaseBackend } from '@/lib/neon/config';
import { createNeonSql } from '@/lib/neon/server';
import {
  billingLifecycleNotification,
  deliverBillingLifecycleEmail,
  BillingEmailDeliveryError,
} from '@/lib/billing-email';
import { billingRouteForCountry } from '@/lib/billing-region';
import { emitSubscriptionUpgraded, syncMarketingPlan } from '@/lib/marketing-lifecycle';
import { isStripeLiveSecretKey, verifyStripeCheckoutBillingCountry } from '@/lib/stripe-checkout';
import { canonicalStripeSubscriptionState, retrieveStripeSubscription } from '@/lib/stripe-subscription-management';
import { listStripePaidInvoicePayments } from '@/lib/stripe-invoice-payments';
import { retrieveStripeChargeRefundState } from '@/lib/stripe-refunds';
import { reconcileServiceChangeRefundEvent, reconcileWithdrawalRefundEvent } from '@/lib/stripe-withdrawal';
import {
  configuredStripeWebhookSecrets,
  normalizeStripeDisputeEvent,
  normalizeStripeInvoiceEvent,
  normalizeStripeOrganizationInvoiceEvent,
  normalizeStripeRefundEvent,
  normalizeStripeOrganizationSubscriptionEvent,
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

  let organizationInvoiceSync;
  try {
    organizationInvoiceSync = normalizeStripeOrganizationInvoiceEvent(event);
  } catch (error) {
    const code = error instanceof Error ? error.message : 'organization_invoice_event_invalid';
    console.warn('stripe organization invoice event rejected', {
      eventId: event.id,
      eventType: event.type,
      livemode: event.livemode,
      code,
    });
    return jsonError(400, 'invalid_organization_invoice_event');
  }

  if (organizationInvoiceSync) {
    try {
      let organization: { billing_country: string; currency: string } | null;
      let organizationError: { code?: string } | null = null;
      if (getDatabaseBackend() === 'neon') {
        assertApprovedNeonCutover();
        const sql = createNeonSql();
        const rows = await sql`
          select billing_country, currency from public.organizations
          where id = ${organizationInvoiceSync.organizationId}::uuid limit 1
        `;
        organization = (rows[0] as typeof organization | undefined) ?? null;
      } else {
        const result = await createAdminClient()
          .from('organizations')
          .select('billing_country, currency')
          .eq('id', organizationInvoiceSync.organizationId)
          .maybeSingle();
        organization = result.data;
        organizationError = result.error;
      }

      if (organizationError || !organization) {
        return jsonError(404, 'organization_not_found');
      }

      if (
        organization.billing_country !== organizationInvoiceSync.billingCountry
        || organization.currency !== organizationInvoiceSync.currency
      ) {
        console.warn('stripe organization invoice route mismatch', {
          eventId: organizationInvoiceSync.eventId,
          organizationId: organizationInvoiceSync.organizationId,
          expectedCountry: organization.billing_country,
          actualCountry: organizationInvoiceSync.billingCountry,
          expectedCurrency: organization.currency,
          actualCurrency: organizationInvoiceSync.currency,
        });
        return jsonError(409, 'organization_billing_route_mismatch');
      }

      const { data, error } = await syncStripeBillingRpc('sync_organization_invoice_event', {
        p_event_id: organizationInvoiceSync.eventId,
        p_event_type: organizationInvoiceSync.eventType,
        p_livemode: organizationInvoiceSync.livemode,
        p_organization_id: organizationInvoiceSync.organizationId,
        p_order_id: organizationInvoiceSync.orderId,
        p_invoice_id: organizationInvoiceSync.invoiceId,
      });

      if (error) {
        console.error('stripe organization invoice sync failed', {
          eventId: organizationInvoiceSync.eventId,
          organizationId: organizationInvoiceSync.organizationId,
          code: error.code,
        });
        return jsonError(500, 'organization_invoice_sync_failed');
      }

      let paymentMappings = 0;
      if (organizationInvoiceSync.eventType === 'invoice.paid' && !organizationInvoiceSync.testClock) {
        const secretKey = organizationInvoiceSync.livemode
          ? process.env.STRIPE_SECRET_KEY_LIVE
          : process.env.STRIPE_SECRET_KEY_TEST;

        try {
          const payments = await listStripePaidInvoicePayments({
            secretKey,
            livemode: organizationInvoiceSync.livemode,
            invoiceId: organizationInvoiceSync.invoiceId,
          });

          const mappedAmount = payments.reduce((sum, payment) => sum + payment.amountPaid, 0);
          if (mappedAmount !== organizationInvoiceSync.amountPaid) {
            console.error('stripe organization invoice payment amount mismatch', {
              eventId: organizationInvoiceSync.eventId,
              invoiceId: organizationInvoiceSync.invoiceId,
              organizationId: organizationInvoiceSync.organizationId,
              livemode: organizationInvoiceSync.livemode,
              invoiceAmountPaid: organizationInvoiceSync.amountPaid,
              mappedAmount,
            });
            if (organizationInvoiceSync.livemode) {
              return jsonError(500, 'organization_invoice_payment_amount_mismatch');
            }
          }

          for (const payment of payments) {
            if (payment.currency !== organizationInvoiceSync.currency) {
              console.error('stripe organization invoice payment currency mismatch', {
                eventId: organizationInvoiceSync.eventId,
                invoiceId: organizationInvoiceSync.invoiceId,
                organizationId: organizationInvoiceSync.organizationId,
                livemode: organizationInvoiceSync.livemode,
                invoiceCurrency: organizationInvoiceSync.currency,
                paymentCurrency: payment.currency,
              });
              if (organizationInvoiceSync.livemode) {
                return jsonError(500, 'organization_invoice_payment_currency_mismatch');
              }
              continue;
            }

            const { error: mappingError } = await syncStripeBillingRpc(
              'sync_organization_invoice_payment_event_v2',
              {
                p_event_id: organizationInvoiceSync.eventId,
                p_livemode: organizationInvoiceSync.livemode,
                p_organization_id: organizationInvoiceSync.organizationId,
                p_order_id: organizationInvoiceSync.orderId,
                p_invoice_id: organizationInvoiceSync.invoiceId,
                p_payment_intent_id: payment.paymentIntentId,
                p_paid_at: payment.paidAt,
                p_amount_paid: payment.amountPaid,
                p_currency: payment.currency,
                p_billing_reason: organizationInvoiceSync.billingReason,
              },
            );

            if (mappingError) {
              console.error('stripe organization invoice payment mapping failed', {
                eventId: organizationInvoiceSync.eventId,
                invoiceId: organizationInvoiceSync.invoiceId,
                organizationId: organizationInvoiceSync.organizationId,
                livemode: organizationInvoiceSync.livemode,
                code: mappingError.code,
              });
              if (organizationInvoiceSync.livemode) {
                return jsonError(500, 'organization_invoice_payment_mapping_failed');
              }
              continue;
            }

            paymentMappings += 1;
          }
        } catch (mappingLookupError) {
          console.error('stripe organization invoice payment lookup failed', {
            eventId: organizationInvoiceSync.eventId,
            invoiceId: organizationInvoiceSync.invoiceId,
            organizationId: organizationInvoiceSync.organizationId,
            livemode: organizationInvoiceSync.livemode,
            error: mappingLookupError instanceof Error ? mappingLookupError.message : 'unknown',
          });
          if (organizationInvoiceSync.livemode) {
            return jsonError(503, 'organization_invoice_payment_lookup_failed');
          }
        }
      }

      return NextResponse.json({
        received: true,
        organizationPaymentEvent: organizationInvoiceSync.eventType,
        paymentMappings,
        result: data,
      }, {
        status: 200,
        headers: { 'Cache-Control': 'no-store' },
      });
    } catch (error) {
      console.error('stripe organization invoice event processing failed', {
        eventId: organizationInvoiceSync.eventId,
        organizationId: organizationInvoiceSync.organizationId,
        error: error instanceof Error ? error.message : 'unknown',
      });
      return jsonError(503, 'organization_billing_not_configured');
    }
  }

  let organizationSubscriptionSync;
  try {
    organizationSubscriptionSync = normalizeStripeOrganizationSubscriptionEvent(event);
  } catch (error) {
    const code = error instanceof Error ? error.message : 'organization_subscription_event_invalid';
    console.warn('stripe organization subscription event rejected', {
      eventId: event.id,
      eventType: event.type,
      livemode: event.livemode,
      code,
    });
    return jsonError(400, 'invalid_organization_subscription_event');
  }

  if (organizationSubscriptionSync) {
    try {
      const { data, error } = await syncStripeBillingRpc('sync_organization_subscription_event', {
        p_event_id: organizationSubscriptionSync.eventId,
        p_event_type: organizationSubscriptionSync.eventType,
        p_livemode: organizationSubscriptionSync.livemode,
        p_organization_id: organizationSubscriptionSync.organizationId,
        p_order_id: organizationSubscriptionSync.orderId,
        p_subscription_id: organizationSubscriptionSync.subscriptionId,
        p_status: organizationSubscriptionSync.status,
      });

      if (error) {
        console.error('stripe organization subscription sync failed', {
          eventId: organizationSubscriptionSync.eventId,
          organizationId: organizationSubscriptionSync.organizationId,
          code: error.code,
        });
        return jsonError(500, 'organization_subscription_sync_failed');
      }

      return NextResponse.json({
        received: true,
        organizationSubscriptionEvent: organizationSubscriptionSync.eventType,
        result: data,
      }, {
        status: 200,
        headers: { 'Cache-Control': 'no-store' },
      });
    } catch (error) {
      console.error('stripe organization subscription event processing failed', {
        eventId: organizationSubscriptionSync.eventId,
        organizationId: organizationSubscriptionSync.organizationId,
        error: error instanceof Error ? error.message : 'unknown',
      });
      return jsonError(503, 'organization_billing_not_configured');
    }
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
      let error: { code?: string } | null = null;
      if (getDatabaseBackend() === 'neon') {
        assertApprovedNeonCutover();
        try {
          const sql = createNeonSql();
          await sql`
            insert into public.billing_events
              (provider, livemode, external_event_id, event_type, user_id, external_subscription_id)
            values ('stripe', ${invoiceSync.livemode}, ${invoiceSync.eventId}, ${invoiceSync.eventType},
              ${invoiceSync.userId}::uuid, ${invoiceSync.subscriptionId})
            on conflict (provider, livemode, external_event_id) do nothing
          `;
        } catch (neonError) {
          error = { code: neonError && typeof neonError === 'object' && 'code' in neonError ? String(neonError.code) : 'neon_insert_failed' };
        }
      } else {
        const result = await createAdminClient()
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
        error = result.error;
      }

      if (error) {
        console.error('stripe invoice event log failed', {
          eventId: invoiceSync.eventId,
          eventType: invoiceSync.eventType,
          livemode: invoiceSync.livemode,
          code: error.code,
        });
        return jsonError(500, 'invoice_event_log_failed');
      }

      let paymentMappings = 0;
      if (invoiceSync.eventType === 'invoice.paid' && invoiceSync.paidAt && !invoiceSync.testClock) {
        const secretKey = invoiceSync.livemode
          ? process.env.STRIPE_SECRET_KEY_LIVE
          : process.env.STRIPE_SECRET_KEY_TEST;

        try {
          const payments = await listStripePaidInvoicePayments({
            secretKey,
            livemode: invoiceSync.livemode,
            invoiceId: invoiceSync.invoiceId,
          });

          const mappedAmount = payments.reduce((sum, payment) => sum + payment.amountPaid, 0);
          if (mappedAmount !== invoiceSync.amountPaid) {
            console.error('stripe invoice payment amount mismatch', {
              eventId: invoiceSync.eventId,
              invoiceId: invoiceSync.invoiceId,
              livemode: invoiceSync.livemode,
              invoiceAmountPaid: invoiceSync.amountPaid,
              mappedAmount,
            });
            if (invoiceSync.livemode) return jsonError(500, 'invoice_payment_amount_mismatch');
          }

          for (const payment of payments) {
            if (payment.currency !== invoiceSync.currency) {
              console.error('stripe invoice payment currency mismatch', {
                eventId: invoiceSync.eventId,
                invoiceId: invoiceSync.invoiceId,
                livemode: invoiceSync.livemode,
                invoiceCurrency: invoiceSync.currency,
                paymentCurrency: payment.currency,
              });
              if (invoiceSync.livemode) return jsonError(500, 'invoice_payment_currency_mismatch');
              continue;
            }

            const { error: mappingError } = await syncStripeBillingRpc('sync_stripe_invoice_payment_event_v2', {
              p_event_id: invoiceSync.eventId,
              p_livemode: invoiceSync.livemode,
              p_user_id: invoiceSync.userId,
              p_subscription_id: invoiceSync.subscriptionId,
              p_invoice_id: invoiceSync.invoiceId,
              p_payment_intent_id: payment.paymentIntentId,
              p_paid_at: payment.paidAt,
              p_amount_paid: payment.amountPaid,
              p_currency: payment.currency,
              p_billing_reason: invoiceSync.billingReason,
            });
            if (mappingError) {
              console.error('stripe invoice payment mapping failed', {
                eventId: invoiceSync.eventId,
                invoiceId: invoiceSync.invoiceId,
                livemode: invoiceSync.livemode,
                code: mappingError.code,
              });
              if (invoiceSync.livemode) return jsonError(500, 'invoice_payment_mapping_failed');
              continue;
            }
            paymentMappings += 1;
          }
        } catch (mappingLookupError) {
          console.error('stripe invoice payment lookup failed', {
            eventId: invoiceSync.eventId,
            invoiceId: invoiceSync.invoiceId,
            livemode: invoiceSync.livemode,
            error: mappingLookupError instanceof Error ? mappingLookupError.message : 'unknown',
          });
          // LIVE disputes depend on this map, so make Stripe retry a transient failure.
          // Sandbox remains best-effort because test-clock and restricted-key setups vary.
          if (invoiceSync.livemode) return jsonError(503, 'invoice_payment_lookup_failed');
        }
      }

      return NextResponse.json({
        received: true,
        paymentEvent: invoiceSync.eventType,
        paymentMappings,
      }, {
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

  let disputeSync;
  try {
    disputeSync = normalizeStripeDisputeEvent(event);
  } catch (error) {
    const code = error instanceof Error ? error.message : 'dispute_event_invalid';
    console.warn('stripe dispute event rejected', {
      eventId: event.id,
      eventType: event.type,
      livemode: event.livemode,
      code,
    });
    return jsonError(400, 'invalid_dispute_event');
  }

  if (disputeSync) {
    try {
      const individualResult = await syncStripeBillingRpc('sync_stripe_dispute_event', {
        p_event_id: disputeSync.eventId,
        p_event_type: disputeSync.eventType,
        p_livemode: disputeSync.livemode,
        p_dispute_id: disputeSync.disputeId,
        p_payment_intent_id: disputeSync.paymentIntentId,
        p_status: disputeSync.status,
        p_event_at: disputeSync.eventAt,
      });

      let disputeResult = individualResult.data;
      if (individualResult.error?.message?.includes('stripe_dispute_payment_mapping_missing')) {
        const organizationResult = await syncStripeBillingRpc('sync_organization_stripe_dispute_event', {
          p_event_id: disputeSync.eventId,
          p_event_type: disputeSync.eventType,
          p_livemode: disputeSync.livemode,
          p_dispute_id: disputeSync.disputeId,
          p_payment_intent_id: disputeSync.paymentIntentId,
          p_status: disputeSync.status,
          p_amount_disputed: disputeSync.amountDisputed,
          p_currency: disputeSync.currency,
          p_event_at: disputeSync.eventAt,
        });

        if (organizationResult.error?.message?.includes('organization_stripe_dispute_payment_mapping_missing')) {
          console.warn('stripe dispute payment mapping is not ready', {
            eventId: disputeSync.eventId,
            disputeId: disputeSync.disputeId,
            paymentIntentId: disputeSync.paymentIntentId,
            livemode: disputeSync.livemode,
          });
          return jsonError(503, 'dispute_payment_mapping_pending');
        }

        if (organizationResult.error) {
          console.error('stripe organization dispute sync failed', {
            eventId: disputeSync.eventId,
            disputeId: disputeSync.disputeId,
            livemode: disputeSync.livemode,
            code: organizationResult.error.code,
          });
          return jsonError(500, 'organization_dispute_sync_failed');
        }

        disputeResult = organizationResult.data;
      } else if (individualResult.error) {
        console.error('stripe dispute sync failed', {
          eventId: disputeSync.eventId,
          disputeId: disputeSync.disputeId,
          livemode: disputeSync.livemode,
          code: individualResult.error.code,
        });
        return jsonError(500, 'dispute_sync_failed');
      }

      return NextResponse.json({
        received: true,
        disputeEvent: disputeSync.eventType,
        result: disputeResult,
      }, {
        status: 200,
        headers: { 'Cache-Control': 'no-store' },
      });
    } catch (error) {
      console.error('stripe dispute event processing failed', {
        eventId: disputeSync.eventId,
        disputeId: disputeSync.disputeId,
        livemode: disputeSync.livemode,
        error: error instanceof Error ? error.message : 'unknown',
      });
      return jsonError(503, 'billing_not_configured');
    }
  }

  let refundSync;
  try {
    refundSync = normalizeStripeRefundEvent(event);
  } catch (error) {
    const code = error instanceof Error ? error.message : 'refund_event_invalid';
    console.warn('stripe refund event rejected', {
      eventId: event.id,
      eventType: event.type,
      livemode: event.livemode,
      code,
    });
    return jsonError(400, 'invalid_refund_event');
  }

  if (refundSync) {
    const secretKey = refundSync.livemode
      ? process.env.STRIPE_SECRET_KEY_LIVE
      : process.env.STRIPE_SECRET_KEY_TEST;

    try {
      const refundState = await retrieveStripeChargeRefundState({
        secretKey,
        livemode: refundSync.livemode,
        chargeId: refundSync.chargeId,
      });

      const { data, error } = await syncStripeBillingRpc('sync_stripe_refund_state', {
        p_event_id: refundSync.eventId,
        p_event_type: refundSync.eventType,
        p_livemode: refundSync.livemode,
        p_charge_id: refundState.chargeId,
        p_payment_intent_id: refundState.paymentIntentId,
        p_amount_total: refundState.amountTotal,
        p_amount_refunded: refundState.amountRefunded,
        p_fully_refunded: refundState.fullyRefunded,
        p_event_at: refundSync.eventAt,
      });

      let refundResult = data;
      if (error?.message?.includes('stripe_refund_payment_mapping_missing')) {
        const organizationResult = await syncStripeBillingRpc('sync_organization_stripe_refund_state', {
          p_event_id: refundSync.eventId,
          p_event_type: refundSync.eventType,
          p_livemode: refundSync.livemode,
          p_charge_id: refundState.chargeId,
          p_payment_intent_id: refundState.paymentIntentId,
          p_amount_total: refundState.amountTotal,
          p_amount_refunded: refundState.amountRefunded,
          p_fully_refunded: refundState.fullyRefunded,
          p_event_at: refundSync.eventAt,
        });

        if (organizationResult.error?.message?.includes('organization_stripe_refund_payment_mapping_missing')) {
          console.warn('stripe refund payment mapping is not ready', {
            eventId: refundSync.eventId,
            chargeId: refundState.chargeId,
            paymentIntentId: refundState.paymentIntentId,
            livemode: refundSync.livemode,
          });
          if (refundSync.livemode) return jsonError(503, 'refund_payment_mapping_pending');
          return NextResponse.json({ received: true, ignored: true }, {
            status: 200,
            headers: { 'Cache-Control': 'no-store' },
          });
        }

        if (organizationResult.error) {
          console.error('stripe organization refund sync failed', {
            eventId: refundSync.eventId,
            chargeId: refundState.chargeId,
            livemode: refundSync.livemode,
            code: organizationResult.error.code,
          });
          return jsonError(500, 'organization_refund_sync_failed');
        }

        refundResult = organizationResult.data;
      } else if (error) {
        console.error('stripe refund sync failed', {
          eventId: refundSync.eventId,
          chargeId: refundState.chargeId,
          livemode: refundSync.livemode,
          code: error.code,
        });
        return jsonError(500, 'refund_sync_failed');
      }

      if (refundSync.livemode && secretKey) {
        await reconcileWithdrawalRefundEvent(secretKey, event.data.object);
        await reconcileServiceChangeRefundEvent(secretKey, event.data.object);
      }

      return NextResponse.json({
        received: true,
        refundEvent: refundSync.eventType,
        fullRefund: refundState.fullyRefunded,
        result: refundResult,
      }, {
        status: 200,
        headers: { 'Cache-Control': 'no-store' },
      });
    } catch (error) {
      console.error('stripe refund event processing failed', {
        eventId: refundSync.eventId,
        chargeId: refundSync.chargeId,
        livemode: refundSync.livemode,
        error: error instanceof Error ? error.message : 'unknown',
      });
      return jsonError(503, 'refund_state_lookup_failed');
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

  let verifiedBillingCountry = sync.billingCountry;
  let verifiedCheckoutSessionId: string | null = null;
  if (sync.livemode) {
    const liveSecretKey = process.env.STRIPE_SECRET_KEY_LIVE;
    if (!isStripeLiveSecretKey(liveSecretKey)) {
      console.error('live Stripe checkout verification is not configured', {
        eventId: sync.eventId,
        subscriptionId: sync.subscriptionId,
      });
      return jsonError(503, 'live_checkout_verification_not_configured');
    }

    try {
      const verification = await verifyStripeCheckoutBillingCountry({
        secretKey: liveSecretKey,
        livemode: true,
        subscriptionId: sync.subscriptionId,
        customerId: sync.customerId,
        userId: sync.userId,
        declaredBillingCountry: sync.billingCountry,
        expectedCurrency: sync.currency,
        expectedManagedPayments: sync.merchantOfRecord,
        expectedContractSnapshotId: sync.contractSnapshotId,
      }, billingRouteForCountry);
      verifiedBillingCountry = verification.billingCountry;
      verifiedCheckoutSessionId = verification.checkoutSessionId;

      const currentSubscription = await retrieveStripeSubscription(liveSecretKey, sync.subscriptionId);
      const canonical = canonicalStripeSubscriptionState(currentSubscription);
      if (
        canonical.subscriptionId !== sync.subscriptionId
        || canonical.customerId !== sync.customerId
        || canonical.userId !== sync.userId
      ) {
        throw new Error('stripe_subscription_canonical_identity_mismatch');
      }

      const canonicalRoute = billingRouteForCountry(canonical.billingCountry);
      if (
        canonicalRoute.currency !== canonical.currency
        || canonicalRoute.managedPayments !== canonical.merchantOfRecord
      ) {
        throw new Error('stripe_subscription_canonical_route_mismatch');
      }

      verifiedBillingCountry = canonical.billingCountry;
      sync = {
        ...sync,
        priceId: canonical.priceId,
        currency: canonical.currency,
        merchantOfRecord: canonical.merchantOfRecord,
        status: canonical.status,
        cancelAtPeriodEnd: canonical.cancelAtPeriodEnd,
        currentPeriodStart: canonical.currentPeriodStart,
        currentPeriodEnd: canonical.currentPeriodEnd,
        canceledAt: canonical.canceledAt,
        billingCountry: canonical.billingCountry,
        checkoutSessionId: verifiedCheckoutSessionId,
      };
    } catch (error) {
      console.warn('live Stripe billing-country verification rejected subscription event', {
        eventId: sync.eventId,
        eventType: sync.eventType,
        subscriptionId: sync.subscriptionId,
        code: error instanceof Error ? error.message : 'billing_country_verification_failed',
      });
      return jsonError(409, 'billing_country_verification_failed');
    }
  }

  try {
    const { data, error } = await syncStripeBillingRpc('sync_stripe_subscription_event', {
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
      p_billing_country: verifiedBillingCountry,
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

    const lifecycleNotification = billingLifecycleNotification(sync);
    if (lifecycleNotification) {
      try {
        await deliverBillingLifecycleEmail(
          { ...sync, billingCountry: verifiedBillingCountry },
          lifecycleNotification,
        );
      } catch (emailError) {
        const code = emailError instanceof BillingEmailDeliveryError
          ? emailError.code
          : 'billing_email_unknown_error';
        console.error('billing lifecycle email delivery failed', {
          eventId: sync.eventId,
          eventType: sync.eventType,
          notification: lifecycleNotification,
          code,
        });
        return jsonError(503, 'billing_email_delivery_failed');
      }
    }

    if (sync.livemode) {
      after(async () => {
        try {
          if (lifecycleNotification === 'subscription_activated') {
            await emitSubscriptionUpgraded(sync.userId);
          } else {
            await syncMarketingPlan(sync.userId);
          }
        } catch (marketingError) {
          console.warn('marketing billing sync failed', {
            code: marketingError instanceof Error ? marketingError.message : 'unknown',
          });
        }
      });
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
