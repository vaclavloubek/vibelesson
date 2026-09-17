import { NextResponse } from 'next/server';
import { getAuthenticatedUserId } from '@/lib/auth';
import { loadTeacherScoreboard } from '@/lib/scoreboard-server';

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(_req: Request, { params }: RouteContext) {
  const { supabase, userId } = await getAuthenticatedUserId();
  if (!userId) return NextResponse.json({ error: 'Nejdřív se přihlas.' }, { status: 401 });

  const { id: sessionId } = await params;
  const result = await loadTeacherScoreboard(sessionId, userId, supabase);
  if ('error' in result) return NextResponse.json({ error: result.error }, { status: result.status });

  const {
    status,
    scoreboardRevealed,
    hasScoring,
    availableMaxPoints,
    scoredBlockCount,
    pendingEvaluations,
    needsReviewEvaluations,
    unconfirmedEvaluations,
    failedEvaluations,
    rows,
  } = result.data;

  return NextResponse.json({
    status,
    scoreboardRevealed,
    hasScoring,
    availableMaxPoints,
    scoredBlockCount,
    pendingEvaluations,
    needsReviewEvaluations,
    unconfirmedEvaluations,
    failedEvaluations,
    rows,
  });
}
