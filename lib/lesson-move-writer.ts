import 'server-only';

import type { SupabaseClient } from '@supabase/supabase-js';
import { createNeonSql } from '@/lib/neon/server';

export class LessonMoveWriteError extends Error {
  readonly code: string;

  constructor(code: string, cause?: unknown) {
    super('Lesson folder assignment failed.', { cause });
    this.name = 'LessonMoveWriteError';
    this.code = code;
  }
}

function shouldWriteToNeon() {
  const enabled = process.env.DATABASE_BACKEND === 'neon' ? 'true' : process.env.NEON_LESSON_MOVE_WRITES;
  if (enabled === undefined || enabled === '' || enabled === 'false') return false;
  if (enabled !== 'true') throw new LessonMoveWriteError('INVALID_NEON_LESSON_MOVE_WRITES');

  if (process.env.VERCEL_ENV === 'production' && process.env.NEON_CUTOVER_APPROVED !== 'true') {
    throw new LessonMoveWriteError('NEON_PRODUCTION_LESSON_MOVE_NOT_APPROVED');
  }

  return true;
}

async function moveInNeon(
  userId: string,
  lessonIds: string[],
  folderId: string | null,
) {
  const sql = createNeonSql();

  if (folderId) {
    const folders = await sql`
      select id::text as id
      from public.lesson_folders
      where id = ${folderId}
        and owner_id = ${userId}
      limit 1
    `;
    if (!folders[0]) throw new LessonMoveWriteError('FOLDER_NOT_FOUND');
  }

  try {
    const rows = await sql`
      update public.lessons
      set folder_id = ${folderId}
      where owner_id = ${userId}
        and id in (
          select value::uuid
          from jsonb_array_elements_text(${JSON.stringify(lessonIds)}::jsonb)
        )
      returning id::text as id
    `;
    if (rows.length !== lessonIds.length) {
      throw new LessonMoveWriteError('MOVE_INCOMPLETE');
    }
    return rows.map((row) => String(row.id));
  } catch (error) {
    if (error instanceof LessonMoveWriteError) throw error;
    throw new LessonMoveWriteError('NEON_LESSON_MOVE_FAILED', error);
  }
}

async function moveInSupabase(
  supabase: SupabaseClient,
  userId: string,
  lessonIds: string[],
  folderId: string | null,
) {
  if (folderId) {
    const { data: folder, error } = await supabase
      .from('lesson_folders')
      .select('id')
      .eq('id', folderId)
      .eq('owner_id', userId)
      .maybeSingle();

    if (error) throw new LessonMoveWriteError(error.code || 'SUPABASE_FOLDER_LOOKUP_FAILED', error);
    if (!folder) throw new LessonMoveWriteError('FOLDER_NOT_FOUND');
  }

  const { data, error } = await supabase
    .from('lessons')
    .update({ folder_id: folderId })
    .eq('owner_id', userId)
    .in('id', lessonIds)
    .select('id');

  if (error) throw new LessonMoveWriteError(error.code || 'SUPABASE_LESSON_MOVE_FAILED', error);
  if ((data ?? []).length !== lessonIds.length) throw new LessonMoveWriteError('MOVE_INCOMPLETE');
  return (data ?? []).map((row) => String(row.id));
}

export async function moveLessonsToFolder(
  supabase: SupabaseClient,
  userId: string,
  lessonIds: string[],
  folderId: string | null,
) {
  return shouldWriteToNeon()
    ? moveInNeon(userId, lessonIds, folderId)
    : moveInSupabase(supabase, userId, lessonIds, folderId);
}
