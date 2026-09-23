import { NextResponse } from 'next/server';
import { getAuthenticatedUserId } from '@/lib/auth';
import {
  createOwnedLessonShare,
  LessonShareWriteError,
  readOwnedLessonShare,
  revokeOwnedLessonShare,
  type LessonShareRow,
} from '@/lib/lesson-share-writer';

type RouteContext = {
  params: Promise<{ id: string }>;
};

function responseShare(request: Request, row: LessonShareRow) {
  return {
    token: row.token,
    url: new URL(`/s/${row.token}`, request.url).toString(),
    createdAt: row.created_at,
  };
}

export async function GET(request: Request, { params }: RouteContext) {
  const { supabase, userId } = await getAuthenticatedUserId();
  if (!userId) return NextResponse.json({ error: 'Nejdřív se přihlas.' }, { status: 401 });

  const { id } = await params;
  try {
    const state = await readOwnedLessonShare(supabase, id, userId);
    return NextResponse.json({
      share: state.share ? responseShare(request, state.share) : null,
      sharingRestricted: state.sharingRestricted,
    });
  } catch (error) {
    if (error instanceof LessonShareWriteError && error.code === 'LESSON_NOT_FOUND') {
      return NextResponse.json({ error: 'Lekce nebyla nalezena.' }, { status: 404 });
    }
    console.error('load lesson share failed', error);
    return NextResponse.json({ error: 'Sdílení se nepodařilo načíst.' }, { status: 500 });
  }
}

export async function POST(request: Request, { params }: RouteContext) {
  const { supabase, userId } = await getAuthenticatedUserId();
  if (!userId) return NextResponse.json({ error: 'Nejdřív se přihlas.' }, { status: 401 });

  try {
    const { id } = await params;
    const created = await createOwnedLessonShare(supabase, id, userId);
    return NextResponse.json({ share: responseShare(request, created) });
  } catch (error) {
    console.error('create lesson share failed', error);
    if (error instanceof LessonShareWriteError && error.code === 'LESSON_NOT_FOUND') {
      return NextResponse.json({ error: 'Lekce nebyla nalezena.' }, { status: 404 });
    }
    if (error instanceof LessonShareWriteError
        && error.code === 'ORGANIZATION_LIBRARY_PUBLIC_SHARE_FORBIDDEN') {
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
    const revoked = await revokeOwnedLessonShare(supabase, id, userId);
    return NextResponse.json({ revoked });
  } catch (error) {
    console.error('revoke lesson share failed', error);
    return NextResponse.json({ error: 'Sdílení se nepodařilo vypnout.' }, { status: 500 });
  }
}
