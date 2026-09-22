import 'server-only';

import type { SupabaseClient } from '@supabase/supabase-js';
import type { Lesson } from '@/lib/schema';
import { createNeonSql } from '@/lib/neon/server';

export class LessonContentWriteError extends Error {
  readonly code: string;

  constructor(code: string, cause?: unknown) {
    super('Lesson content mutation failed.', { cause });
    this.name = 'LessonContentWriteError';
    this.code = code;
  }
}

function shouldWriteToNeon() {
  const enabled = process.env.NEON_LESSON_CONTENT_WRITES;
  if (enabled === undefined || enabled === '' || enabled === 'false') return false;
  if (enabled !== 'true') {
    throw new LessonContentWriteError('INVALID_NEON_LESSON_CONTENT_WRITES');
  }

  if (process.env.VERCEL_ENV === 'production' && process.env.NEON_CUTOVER_APPROVED !== 'true') {
    throw new LessonContentWriteError('NEON_PRODUCTION_LESSON_CONTENT_WRITE_NOT_APPROVED');
  }

  return true;
}

function normalizeLesson(value: unknown): Lesson {
  if (!value || typeof value !== 'object') {
    throw new LessonContentWriteError('INVALID_LESSON_CONTENT_RESULT');
  }
  return value as Lesson;
}

async function readFromNeon(userId: string, lessonId: string) {
  const sql = createNeonSql();
  const rows = await sql`
    select lesson
    from public.lessons
    where id = ${lessonId}
      and owner_id = ${userId}
    limit 1
  `;
  if (!rows[0]) throw new LessonContentWriteError('LESSON_NOT_FOUND');
  return normalizeLesson(rows[0].lesson);
}

async function readFromSupabase(
  supabase: SupabaseClient,
  userId: string,
  lessonId: string,
) {
  const { data, error } = await supabase
    .from('lessons')
    .select('lesson')
    .eq('id', lessonId)
    .eq('owner_id', userId)
    .maybeSingle();

  if (error) throw new LessonContentWriteError(error.code || 'SUPABASE_LESSON_CONTENT_READ_FAILED', error);
  if (!data) throw new LessonContentWriteError('LESSON_NOT_FOUND');
  return normalizeLesson(data.lesson);
}

async function writeToNeon(
  userId: string,
  lessonId: string,
  title: string,
  lesson: Lesson,
) {
  try {
    const sql = createNeonSql();
    const rows = await sql`
      update public.lessons
      set title = ${title},
          lesson = ${JSON.stringify(lesson)}::jsonb,
          updated_at = now()
      where id = ${lessonId}
        and owner_id = ${userId}
      returning id::text as id
    `;
    if (!rows[0]) throw new LessonContentWriteError('LESSON_NOT_FOUND');
  } catch (error) {
    if (error instanceof LessonContentWriteError) throw error;
    throw new LessonContentWriteError('NEON_LESSON_CONTENT_WRITE_FAILED', error);
  }
}

async function writeToSupabase(
  supabase: SupabaseClient,
  userId: string,
  lessonId: string,
  title: string,
  lesson: Lesson,
) {
  const { data, error } = await supabase
    .from('lessons')
    .update({ title, lesson, updated_at: new Date().toISOString() })
    .eq('id', lessonId)
    .eq('owner_id', userId)
    .select('id')
    .maybeSingle();

  if (error) throw new LessonContentWriteError(error.code || 'SUPABASE_LESSON_CONTENT_WRITE_FAILED', error);
  if (!data) throw new LessonContentWriteError('LESSON_NOT_FOUND');
}

export async function readLessonContentForWrite(
  supabase: SupabaseClient,
  userId: string,
  lessonId: string,
) {
  return shouldWriteToNeon()
    ? readFromNeon(userId, lessonId)
    : readFromSupabase(supabase, userId, lessonId);
}

export async function writeLessonContent(
  supabase: SupabaseClient,
  userId: string,
  lessonId: string,
  lesson: Lesson,
) {
  return shouldWriteToNeon()
    ? writeToNeon(userId, lessonId, lesson.title, lesson)
    : writeToSupabase(supabase, userId, lessonId, lesson.title, lesson);
}
