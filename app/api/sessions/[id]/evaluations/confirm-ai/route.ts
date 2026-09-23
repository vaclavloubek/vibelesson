import { NextResponse } from 'next/server';
import { getAuthenticatedUserId } from '@/lib/auth';

type RouteContext = { params: Promise<{ id: string }> };

// LEGAL-021: the teacher confirms AI point suggestions in bulk. Confirmation is
// the teacher's decision; only confirmed points count toward scores and ranking.
export async function POST(_req: Request, { params }: RouteContext) {
  const { supabase, userId } = await getAuthenticatedUserId();
  if (!userId) return NextResponse.json({ error: 'Nejdřív se přihlas.' }, { status: 401 });

  const { id: sessionId } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(sessionId)) return NextResponse.json({ error: 'Hodina nebyla nalezena.' }, { status: 404 });

  const { data, error } = await supabase.rpc('confirm_ai_evaluation_proposals', { p_session_id: sessionId });
  if (error) {
    console.error('confirm AI evaluation proposals failed', error);
    return NextResponse.json({ error: 'Návrhy AI se nepodařilo potvrdit.' }, { status: 500 });
  }
  if (data === null) return NextResponse.json({ error: 'Hodina nebyla nalezena.' }, { status: 404 });
  return NextResponse.json({ confirmed: typeof data === 'number' ? data : 0 });
}
