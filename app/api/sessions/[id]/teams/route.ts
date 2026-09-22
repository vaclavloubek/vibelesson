import { NextResponse } from 'next/server';
import { getAuthenticatedUserId } from '@/lib/auth';
import { TeamCreateSchema } from '@/lib/live';
import { mirrorLiveControlEvent } from '@/lib/live-control-server';

type RouteContext = { params: Promise<{ id: string }> };

async function loadLobbySession(id: string, userId: string, supabase: Awaited<ReturnType<typeof getAuthenticatedUserId>>['supabase']) {
  return supabase
    .from('sessions')
    .select('id, status, realtime_key')
    .eq('id', id)
    .eq('teacher_id', userId)
    .single();
}

export async function POST(req: Request, { params }: RouteContext) {
  const { supabase, userId } = await getAuthenticatedUserId();
  if (!userId) return NextResponse.json({ error: 'Nejdřív se přihlas.' }, { status: 401 });

  try {
    const { id } = await params;
    const input = TeamCreateSchema.parse(await req.json());
    const { data: session, error: sessionError } = await loadLobbySession(id, userId, supabase);
    if (sessionError || !session) return NextResponse.json({ error: 'Hodina nebyla nalezena.' }, { status: 404 });
    if (session.status !== 'lobby') return NextResponse.json({ error: 'Týmy lze vytvořit pouze v lobby.' }, { status: 409 });

    const { count, error: countError } = await supabase
      .from('teams')
      .select('id', { count: 'exact', head: true })
      .eq('session_id', id);
    if (countError) throw countError;
    if ((count ?? 0) > 0) return NextResponse.json({ error: 'Týmy už jsou vytvořené. Nejdřív je resetuj.' }, { status: 409 });

    const rows = Array.from({ length: input.count }, (_, index) => ({
      session_id: id,
      name: `Tým ${index + 1}`,
      sort_order: index,
    }));

    const { data: teams, error: insertError } = await supabase
      .from('teams')
      .insert(rows)
      .select('id, name, sort_order')
      .order('sort_order', { ascending: true });
    if (insertError) throw insertError;

    await mirrorLiveControlEvent({
      sessionId: id,
      role: 'teacher',
      subject: userId,
      type: 'teacher.state_patch',
      payload: {
        teams: (teams ?? []).map((team) => ({ id: team.id, name: team.name, sortOrder: team.sort_order })),
      },
    });
    return NextResponse.json({ teams });
  } catch (error) {
    console.error('create teams failed', error);
    return NextResponse.json({ error: 'Týmy se nepodařilo vytvořit.' }, { status: 400 });
  }
}

export async function DELETE(_req: Request, { params }: RouteContext) {
  const { supabase, userId } = await getAuthenticatedUserId();
  if (!userId) return NextResponse.json({ error: 'Nejdřív se přihlas.' }, { status: 401 });

  try {
    const { id } = await params;
    const { data: session, error: sessionError } = await loadLobbySession(id, userId, supabase);
    if (sessionError || !session) return NextResponse.json({ error: 'Hodina nebyla nalezena.' }, { status: 404 });
    if (session.status !== 'lobby') return NextResponse.json({ error: 'Týmy lze resetovat pouze v lobby.' }, { status: 409 });

    const { error: deleteError } = await supabase.from('teams').delete().eq('session_id', id);
    if (deleteError) throw deleteError;

    await mirrorLiveControlEvent({
      sessionId: id,
      role: 'teacher',
      subject: userId,
      type: 'teacher.state_patch',
      payload: { teams: [] },
    });
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('reset teams failed', error);
    return NextResponse.json({ error: 'Týmy se nepodařilo resetovat.' }, { status: 400 });
  }
}
