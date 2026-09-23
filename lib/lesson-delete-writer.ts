import 'server-only';

import type { SupabaseClient } from '@supabase/supabase-js';
import { createNeonSql } from '@/lib/neon/server';

export class LessonDeleteWriteError extends Error {
  readonly code: string;

  constructor(code: string, cause?: unknown) {
    super('Lesson deletion failed.', { cause });
    this.name = 'LessonDeleteWriteError';
    this.code = code;
  }
}

function shouldDeleteFromNeon() {
  const enabled = process.env.DATABASE_BACKEND === 'neon' ? 'true' : process.env.NEON_LESSON_DELETE_WRITES;
  if (enabled === undefined || enabled === '' || enabled === 'false') return false;
  if (enabled !== 'true') {
    throw new LessonDeleteWriteError('INVALID_NEON_LESSON_DELETE_WRITES');
  }

  if (process.env.VERCEL_ENV === 'production' && process.env.NEON_CUTOVER_APPROVED !== 'true') {
    throw new LessonDeleteWriteError('NEON_PRODUCTION_LESSON_DELETE_NOT_APPROVED');
  }

  return true;
}

async function deleteFromNeon(userId: string, lessonId: string) {
  try {
    const sql = createNeonSql();
    const rows = await sql`
      delete from public.lessons
      where id = ${lessonId}
        and owner_id = ${userId}
      returning id::text as id
    `;
    if (!rows[0]) throw new LessonDeleteWriteError('LESSON_NOT_FOUND');
  } catch (error) {
    if (error instanceof LessonDeleteWriteError) throw error;
    throw new LessonDeleteWriteError('NEON_LESSON_DELETE_FAILED', error);
  }
}

async function deleteFromSupabase(
  supabase: SupabaseClient,
  userId: string,
  lessonId: string,
) {
  const { data, error } = await supabase
    .from('lessons')
    .delete()
    .eq('id', lessonId)
    .eq('owner_id', userId)
    .select('id')
    .maybeSingle();

  if (error) throw new LessonDeleteWriteError(error.code || 'SUPABASE_LESSON_DELETE_FAILED', error);
  if (!data) throw new LessonDeleteWriteError('LESSON_NOT_FOUND');
}

export async function deleteOwnedLesson(
  supabase: SupabaseClient,
  userId: string,
  lessonId: string,
) {
  return shouldDeleteFromNeon()
    ? deleteFromNeon(userId, lessonId)
    : deleteFromSupabase(supabase, userId, lessonId);
}
