import { after, NextResponse } from 'next/server';
import { z } from 'zod';
import { getAuthenticatedUserId } from '@/lib/auth';
import { generateJoinCode, generateRealtimeKey } from '@/lib/live-server';
import { LessonSchema } from '@/lib/schema';
import { bootstrapLiveControl, publicLessonSnapshot } from '@/lib/live-control-server';

const CreateSessionSchema = z.object({ lessonId: z.string().uuid() });

async function findActiveSession(
  supabase: Awaited<ReturnType<typeof getAuthenticatedUserId>>['supabase'],
  userId: string,
) {
  return supabase
    .from('sessions')
    .select('id')
    .eq('teacher_id', userId)
    .in('status', ['lobby', 'live'])
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
}

export async function POST(req: Request) {
  const { supabase, userId } = await getAuthenticatedUserId();
  if (!userId) return NextResponse.json({ error: 'Nejdřív se přihlas.' }, { status: 401 });

  try {
    const { lessonId } = CreateSessionSchema.parse(await req.json());
    const { data: lessonRow, error: lessonError } = await supabase
      .from('lessons')
      .select('id, lesson')
      .eq('id', lessonId)
      .eq('owner_id', userId)
      .single();

    if (lessonError || !lessonRow) {
      return NextResponse.json({ error: 'Lekce nebyla nalezena.' }, { status: 404 });
    }

    const lessonSnapshot = LessonSchema.parse(lessonRow.lesson);
    const active = await findActiveSession(supabase, userId);
    if (active.error) throw active.error;
    if (active.data) {
      return NextResponse.json({
        error: 'Na tomto účtu už běží jiná hodina.',
        activeSessionId: active.data.id,
      }, { status: 409 });
    }

    for (let attempt = 0; attempt < 5; attempt += 1) {
      const joinCode = generateJoinCode();
      const realtimeKey = generateRealtimeKey();
      const { data: session, error: insertError } = await supabase
        .from('sessions')
        .insert({
          lesson_id: lessonId,
          teacher_id: userId,
          join_code: joinCode,
          status: 'lobby',
          active_block_id: null,
          lesson_snapshot: lessonSnapshot,
          realtime_key: realtimeKey,
          started_at: null,
          ended_at: null,
        })
        .select('id, join_code, status, realtime_key')
        .single();

      if (!insertError && session) {
        after(async () => {
          await bootstrapLiveControl({
            sessionId: session.id,
            joinCode: session.join_code,
            revision: 0,
            status: 'lobby',
            activeBlockId: null,
            lessonSnapshot: publicLessonSnapshot(lessonSnapshot),
            teams: [],
            participants: [],
            responses: [],
            revealedBlockIds: [],
            timer: null,
            updatedAt: new Date().toISOString(),
          });
        });

        return NextResponse.json({
          sessionId: session.id,
          joinCode: session.join_code,
          status: session.status,
          realtimeKey: session.realtime_key,
        });
      }

      if (insertError?.message?.includes('free_lesson_replay_locked')) {
        return NextResponse.json(
          {
            error: 'Tuto lekci už jsi ve Free tarifu použil. Můžeš ji dál upravovat; další živé použití odemkne placený tarif.',
            code: 'free_lesson_replay_locked',
          },
          { status: 403 },
        );
      }

      if (insertError?.code !== '23505') throw insertError;

      const racedActive = await findActiveSession(supabase, userId);
      if (racedActive.error) throw racedActive.error;
      if (racedActive.data) {
        return NextResponse.json({
          error: 'Na tomto účtu už běží jiná hodina.',
          activeSessionId: racedActive.data.id,
        }, { status: 409 });
      }
    }

    return NextResponse.json({ error: 'Nepodařilo se vytvořit unikátní kód hodiny.' }, { status: 503 });
  } catch (error) {
    console.error('create session failed', error);
    return NextResponse.json({ error: 'Hodinu se nepodařilo spustit.' }, { status: 500 });
  }
}
