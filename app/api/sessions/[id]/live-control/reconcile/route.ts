import { NextResponse } from 'next/server';
import { getAuthenticatedUserId } from '@/lib/auth';
import { fetchWithTimeout } from '@/lib/fetch-with-timeout';
import { liveControlConfigured, mintLiveCapability, type LiveControlSnapshot } from '@/lib/live-control-server';

type RouteContext = { params: Promise<{ id: string }> };

type LiveStateResponse = {
  snapshot?: LiveControlSnapshot;
};

type ReconcileResult = {
  ok?: boolean;
  skipped?: boolean;
  revision?: number;
  responses?: number;
  teamResponses?: number;
};

export async function POST(_req: Request, { params }: RouteContext) {
  if (!liveControlConfigured()) {
    return NextResponse.json({ enabled: false, reconciled: 0 });
  }

  const { id } = await params;
  const { supabase, userId } = await getAuthenticatedUserId();
  if (!userId) return NextResponse.json({ error: 'Nejdřív se přihlas.' }, { status: 401 });

  const { data: session, error } = await supabase
    .from('sessions')
    .select('id,live_control_revision')
    .eq('id', id)
    .eq('teacher_id', userId)
    .maybeSingle();

  if (error || !session) {
    return NextResponse.json({ error: 'Hodina nebyla nalezena.' }, { status: 404 });
  }

  const access = mintLiveCapability({
    sessionId: id,
    subject: userId,
    role: 'teacher',
    ttlSeconds: 120,
  });
  if (!access) return NextResponse.json({ enabled: false, reconciled: 0 });

  try {
    const response = await fetchWithTimeout(
      `${access.url}/v1/sessions/${id}/state`,
      {
        headers: { authorization: `Bearer ${access.token}` },
        cache: 'no-store',
      },
      5_000,
    );

    if (!response.ok) {
      return NextResponse.json(
        { error: 'Záložní live vrstva není momentálně dostupná.' },
        { status: 503 },
      );
    }

    const live = await response.json() as LiveStateResponse;
    const snapshot = live.snapshot;
    if (!snapshot || snapshot.sessionId !== id) {
      return NextResponse.json({ error: 'Záložní live snapshot je neplatný.' }, { status: 502 });
    }

    const currentRevision = Number(session.live_control_revision ?? 0);
    if (!Number.isInteger(snapshot.revision) || snapshot.revision <= currentRevision) {
      return NextResponse.json({
        enabled: true,
        reconciled: 0,
        revision: currentRevision,
        skipped: true,
      });
    }

    const { data, error: rpcError } = await supabase.rpc('reconcile_live_control_snapshot', {
      p_session_id: id,
      p_snapshot: snapshot,
    });

    if (rpcError) {
      console.error('live control snapshot reconciliation RPC failed', rpcError);
      return NextResponse.json(
        { error: 'Záložní změny se zatím nepodařilo dosynchronizovat.', revision: currentRevision },
        { status: 503 },
      );
    }

    const result = (data ?? {}) as ReconcileResult;
    const reconciled = result.skipped
      ? 0
      : 1 + Number(result.responses ?? 0) + Number(result.teamResponses ?? 0);

    return NextResponse.json({
      enabled: true,
      reconciled,
      revision: Number(result.revision ?? snapshot.revision),
      skipped: Boolean(result.skipped),
    });
  } catch (error) {
    console.error('live control snapshot reconciliation failed', error);
    return NextResponse.json(
      { error: 'Dosynchronizace záložní live vrstvy se přerušila.' },
      { status: 503 },
    );
  }
}
