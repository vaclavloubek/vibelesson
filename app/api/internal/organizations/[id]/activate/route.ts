import { NextResponse } from 'next/server';
import { getAuthenticatedUserId } from '@/lib/auth';
import { createAdminClient } from '@/lib/supabase/admin';

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { userId } = await getAuthenticatedUserId();
  if (!userId) {
    return NextResponse.json({ error: 'authentication_required' }, { status: 401 });
  }
  const { id } = await params;
  const admin = createAdminClient();

  const { data: profile } = await admin
    .from('profiles')
    .select('role')
    .eq('id', userId)
    .maybeSingle();

  if (profile?.role !== 'admin') {
    return NextResponse.json({ error: 'admin_required' }, { status: 403 });
  }

  const { data: order, error: orderError } = await admin
    .from('organization_orders')
    .select('id, billing_period')
    .eq('organization_id', id)
    .eq('status', 'awaiting_payment')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (orderError || !order) {
    return NextResponse.json({ error: 'payable_order_not_found' }, { status: 404 });
  }

  const start = new Date();
  const end = new Date(start);
  if (order.billing_period === 'annual') end.setUTCFullYear(end.getUTCFullYear() + 1);
  else end.setUTCMonth(end.getUTCMonth() + 1);

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

  return NextResponse.json({
    activated: true,
    currentPeriodEnd: end.toISOString(),
  });
}
