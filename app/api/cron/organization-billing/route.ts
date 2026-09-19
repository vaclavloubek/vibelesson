import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  const authorization = request.headers.get('authorization');

  if (!secret || authorization !== 'Bearer ' + secret) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const admin = createAdminClient();

  const [expiredResult, suspendedResult] = await Promise.all([
    admin.rpc('expire_organization_licenses'),
    admin.rpc('suspend_overdue_organizations', { p_grace_days: 14 }),
  ]);

  if (expiredResult.error || suspendedResult.error) {
    console.error('organization billing cron failed', {
      expireCode: expiredResult.error?.code,
      suspendCode: suspendedResult.error?.code,
    });
    return NextResponse.json(
      { error: 'organization_billing_cron_failed' },
      { status: 500 },
    );
  }

  return NextResponse.json({
    ok: true,
    expired: expiredResult.data ?? 0,
    suspended: suspendedResult.data ?? 0,
  }, {
    headers: { 'Cache-Control': 'no-store' },
  });
}
