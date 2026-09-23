import { NextResponse } from 'next/server';
import {
  drainNeonGradingOutbox,
  useNeonGradingOutboxWorker,
} from '@/lib/neon/grading-outbox-worker';
import { createNeonSql } from '@/lib/neon/server';

export const maxDuration = 60;

// Safety net for the Supabase pg_cron jobs (grading retry, free-session expiry,
// retention cleanup). Submissions drain the grading queue immediately; this
// runs sparsely so the Neon compute can scale to zero between lessons.
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get('authorization') !== `Bearer ${secret}`) {
    return new NextResponse(null, { status: 401 });
  }
  if (!useNeonGradingOutboxWorker()) {
    return NextResponse.json({ ok: true, disabled: true });
  }

  const sql = createNeonSql();
  const [expired] = await sql`select private.expire_free_sessions() as count`;
  const [purged] = await sql`select * from private.purge_expired_session_data()`;
  const grading = await drainNeonGradingOutbox(40_000);
  return NextResponse.json({
    ok: true,
    expiredFreeSessions: Number(expired?.count ?? 0),
    purged,
    ...grading,
  });
}
