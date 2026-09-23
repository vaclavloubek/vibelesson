import { NextResponse } from 'next/server';
import { runComplaintMaintenance } from '@/lib/complaints';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// LEGAL-017: retry undelivered complaint confirmations and remind the operator
// of complaints approaching or past the 30-day resolution deadline.
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get('authorization') !== 'Bearer ' + secret) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401, headers: { 'Cache-Control': 'no-store' } });
  }
  try {
    return NextResponse.json({ ok: true, ...await runComplaintMaintenance() }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    console.error('complaint maintenance cron failed', { error: error instanceof Error ? error.message : 'unknown' });
    return NextResponse.json({ error: 'complaint_maintenance_failed' }, { status: 500, headers: { 'Cache-Control': 'no-store' } });
  }
}
