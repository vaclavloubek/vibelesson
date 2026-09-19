import { randomBytes } from 'node:crypto';
import { NextResponse } from 'next/server';
import { LessonSchema } from '@/lib/schema';
import { getAuthenticatedUserId } from '@/lib/auth';

type RouteContext = {
  params: Promise<{ id: string }>;
};

type ShareRow = {
  token: string;
  created_at: string;
};

function responseShare(request: Request, row: ShareRow) {
  return {
    token: row.token,
    url: new URL(`/s/${row.token}`, request.url).toString(),
    createdAt: row.created_at,
  };
}

async function activeShare(
  supabase: Awaited<ReturnType<typeof getAuthenticatedUserId>>['supabase'],
  lessonId: string,
  userId: string,
) {
  return supabase
    .from('lesson_shares')
    .select('token, created_at')
    .eq('lesson_id', lessonId)
    .eq('owner_id', userId)
    .eq('status', 'active')
    .maybeSingle();
}

export async function GET(request: Request, { params }: RouteContext) {
  const { supabase, userId } = await getAuthenticatedUserId();
  if (!userId) return NextResponse.json({ error: 'Nejdřív se přihlas.' }, { status: 401 });

  const { id } = await params;
  const { data: lesson, error: lessonError } = await supabase
    .from('lessons')
    .select('organization_origin_id')
    .eq('id', id)
    .eq('owner_id', userId)
    .maybeSingle();

  if (lessonError) {
    console.error('load lesson sharing provenance failed', lessonError);
    return NextResponse.json({ error: 'Sdílení se nepodařilo načíst.' }, { status: 500 });
  }
  if (!lesson) return NextResponse.json({ error: 'Lekce nebyla nalezena.' }, { status: 404 });
  if (lesson.organization_origin_id) {
    return NextResponse.json({ share: null, sharingRestricted: true });
  }

  const { data, error } = await activeShare(supabase, id, userId);
  if (error) {
    console.error('load lesson share failed', error);
    return NextResponse.json({ error: 'Sdílení se nepodařilo načíst.' }, { status: 500 });
  }

  return NextResponse.json({
    share: data ? responseShare(request, data as ShareRow) : null,
    sharingRestricted: false,
  });
}

export async function POST(request: Request, { params }: RouteContext) {
  const { supabase, userId } = await getAuthenticatedUserId();
  if (!userId) return NextResponse.json({ error: 'Nejdřív se přihlas.' }, { status: 401 });

  try {
    const { id } = await params;
    const { data: lessonRow, error: lessonError } = await supabase
      .from('lessons')
      .select('lesson, organization_origin_id')
      .eq('id', id)
      .eq('owner_id', userId)
      .maybeSingle();

    if (lessonError) throw lessonError;
    if (!lessonRow) return NextResponse.json({ error: 'Lekce nebyla nalezena.' }, { status: 404 });
    if (lessonRow.organization_origin_id) {
      return NextResponse.json({
        error: 'organization_library_public_share_forbidden',
        sharingRestricted: true,
      }, { status: 403 });
    }

    const existing = await activeShare(supabase, id, userId);
    if (existing.error) throw existing.error;
    if (existing.data) {
      return NextResponse.json({ share: responseShare(request, existing.data as ShareRow) });
    }

    const snapshot = LessonSchema.parse(lessonRow.lesson);
    const token = randomBytes(24).toString('hex');
    const { data: created, error: createError } = await supabase
      .from('lesson_shares')
      .insert({
        lesson_id: id,
        owner_id: userId,
        token,
        snapshot,
      })
      .select('token, created_at')
      .single();

    if (createError?.code === '23505') {
      const raced = await activeShare(supabase, id, userId);
      if (raced.error) throw raced.error;
      if (raced.data) {
        return NextResponse.json({ share: responseShare(request, raced.data as ShareRow) });
      }
    }

    if (createError || !created) throw createError ?? new Error('Lesson share insert returned no row.');
    return NextResponse.json({ share: responseShare(request, created as ShareRow) });
  } catch (error) {
    console.error('create lesson share failed', error);
    const message = error && typeof error === 'object' && 'message' in error
      ? String((error as { message?: unknown }).message ?? '')
      : '';
    if (message.includes('organization_origin_share_forbidden')) {
      return NextResponse.json({
        error: 'organization_library_public_share_forbidden',
        sharingRestricted: true,
      }, { status: 403 });
    }
    return NextResponse.json({ error: 'Odkaz se nepodařilo vytvořit.' }, { status: 500 });
  }
}
export async function DELETE(_request: Request, { params }: RouteContext) {
  const { supabase, userId } = await getAuthenticatedUserId();
  if (!userId) return NextResponse.json({ error: 'Nejdřív se přihlas.' }, { status: 401 });

  try {
    const { id } = await params;
    const { data, error } = await supabase
      .from('lesson_shares')
      .update({ status: 'revoked', revoked_at: new Date().toISOString() })
      .eq('lesson_id', id)
      .eq('owner_id', userId)
      .eq('status', 'active')
      .select('id')
      .maybeSingle();

    if (error) throw error;
    return NextResponse.json({ revoked: Boolean(data) });
  } catch (error) {
    console.error('revoke lesson share failed', error);
    return NextResponse.json({ error: 'Sdílení se nepodařilo vypnout.' }, { status: 500 });
  }
}
