import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret || request.headers.get('authorization') !== 'Bearer ' + cronSecret) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const admin = createAdminClient();
  const { data, error } = await admin.rpc('expire_organization_licenses');
  if (error) {
    console.error('school lifecycle cron failed', error);
    return NextResponse.json({ error: 'school_lifecycle_failed' }, { status: 500 });
  }

  return NextResponse.json({
    ok: true,
    expiredOrganizations: typeof data === 'number' ? data : Number(data ?? 0),
  }, { headers: { 'Cache-Control': 'no-store' } });
}
