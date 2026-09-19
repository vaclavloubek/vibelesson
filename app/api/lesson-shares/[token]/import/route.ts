import { createClient as createSupabaseClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';
import { getAuthenticatedUserId } from '@/lib/auth';

type RouteContext = {
  params: Promise<{ token: string }>;
};

const SHARE_TOKEN_PATTERN = /^[0-9a-f]{48}$/;
const BEARER_PATTERN = /^Bearer\s+(.+)$/i;

async function authenticatedRequestClient(request: Request) {
  const authorization = request.headers.get('authorization');

  if (authorization) {
    const match = authorization.match(BEARER_PATTERN);
    const accessToken = match?.[1]?.trim();
    if (!accessToken) return { supabase: null, userId: null };

    const supabase = createSupabaseClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
      {
        global: {
          headers: { Authorization: `Bearer ${accessToken}` },
        },
        auth: {
          persistSession: false,
          autoRefreshToken: false,
          detectSessionInUrl: false,
        },
      },
    );

    const { data, error } = await supabase.auth.getUser(accessToken);
    if (error || !data.user) return { supabase: null, userId: null };

    return { supabase, userId: data.user.id };
  }

  const { supabase, userId } = await getAuthenticatedUserId();
  return { supabase, userId };
}

export async function POST(request: Request, { params }: RouteContext) {
  const { supabase, userId } = await authenticatedRequestClient(request);
  if (!supabase || !userId) {
    return NextResponse.json({ error: 'Nejdřív se přihlas.' }, { status: 401 });
  }

  const { token } = await params;
  if (!SHARE_TOKEN_PATTERN.test(token)) {
    return NextResponse.json({ error: 'Sdílená lekce nebyla nalezena.' }, { status: 404 });
  }

  const { data, error } = await supabase.rpc('import_lesson_share', { p_token: token });
  if (error) {
    if (error.code === 'P0002') {
      return NextResponse.json({ error: 'Sdílená lekce nebyla nalezena.' }, { status: 404 });
    }
    if (error.message?.includes('free_lesson_import_quota_exhausted')) {
      return NextResponse.json({
        error: 'Měsíční limit 3 importů nebo kopií je vyčerpaný. Další sdílenou lekci můžeš importovat příští měsíc.',
        code: 'free_lesson_import_quota_exhausted',
      }, { status: 429 });
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
