import { NextResponse } from 'next/server';
import { getAuthenticatedUserId } from '@/lib/auth';
import { createAdminClient } from '@/lib/supabase/admin';
import { assertApprovedNeonCutover, getDatabaseBackend } from '@/lib/neon/config';
import { createNeonSql } from '@/lib/neon/server';
import { createPrivilegedRpcClient } from '@/lib/neon/privileged-rpc';
import { readProfileRole } from '@/lib/neon/profile-role';
import {
  loadOrganizationFirstActivation,
  scheduleOrganizationOwnerActivated,
} from '@/lib/marketing-lifecycle';

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { userId } = await getAuthenticatedUserId();
  if (!userId) {
    return NextResponse.json({ error: 'authentication_required' }, { status: 401 });
  }
  const { id } = await params;
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)) {
    return NextResponse.json({ error: 'invalid_organization_id' }, { status: 400 });
  }
  const admin = createPrivilegedRpcClient();

  if (await readProfileRole(userId) !== 'admin') {
    return NextResponse.json({ error: 'admin_required' }, { status: 403 });
  }

  const { data: order, error: orderError } = getDatabaseBackend() === 'neon'
    ? await (async () => {
      assertApprovedNeonCutover();
      const rows = await createNeonSql()`
        select id, billing_period from public.organization_orders
        where organization_id = ${id}::uuid and status = 'awaiting_payment'
        order by created_at desc limit 1
      `;
      return { data: rows[0] ?? null, error: null };
    })()
    : await createAdminClient().from('organization_orders')
      .select('id, billing_period').eq('organization_id', id)
      .eq('status', 'awaiting_payment')
      .order('created_at', { ascending: false }).limit(1).maybeSingle();

  if (orderError || !order) {
    return NextResponse.json({ error: 'payable_order_not_found' }, { status: 404 });
  }

  const start = new Date();
  const end = new Date(start);
  if (order.billing_period === 'annual') end.setUTCFullYear(end.getUTCFullYear() + 1);
  else end.setUTCMonth(end.getUTCMonth() + 1);

  const firstActivation = await loadOrganizationFirstActivation({ orderId: order.id });
  const { error } = await admin.rpc('activate_organization_order', {
    p_organization_id: id,
    p_order_id: order.id,
    p_period_start: start.toISOString(),
    p_period_end: end.toISOString(),
  });

  if (error) {
    console.error('organization manual activation failed', error);
    return NextResponse.json({ error: 'organization_activation_failed' }, { status: 500 });
  }

  scheduleOrganizationOwnerActivated(firstActivation);

  return NextResponse.json({
    activated: true,
    currentPeriodEnd: end.toISOString(),
  });
}
