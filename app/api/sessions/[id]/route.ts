import { NextResponse } from 'next/server';
import { getAuthenticatedUserId } from '@/lib/auth';
import { broadcastSessionInvalidate } from '@/lib/live-server';
import { SessionActionSchema, StudentAnswerSchema } from '@/lib/live';
import { LessonSchema } from '@/lib/schema';

type RouteContext = { params: Promise<{ id: string }> };

async function loadOwnedSession(id: string, userId: string, supabase: Awaited<ReturnType<typeof getAuthenticatedUserId>>['supabase']) {
  return supabase
    .from('sessions')
    .select('id, lesson_id, teacher_id, join_code, status, active_block_id, lesson_snapshot, realtime_key, created_at, started_at, ended_at')
    .eq('id', id)
    .eq('teacher_id', userId)
    .single();
}

export async function GET(_req: Request, { params }: RouteContext) {
  const { supabase, userId } = await getAuthenticatedUserId();
  if (!userId) return NextResponse.json({ error: 'Nejdřív se přihlas.' }, { status: 401 });

  const { id } = await params;
  const { data: session, error } = await loadOwnedSession(id, userId, supabase);
  if (error || !session) return NextResponse.json({ error: 'Hodina nebyla nalezena.' }, { status: 404 });

  const parsedLesson = LessonSchema.safeParse(session.lesson_snapshot);
  if (!parsedLesson.success) return NextResponse.json({ error: 'Snapshot lekce je neplatný.' }, { status: 500 });

  const { data: participants, error: participantError } = await supabase
    .from('participants')
    .select('id, display_name, joined_at')
    .eq('session_id', id)
    .order('joined_at', { ascending: true });

  if (participantError) {
    console.error('participants load failed', participantError);
    return NextResponse.json({ error: 'Účastníky se nepodařilo načíst.' }, { status: 500 });
  }

  const participantRows = participants ?? [];
  const participantNames = new Map(participantRows.map((participant) => [participant.id as string, participant.display_name as string]));
  const responses: Array<{ participantId: string; displayName: string; answer: unknown; updatedAt: string }> = [];

  if (session.active_block_id) {
    const { data: responseRows, error: responseError } = await supabase
      .from('responses')
      .select('participant_id, answer, updated_at')
      .eq('session_id', id)
      .eq('block_id', session.active_block_id)
      .order('updated_at', { ascending: true });

    if (responseError) {
      console.error('responses load failed', responseError);
      return NextResponse.json({ error: 'Odpovědi se nepodařilo načíst.' }, { status: 500 });
    }

    for (const response of responseRows ?? []) {
      const parsedAnswer = StudentAnswerSchema.safeParse(response.answer);
      if (!parsedAnswer.success) continue;
      responses.push({
        participantId: response.participant_id as string,
        displayName: participantNames.get(response.participant_id as string) ?? 'Student',
        answer: parsedAnswer.data,
        updatedAt: response.updated_at as string,
      });
    }
  }

  return NextResponse.json({
    session: {
      id: session.id,
      lessonId: session.lesson_id,
      joinCode: session.join_code,
      status: session.status,
      activeBlockId: session.active_block_id,
      lessonSnapshot: parsedLesson.data,
      realtimeKey: session.realtime_key,
      createdAt: session.created_at,
      startedAt: session.started_at,
      endedAt: session.ended_at,
      participants: participantRows.map((participant) => ({
        id: participant.id,
        displayName: participant.display_name,
        joinedAt: participant.joined_at,
      })),
      responses,
    },
  });
}

export async function PATCH(req: Request, { params }: RouteContext) {
  const { supabase, userId } = await getAuthenticatedUserId();
  if (!userId) return NextResponse.json({ error: 'Nejdřív se přihlas.' }, { status: 401 });

  try {
    const { id } = await params;
    const action = SessionActionSchema.parse(await req.json());
    const { data: session, error } = await loadOwnedSession(id, userId, supabase);
    if (error || !session) return NextResponse.json({ error: 'Hodina nebyla nalezena.' }, { status: 404 });

    const lesson = LessonSchema.parse(session.lesson_snapshot);
    const now = new Date().toISOString();
    let update: Record<string, string | null> = {};

    if (action.action === 'start') {
      if (session.status !== 'lobby') return NextResponse.json({ error: 'Hodinu lze zahájit pouze z lobby.' }, { status: 409 });
      update = {
        status: 'live',
        active_block_id: lesson.blocks[0].id,
        started_at: now,
      };
    } else if (action.action === 'end') {
      if (session.status === 'ended') return NextResponse.json({ ok: true, status: 'ended', activeBlockId: session.active_block_id });
      update = { status: 'ended', ended_at: now };
    } else {
      if (session.status !== 'live') return NextResponse.json({ error: 'Blok lze měnit pouze během živé hodiny.' }, { status: 409 });
      const currentIndex = lesson.blocks.findIndex((block) => block.id === session.active_block_id);
      if (currentIndex < 0) return NextResponse.json({ error: 'Aktuální blok není ve snapshotu lekce.' }, { status: 500 });
      const nextIndex = action.action === 'next' ? currentIndex + 1 : currentIndex - 1;
      if (nextIndex < 0 || nextIndex >= lesson.blocks.length) {
        return NextResponse.json({ error: action.action === 'next' ? 'Jsi na posledním bloku.' : 'Jsi na prvním bloku.' }, { status: 409 });
      }
      update = { active_block_id: lesson.blocks[nextIndex].id };
    }

    const { data: updated, error: updateError } = await supabase
      .from('sessions')
      .update(update)
      .eq('id', id)
      .eq('teacher_id', userId)
      .select('status, active_block_id, realtime_key')
      .single();

    if (updateError || !updated) throw updateError ?? new Error('Session update returned no row.');
    await broadcastSessionInvalidate(updated.realtime_key as string);

    return NextResponse.json({
      ok: true,
      status: updated.status,
      activeBlockId: updated.active_block_id,
    });
  } catch (error) {
    console.error('update session failed', error);
    return NextResponse.json({ error: 'Stav hodiny se nepodařilo změnit.' }, { status: 500 });
  }
}
