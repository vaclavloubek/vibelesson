import { NextResponse } from 'next/server';
import { getAuthenticatedUserId } from '@/lib/auth';
import { fetchWithTimeout } from '@/lib/fetch-with-timeout';
import { liveControlConfigured, mintLiveCapability } from '@/lib/live-control-server';

type RouteContext = { params: Promise<{ id: string }> };

type LiveEvent = {
  revision: number;
  operationId: string;
  actorRole: 'teacher' | 'student';
  actorId: string;
  type: string;
  payload: unknown;
  createdAt: string;
};

type LiveStateResponse = {
  events?: LiveEvent[];
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

  let cursor = Number(session.live_control_revision ?? 0);
  let reconciled = 0;

  try {
    for (let page = 0; page < 20; page += 1) {
      const response = await fetchWithTimeout(
        `${access.url}/v1/sessions/${id}/state?after=${encodeURIComponent(String(cursor))}`,
        {
          headers: { authorization: `Bearer ${access.token}` },
          cache: 'no-store',
        },
        5_000,
      );
      if (!response.ok) {
        return NextResponse.json(
          { error: 'Záložní live vrstva není momentálně dostupná.', revision: cursor },
          { status: 503 },
        );
      }

      const live = await response.json() as LiveStateResponse;
      const events = Array.isArray(live.events)
        ? live.events.filter((event) => Number.isInteger(event.revision) && event.revision > cursor)
        : [];
      if (!events.length) break;

      const { data, error: rpcError } = await supabase.rpc('reconcile_live_control_events', {
        p_session_id: id,
        p_events: events,
      });
      if (rpcError) {
        console.error('live control reconciliation RPC failed', rpcError);
        return NextResponse.json(
          { error: 'Záložní změny se zatím nepodařilo dosynchronizovat.', revision: cursor },
          { status: 503 },
        );
      }

      const nextRevision = Number((data as { revision?: unknown } | null)?.revision ?? cursor);
      if (!Number.isInteger(nextRevision) || nextRevision < cursor) {
        return NextResponse.json({ error: 'Reconciliation vrátila neplatnou revizi.' }, { status: 502 });
      }

      reconciled += events.length;
      cursor = nextRevision;
      if (events.length < 500) break;
    }

    return NextResponse.json({ enabled: true, reconciled, revision: cursor });
  } catch (error) {
    console.error('live control reconciliation failed', error);
    return NextResponse.json(
      { error: 'Dosynchronizace záložní live vrstvy se přerušila.', revision: cursor },
      { status: 503 },
    );
  }
}
