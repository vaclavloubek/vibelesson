import { NextResponse } from 'next/server';
import {
  processOneNeonGradingOutboxJob,
  useNeonGradingOutboxWorker,
} from '@/lib/neon/grading-outbox-worker';

export const maxDuration = 60;

export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get('authorization') !== `Bearer ${secret}`) {
    return new NextResponse(null, { status: 401 });
  }
  if (!useNeonGradingOutboxWorker()) {
    return NextResponse.json({ ok: true, disabled: true });
  }

  const result = await processOneNeonGradingOutboxJob();
  return NextResponse.json({ ok: true, ...result });
}
