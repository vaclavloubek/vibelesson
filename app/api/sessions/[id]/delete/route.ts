import { NextResponse } from 'next/server';
import { getAuthenticatedUserId } from '@/lib/auth';

type RouteContext = { params: Promise<{ id: string }> };

export async function DELETE(_req: Request, { params }: RouteContext) {
  const { supabase, userId } = await getAuthenticatedUserId();
  if (!userId) return NextResponse.json({ error: 'Nejdřív se přihlas.' }, { status: 401 });

  try {
    const { id } = await params;
    const { data: session, error: readError } = await supabase
      .from('sessions')
      .select('id, status')
      .eq('id', id)
      .eq('teacher_id', userId)
      .maybeSingle();

    if (readError) throw readError;
    if (!session) return NextResponse.json({ error: 'Hodina nebyla nalezena.' }, { status: 404 });
    if (session.status !== 'ended') {
      return NextResponse.json({ error: 'Smazat lze pouze ukončenou hodinu.' }, { status: 409 });
    }

    const { data: deleted, error: deleteError } = await supabase
      .from('sessions')
      .delete()
      .eq('id', id)
      .eq('teacher_id', userId)
      .eq('status', 'ended')
      .select('id')
      .maybeSingle();

    if (deleteError) throw deleteError;
    if (!deleted) return NextResponse.json({ error: 'Hodina už neexistuje nebo ji nelze smazat.' }, { status: 404 });

    return NextResponse.json({ deleted: true });
  } catch (error) {
    console.error('delete session failed', error);
    return NextResponse.json({ error: 'Výsledky hodiny se nepodařilo smazat.' }, { status: 500 });
  }
}
