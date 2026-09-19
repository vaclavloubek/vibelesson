import { NextRequest } from 'next/server';
import { LessonSchema } from '@/lib/schema';
import { createClient } from '@/lib/supabase/server';
import { normalizeWorksheetMode, normalizeWorksheetSpace, resolveWorksheetBlockIds } from '@/lib/worksheet';
import { getLessonOrganizationOriginAccess } from '@/lib/organization-origin-access';
import { createWorksheetPdfBuffer } from '@/lib/worksheet-pdf';
import { requireTrustedDeviceForPaidIndividual, trustedDeviceErrorMessage } from '@/lib/trusted-device-access';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function safeFilename(title: string) {
  const base = title.normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^A-Za-z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
  return (base || 'syllonaut-worksheet') + '.pdf';
}

export async function GET(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const supabase = await createClient();
  const { data: claimsData } = await supabase.auth.getClaims();
  const userId = typeof claimsData?.claims?.sub === 'string' ? claimsData.claims.sub : null;
  if (!userId) return Response.json({ error: 'unauthorized' }, { status: 401 });

  const deviceGate = await requireTrustedDeviceForPaidIndividual(userId);
  if (!deviceGate.allowed) {
    return Response.json({ error: trustedDeviceErrorMessage(deviceGate.code), code: deviceGate.code }, { status: 403 });
  }

  const [lessonResult, profileResult] = await Promise.all([
    supabase.from('lessons').select('id, lesson').eq('id', id).eq('owner_id', userId).maybeSingle(),
    supabase.from('profiles').select('role, worksheet_export_enabled').eq('id', userId).maybeSingle(),
  ]);

  if (lessonResult.error || !lessonResult.data) return Response.json({ error: 'lesson_not_found' }, { status: 404 });
  const originAccess = await getLessonOrganizationOriginAccess(userId, id);
  if (originAccess?.locked) {
    return Response.json({ error: 'organization_origin_access_required' }, { status: 403 });
  }
  if (profileResult.error || !profileResult.data) {
    console.error('worksheet PDF entitlement lookup failed', profileResult.error);
    return Response.json({ error: 'entitlement_lookup_failed' }, { status: 500 });
  }
  if (!(profileResult.data.role === 'admin' || profileResult.data.worksheet_export_enabled)) {
    return Response.json({ error: 'worksheet_export_not_entitled' }, { status: 403 });
  }

  const parsed = LessonSchema.safeParse(lessonResult.data.lesson);
  if (!parsed.success) return Response.json({ error: 'invalid_lesson' }, { status: 422 });
  const lesson = parsed.data;

  const mode = normalizeWorksheetMode(request.nextUrl.searchParams.get('mode'));
  const space = normalizeWorksheetSpace(request.nextUrl.searchParams.get('space'));
  const selectedIds = new Set(resolveWorksheetBlockIds(request.nextUrl.searchParams.getAll('block'), lesson));
  const blocks = lesson.blocks
    .map((block, originalIndex) => ({ block, originalIndex }))
    .filter(({ block }) => selectedIds.has(block.id));
  const english = request.nextUrl.searchParams.get('locale') === 'en';

  try {
    const pdf = await createWorksheetPdfBuffer({ lesson, blocks, mode, space, english });
    const disposition = request.nextUrl.searchParams.get('download') === '1' ? 'attachment' : 'inline';
    const filename = safeFilename(lesson.title);
    return new Response(new Uint8Array(pdf), {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': disposition + '; filename="' + filename + '"',
        'Cache-Control': 'private, no-store',
        'X-Content-Type-Options': 'nosniff',
      },
    });
  } catch (error) {
    console.error('worksheet PDF generation failed', error);
    return Response.json({ error: 'worksheet_pdf_generation_failed' }, { status: 500 });
  }
}
