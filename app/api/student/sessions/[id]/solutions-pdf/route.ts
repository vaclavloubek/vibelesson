import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { participantCookieName } from '@/lib/live';
import { useNeonLiveSessionData } from '@/lib/neon/live-session-config';
import { readNeonStudentSolutions } from '@/lib/neon/student-session-server';
import { buildStudentSolutionItems, createStudentSolutionsPdfDefinition, studentSolutionsFilename } from '@/lib/student-solutions-pdf';
import { renderPdfBuffer } from '@/lib/worksheet-pdf';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type RouteContext = { params: Promise<{ id: string }> };

function formatSessionDate(value: unknown, english: boolean) {
  const date = value instanceof Date ? value : new Date(typeof value === 'string' ? value : Number.NaN);
  if (Number.isNaN(date.getTime())) return '—';
  return new Intl.DateTimeFormat(english ? 'en-GB' : 'cs-CZ', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Europe/Prague' }).format(date);
}

// Generated on request for the verified participant only; nothing is stored.
export async function GET(request: NextRequest, { params }: RouteContext) {
  const { id } = await params;
  const cookieStore = await cookies();
  const participantToken = cookieStore.get(participantCookieName(id))?.value;
  if (!participantToken) return NextResponse.json({ error: 'Chybí participant identita.' }, { status: 401 });
  if (!useNeonLiveSessionData()) {
    return NextResponse.json({ error: 'Řešení v PDF je dostupné jen s databází Neon.' }, { status: 503 });
  }

  try {
    const result = await readNeonStudentSolutions(id, participantToken);
    if (result.response) return result.response;
    const data = result.data!;
    const english = request.nextUrl.searchParams.get('locale') === 'en';
    const items = buildStudentSolutionItems({
      blocks: data.blocks,
      responses: data.responses,
      teamResponses: data.teamResponses,
      evaluations: data.evaluations,
    });
    const pdf = await renderPdfBuffer(createStudentSolutionsPdfDefinition({
      lessonTitle: data.lessonTitle,
      lessonLanguage: data.lessonLanguage,
      studentName: data.studentName,
      teamName: data.teamName,
      sessionDate: formatSessionDate(data.sessionStartedAt, english),
      english,
      items,
    }));
    return new Response(new Uint8Array(pdf), {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${studentSolutionsFilename(data.lessonTitle, english)}"`,
        'Cache-Control': 'private, no-store',
        'X-Content-Type-Options': 'nosniff',
      },
    });
  } catch (error) {
    console.error('student solutions PDF failed', error);
    return NextResponse.json({ error: 'PDF se nepodařilo vytvořit.' }, { status: 500 });
  }
}
