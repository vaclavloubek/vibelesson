import { NextResponse } from 'next/server';
import { getAuthenticatedUserId } from '@/lib/auth';
import { createLiveCapability } from '@/lib/live-control-plane';

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(_req: Request, { params }: RouteContext) {
  const { id } = await params;
  const { supabase, userId } = await getAuthenticatedUserId();
  if (!userId) return NextResponse.json({ error: 'Nejdřív se přihlas.' }, { status: 401 });
  const { data: session, error } = await supabase.from('sessions').select('id').eq('id', id).eq('teacher_id', userId).maybeSingle();
  if (error || !session) return NextResponse.json({ error: 'Hodina nebyla nalezena.' }, { status: 404 });
  const capability = createLiveCapability(id, 'teacher', userId);
  return capability ? NextResponse.json({ enabled: true, ...capability }) : NextResponse.json({ enabled: false });
}
