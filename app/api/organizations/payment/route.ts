import { NextResponse } from 'next/server';
import { getAuthenticatedUserId } from '@/lib/auth';
import { issueOrganizationBankInvoice } from '@/lib/organization-bank-invoice';
import { startOrganizationPayment } from '@/lib/organization-payment';
import { OrganizationStripeError } from '@/lib/organization-stripe';
import { canManageOrganization, getCurrentOrganizationForUser } from '@/lib/organizations';
import { isPublicSchoolBillingEnabled } from '@/lib/school-billing-launch';
import { createAdminClient } from '@/lib/supabase/admin';
import { assertApprovedNeonCutover, getDatabaseBackend } from '@/lib/neon/config';
import { createNeonSql } from '@/lib/neon/server';
import { readProfileRole } from '@/lib/neon/profile-role';


function paymentDiagnostic(error: unknown) {
  if (error instanceof OrganizationStripeError) {
    return {
      code: error.code,
      stripeType: error.stripeType ?? null,
      stripeCode: error.stripeCode ?? null,
    };
  }

  const code = error instanceof Error && /^[a-z0-9_]+$/.test(error.message)
    ? error.message
    : 'unknown_error';
  return { code, stripeType: null, stripeCode: null };
}

export async function POST() {
  const { userId } = await getAuthenticatedUserId();
  if (!userId) {
    return NextResponse.json({ error: 'authentication_required' }, { status: 401 });
  }

  const organization = await getCurrentOrganizationForUser(userId);
  if (!organization || !canManageOrganization(organization.role)) {
    return NextResponse.json({ error: 'organization_admin_required' }, { status: 403 });
  }

  const profileRole = await readProfileRole(userId);

  if (organization.status !== 'awaiting_payment' && organization.status !== 'past_due') {
    return NextResponse.json({ error: 'organization_not_payable' }, { status: 409 });
  }

  const [orgResult, orderResult] = getDatabaseBackend() === 'neon'
    ? await (async () => {
      assertApprovedNeonCutover();
      const sql = createNeonSql();
      const [orgRows, orderRows] = await Promise.all([
        sql`
          select billing_address from public.organizations
          where id = ${organization.id}::uuid limit 1
        `,
        sql`
          select id, billing_period, currency, amount_minor, payment_method,
            external_customer_id, external_checkout_session_id, external_checkout_url, livemode
          from public.organization_orders
          where organization_id = ${organization.id}::uuid
            and status in ('awaiting_payment', 'ordered')
          order by created_at desc limit 1
        `,
      ]);
      return [
        { data: orgRows[0] ?? null, error: null },
        { data: orderRows[0] ?? null, error: null },
      ] as const;
    })()
    : await Promise.all([
      createAdminClient().from('organizations').select('billing_address')
        .eq('id', organization.id).maybeSingle(),
      createAdminClient().from('organization_orders')
        .select('id, billing_period, currency, amount_minor, payment_method, external_customer_id, external_checkout_session_id, external_checkout_url, livemode')
        .eq('organization_id', organization.id)
        .in('status', ['awaiting_payment', 'ordered'])
        .order('created_at', { ascending: false }).limit(1).maybeSingle(),
    ]);

  if (orgResult.error || orderResult.error || !orderResult.data) {
    return NextResponse.json({ error: 'payable_order_not_found' }, { status: 404 });
  }

  const livemode = orderResult.data.livemode !== false;
  if (!livemode && profileRole !== 'admin') {
    return NextResponse.json({ error: 'school_sandbox_billing_forbidden' }, { status: 403 });
  }
  if (livemode && !isPublicSchoolBillingEnabled() && profileRole !== 'admin') {
    return NextResponse.json({ error: 'school_live_billing_not_public' }, { status: 403 });
  }

  if (orderResult.data.payment_method === 'invoice') {
    try {
      const invoice = await issueOrganizationBankInvoice(orderResult.data.id);
      return NextResponse.json({
        paymentUrl: invoice.invoiceUrl,
        paymentKind: 'bank_invoice',
        invoiceNumber: invoice.invoiceNumber,
        variableSymbol: invoice.variableSymbol,
      });
    } catch (error) {
      const code = error instanceof Error ? error.message : 'unknown_error';
      console.error('organization bank invoice retry failed', {
        organizationId: organization.id,
        orderId: orderResult.data.id,
        error: code,
      });
      return NextResponse.json({
        error: 'organization_bank_invoice_issue_failed',
        ...(!livemode && profileRole === 'admin'
          ? { diagnostic: { code, stripeType: null, stripeCode: null } }
          : {}),
      }, { status: 502 });
    }
  }

  try {
    const payment = await startOrganizationPayment({
      environment: livemode ? 'live' : 'sandbox',
      organization: {
        id: organization.id,
        name: organization.name,
        legalName: organization.legalName,
        billingEmail: organization.billingEmail,
        billingCountry: organization.billingCountry,
        billingAddress: (orgResult.data?.billing_address ?? {}) as {
          line1?: string;
          line2?: string;
          city?: string;
          postalCode?: string;
        },
        planCode: organization.planCode,
      },
      order: {
        id: orderResult.data.id,
        billingPeriod: orderResult.data.billing_period,
        currency: orderResult.data.currency,
        amountMinor: orderResult.data.amount_minor,
        paymentMethod: orderResult.data.payment_method,
        externalCustomerId: orderResult.data.external_customer_id,
        externalCheckoutSessionId: orderResult.data.external_checkout_session_id,
        externalCheckoutUrl: orderResult.data.external_checkout_url,
      },
    });

    return NextResponse.json(payment);
  } catch (error) {
    const diagnostic = !livemode && profileRole === 'admin'
      ? paymentDiagnostic(error)
      : null;

    console.error('organization payment retry failed', {
      organizationId: organization.id,
      error: error instanceof Error ? error.message : 'unknown',
      stripeType: error instanceof OrganizationStripeError ? error.stripeType : null,
      stripeCode: error instanceof OrganizationStripeError ? error.stripeCode : null,
    });
    return NextResponse.json({
      error: 'organization_payment_start_failed',
      ...(diagnostic ? { diagnostic } : {}),
    }, { status: 502 });
  }
}
