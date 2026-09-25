import { NextResponse } from 'next/server';
import {
  drainNeonGradingOutbox,
  useNeonGradingOutboxWorker,
} from '@/lib/neon/grading-outbox-worker';
import { drainAiGradingQuotaNotices } from '@/lib/marketing-lifecycle';
import { createNeonSql } from '@/lib/neon/server';
import { isAuthorizedCronRequest } from '@/lib/cron-auth';

export const maxDuration = 60;

// Safety net for the Supabase pg_cron jobs (grading retry, free-session expiry,
// retention cleanup). Submissions drain the grading queue immediately; this
// runs sparsely so the Neon compute can scale to zero between lessons.
// It also ends time-limited manual plan grants (neon/migrations/0013) and
// retries AI grading quota notices (neon/migrations/0016).
export async function GET(req: Request) {
  if (!isAuthorizedCronRequest(req)) {
    return new NextResponse(null, { status: 401 });
  }
  if (!useNeonGradingOutboxWorker()) {
    return NextResponse.json({ ok: true, disabled: true });
  }

  const sql = createNeonSql();
  const [expiredOverrides] = await sql`select private.expire_manual_entitlement_overrides() as count`;
  const [expired] = await sql`select private.expire_free_sessions() as count`;
  const [purged] = await sql`select * from private.purge_expired_session_data()`;
  const grading = await drainNeonGradingOutbox(40_000);
  // Retries failed notices even when no grading job ran in this pass.
  let quotaNoticeRetry: Awaited<ReturnType<typeof drainAiGradingQuotaNotices>> | null = null;
  try {
    quotaNoticeRetry = await drainAiGradingQuotaNotices(20);
  } catch (error) {
    console.error('cron AI grading quota notice drain failed', {
      error: error instanceof Error ? error.message : 'unknown',
    });
  }
  return NextResponse.json({
    ok: true,
    expiredEntitlementOverrides: Number(expiredOverrides?.count ?? 0),
    expiredFreeSessions: Number(expired?.count ?? 0),
    purged,
    ...grading,
    quotaNoticeRetry,
  });
}
