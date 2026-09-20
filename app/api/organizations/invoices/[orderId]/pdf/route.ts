import { NextResponse } from 'next/server';
import { getAuthenticatedUserId } from '@/lib/auth';
import { getOrganizationBankInvoiceData } from '@/lib/organization-bank-invoice';
import { createOrganizationInvoicePdfBuffer } from '@/lib/organization-invoice-pdf';
import { canManageOrganization, getCurrentOrganizationForUser } from '@/lib/organizations';
import { createAdminClient } from '@/lib/supabase/admin';
import { isSuperadminUserId } from '@/lib/superadmin';

export const dynamic = 'force-dynamic';

export async function GET(
  _request: Request,
  context: { params: Promise<{ orderId: string }> },
) {
  const { orderId } = await context.params;
  const { userId } = await getAuthenticatedUserId();

  if (!userId) {
    return NextResponse.json({ error: 'authentication_required' }, { status: 401 });
  }

  const admin = createAdminClient();
  const { data: order } = await admin
    .from('organization_orders')
    .select('organization_id')
    .eq('id', orderId)
    .maybeSingle();

  if (!order) {
    return NextResponse.json({ error: 'invoice_not_found' }, { status: 404 });
  }

  if (!isSuperadminUserId(userId)) {
    const organization = await getCurrentOrganizationForUser(userId);
    if (
      !organization
      || organization.id !== order.organization_id
      || !canManageOrganization(organization.role)
    ) {
      return NextResponse.json({ error: 'invoice_not_found' }, { status: 404 });
    }
  }

  try {
    const invoice = await getOrganizationBankInvoiceData(orderId);
    const pdf = await createOrganizationInvoicePdfBuffer(
      invoice,
      invoice.snapshot.documentLocale,
    );

    return new Response(pdf, {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': 'inline; filename="' + invoice.invoiceNumber + '.pdf"',
        'Cache-Control': 'private, no-store',
      },
    });
  } catch (error) {
    console.error('organization invoice pdf failed', {
      orderId,
      error: error instanceof Error ? error.message : 'unknown',
    });
    return NextResponse.json({ error: 'invoice_pdf_failed' }, { status: 500 });
  }
}
