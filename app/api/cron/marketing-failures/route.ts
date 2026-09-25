import { NextResponse } from 'next/server';
import { isAuthorizedCronRequest } from '@/lib/cron-auth';
import { sendMarketingFailureDigest } from '@/lib/marketing-failures';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Audit B6: daily digest of marketing lifecycle (Resend) failures for the operator.
export async function GET(request: Request) {
  if (!isAuthorizedCronRequest(request)) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401, headers: { 'Cache-Control': 'no-store' } });
  }
  try {
    return NextResponse.json({ ok: true, ...await sendMarketingFailureDigest() }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    console.error('marketing failure digest cron failed', { error: error instanceof Error ? error.message : 'unknown' });
    return NextResponse.json({ error: 'marketing_failure_digest_failed' }, { status: 500, headers: { 'Cache-Control': 'no-store' } });
  }
}
