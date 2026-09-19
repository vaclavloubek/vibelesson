import { NextResponse } from 'next/server';
import { getAuthenticatedUserId } from '@/lib/auth';

type RouteContext = {
  params: Promise<{ token: string }>;
};

const SHARE_TOKEN_PATTERN = /^[0-9a-f]{48}$/;

export async function POST(_request: Request, { params }: RouteContext) {
  const { supabase, userId } = await getAuthenticatedUserId();
  if (!userId) return NextResponse.json({ error: 'Nejdřív se přihlas.' }, { status: 401 });

  const { token } = await params;
  if (!SHARE_TOKEN_PATTERN.test(token)) {
    return NextResponse.json({ error: 'Sdílená lekce nebyla nalezena.' }, { status: 404 });
  }

  const { data, error } = await supabase.rpc('import_lesson_share', { p_token: token });
  if (error) {
    if (error.code === 'P0002') {
      return NextResponse.json({ error: 'Sdílená lekce nebyla nalezena.' }, { status: 404 });
    }
    console.error('import lesson share failed', { code: error.code });
    return NextResponse.json({ error: 'Kopii lekce se nepodařilo uložit.' }, { status: 500 });
  }

  if (typeof data !== 'string') {
    console.error('import lesson share returned an invalid lesson id');
    return NextResponse.json({ error: 'Kopii lekce se nepodařilo uložit.' }, { status: 500 });
  }

  return NextResponse.json({ lessonId: data });
}
