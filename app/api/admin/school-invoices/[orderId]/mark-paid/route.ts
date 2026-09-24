import { NextResponse } from 'next/server';
import { getAuthenticatedUserId } from '@/lib/auth';
import { createPrivilegedRpcClient } from '@/lib/neon/privileged-rpc';
import { isSuperadminUserId } from '@/lib/superadmin';
import {
  loadOrganizationFirstActivation,
  scheduleOrganizationOwnerActivated,
} from '@/lib/marketing-lifecycle';

export async function POST(
  _request: Request,
  context: { params: Promise<{ orderId: string }> },
) {
  const { orderId } = await context.params;
  const { userId } = await getAuthenticatedUserId();

  if (!userId) {
    return NextResponse.json({ error: 'authentication_required' }, { status: 401 });
  }
  if (!isSuperadminUserId(userId)) {
    return NextResponse.json({ error: 'superadmin_required' }, { status: 403 });
  }

  const firstActivation = await loadOrganizationFirstActivation({ orderId });
  const admin = createPrivilegedRpcClient();
  const { data, error } = await admin.rpc(
    'confirm_organization_bank_payment_manual',
    {
      p_order_id: orderId,
      p_actor_user_id: userId,
    },
  );

  if (error) {
    const message = error.message ?? '';
    const code = message.includes('not_bank_invoice')
      ? 'organization_order_not_bank_invoice'
      : message.includes('not_payable')
        ? 'organization_order_not_payable'
        : message.includes('superadmin_required')
          ? 'superadmin_required'
          : 'organization_bank_payment_confirmation_failed';

    console.error('organization bank payment manual confirmation failed', {
      orderId,
      actorUserId: userId,
      code: error.code,
      message,
    });

    return NextResponse.json(
      { error: code },
      { status: code === 'organization_bank_payment_confirmation_failed' ? 500 : 409 },
    );
  }

  if ((data as { processed?: unknown } | null)?.processed === true) {
    scheduleOrganizationOwnerActivated(firstActivation);
  }

  return NextResponse.json({ confirmed: true, result: data });
}
