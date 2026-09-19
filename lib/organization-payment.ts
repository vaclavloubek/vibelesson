import { billingRouteForCountry } from '@/lib/billing-region';
import {
  createOrganizationCardCheckout,
  createOrganizationInvoice,
  createOrganizationStripeCustomer,
} from '@/lib/organization-stripe';
import type {
  OrganizationBillingPeriod,
  OrganizationPlanCode,
} from '@/lib/organization-billing-catalog';
import { createAdminClient } from '@/lib/supabase/admin';

type BillingEnvironment = 'sandbox' | 'live';

type OrganizationPaymentInput = {
  environment: BillingEnvironment;
  organization: {
    id: string;
    name: string;
    legalName: string | null;
    registrationNumber: string | null;
    vatId: string | null;
    billingEmail: string;
    billingCountry: string;
    billingAddress: {
      line1?: string;
      line2?: string;
      city?: string;
      postalCode?: string;
    };
    planCode: OrganizationPlanCode;
  };
  order: {
    id: string;
    billingPeriod: OrganizationBillingPeriod;
    currency: 'czk' | 'eur' | 'usd';
    amountMinor: number;
    paymentMethod: 'card' | 'invoice';
    externalCustomerId: string | null;
    externalCheckoutSessionId: string | null;
    externalCheckoutUrl: string | null;
    externalInvoiceId: string | null;
    hostedInvoiceUrl: string | null;
  };
};

export async function startOrganizationPayment(input: OrganizationPaymentInput) {
  const livemode = input.environment === 'live';
  const secretKey = livemode
    ? process.env.STRIPE_SECRET_KEY_LIVE
    : process.env.STRIPE_SECRET_KEY_TEST;

  const expectedSecret = livemode
    ? /^(?:sk|rk)_live_/.test(secretKey ?? '')
    : /^(?:sk|rk)_test_/.test(secretKey ?? '');

  if (!secretKey || !expectedSecret) {
    throw new Error(livemode
      ? 'school_live_billing_not_configured'
      : 'school_sandbox_billing_not_configured');
  }

  const admin = createAdminClient();
  let customerId = input.order.externalCustomerId;

  if (!customerId) {
    customerId = await createOrganizationStripeCustomer({
      secretKey,
      livemode,
      organizationId: input.organization.id,
      orderId: input.order.id,
      name: input.organization.name,
      legalName: input.organization.legalName,
      billingEmail: input.organization.billingEmail,
      billingCountry: input.organization.billingCountry,
      address: input.organization.billingAddress,
    });

    const { error } = await admin
      .from('organization_orders')
      .update({
        external_customer_id: customerId,
        updated_at: new Date().toISOString(),
      })
      .eq('id', input.order.id)
      .eq('organization_id', input.organization.id);

    if (error) throw new Error('organization_customer_link_failed');
  }

  if (input.order.paymentMethod === 'card') {
    if (input.order.externalCheckoutSessionId && input.order.externalCheckoutUrl) {
      return {
        paymentUrl: input.order.externalCheckoutUrl,
        paymentKind: 'checkout' as const,
      };
    }
    if (input.order.externalCheckoutSessionId) {
      throw new Error('organization_checkout_resume_url_missing');
    }

    const route = billingRouteForCountry(input.organization.billingCountry);
    const checkout = await createOrganizationCardCheckout({
      secretKey,
      livemode,
      customerId,
      organizationId: input.organization.id,
      orderId: input.order.id,
      planCode: input.organization.planCode,
      billingPeriod: input.order.billingPeriod,
      currency: input.order.currency,
      amountMinor: input.order.amountMinor,
      managedPayments: route.managedPayments,
    });

    const { error } = await admin
      .from('organization_orders')
      .update({
        external_checkout_session_id: checkout.sessionId,
        external_checkout_url: checkout.url,
        updated_at: new Date().toISOString(),
      })
      .eq('id', input.order.id)
      .eq('organization_id', input.organization.id);

    if (error) throw new Error('organization_checkout_link_failed');

    return {
      paymentUrl: checkout.url,
      paymentKind: 'checkout' as const,
    };
  }

  if (input.order.hostedInvoiceUrl) {
    return {
      paymentUrl: input.order.hostedInvoiceUrl,
      paymentKind: 'invoice' as const,
    };
  }

  const invoice = await createOrganizationInvoice({
    secretKey,
    livemode,
    customerId,
    organizationId: input.organization.id,
    orderId: input.order.id,
    planCode: input.organization.planCode,
    billingPeriod: input.order.billingPeriod,
    currency: input.order.currency,
    amountMinor: input.order.amountMinor,
    registrationNumber: input.organization.registrationNumber,
    vatId: input.organization.vatId,
    billingCountry: input.organization.billingCountry,
  });

  const { error } = await admin
    .from('organization_orders')
    .update({
      external_invoice_id: invoice.invoiceId,
      hosted_invoice_url: invoice.hostedInvoiceUrl,
      invoice_pdf_url: invoice.invoicePdfUrl,
      updated_at: new Date().toISOString(),
    })
    .eq('id', input.order.id)
    .eq('organization_id', input.organization.id);

  if (error) throw new Error('organization_invoice_link_failed');

  return {
    paymentUrl: invoice.hostedInvoiceUrl,
    paymentKind: 'invoice' as const,
  };
}
