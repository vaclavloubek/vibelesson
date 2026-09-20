import { NextResponse } from 'next/server';
import { getAuthenticatedUserId } from '@/lib/auth';
import {
  MarketingLifecycleError,
  syncMarketingPreference,
} from '@/lib/marketing-lifecycle';

export async function POST() {
  const { userId } = await getAuthenticatedUserId();
  if (!userId) {
    return NextResponse.json({ error: 'authentication_required' }, { status: 401 });
  }

  try {
    const result = await syncMarketingPreference(userId);
    return NextResponse.json({ synced: true, status: result.status }, {
      headers: { 'Cache-Control': 'no-store' },
    });
  } catch (error) {
    const code = error instanceof MarketingLifecycleError
      ? error.code
      : 'marketing_sync_unknown_error';
    console.error('marketing preference delivery sync failed', { code });
    return NextResponse.json({ error: 'marketing_sync_failed' }, {
      status: 503,
      headers: { 'Cache-Control': 'no-store' },
    });
  }
}
