import 'server-only';

import type { SupabaseClient } from '@supabase/supabase-js';
import { createNeonSql } from '@/lib/neon/server';

export type LessonCatalogRow = {
  id: string;
  title: string;
  lesson: unknown;
  folder_id: string | null;
  organization_origin_id: string | null;
  created_at: string;
  updated_at: string;
};

export class LessonListReadError extends Error {
  readonly code: string;

  constructor(code: string, cause?: unknown) {
    super('Lesson list lookup failed.', { cause });
    this.name = 'LessonListReadError';
    this.code = code;
  }
}

function shouldReadFromNeon() {
  const enabled = process.env.NEON_LESSON_LIST_READS;
  if (enabled === undefined || enabled === '' || enabled === 'false') return false;
  if (enabled !== 'true') {
    throw new LessonListReadError('INVALID_NEON_LESSON_LIST_READS');
  }

  if (process.env.VERCEL_ENV === 'production' && process.env.NEON_CUTOVER_APPROVED !== 'true') {
    throw new LessonListReadError('NEON_PRODUCTION_LESSON_LIST_READ_NOT_APPROVED');
  }

  return true;
}

function normalizeRows(rows: Record<string, unknown>[]): LessonCatalogRow[] {
  return rows.map((row) => {
    if (
      typeof row.id !== 'string'
      || typeof row.title !== 'string'
      || (row.folder_id !== null && typeof row.folder_id !== 'string')
      || (row.organization_origin_id !== null && typeof row.organization_origin_id !== 'string')
      || typeof row.created_at !== 'string'
      || typeof row.updated_at !== 'string'
    ) {
      throw new LessonListReadError('INVALID_LESSON_LIST_RESULT');
    }

    return {
      id: row.id,
      title: row.title,
      lesson: row.lesson,
      folder_id: row.folder_id,
      organization_origin_id: row.organization_origin_id,
      created_at: row.created_at,
      updated_at: row.updated_at,
    };
  }).sort((left, right) => (
    right.updated_at.localeCompare(left.updated_at) || left.id.localeCompare(right.id)
  ));
}

async function readFromNeon(userId: string) {
  const sql = createNeonSql();

  try {
    const rows = await sql`
      select
        id::text as id,
        title,
        lesson,
        folder_id::text as folder_id,
        organization_origin_id::text as organization_origin_id,
        created_at::text as created_at,
        updated_at::text as updated_at
      from public.lessons
      where owner_id = ${userId}
      order by updated_at desc, id asc
    `;

    return normalizeRows(rows);
  } catch (error) {
    if (error instanceof LessonListReadError) throw error;
    throw new LessonListReadError('NEON_LESSON_LIST_QUERY_FAILED', error);
  }
}

async function readFromSupabase(supabase: SupabaseClient, userId: string) {
  const { data, error } = await supabase
    .from('lessons')
    .select('id, title, lesson, folder_id, organization_origin_id, created_at, updated_at')
    .eq('owner_id', userId)
    .order('updated_at', { ascending: false })
    .order('id', { ascending: true });

  if (error) {
    throw new LessonListReadError(error.code || 'SUPABASE_LESSON_LIST_QUERY_FAILED', error);
  }

  return normalizeRows((data ?? []) as Record<string, unknown>[]);
}

export async function readLessonList(supabase: SupabaseClient, userId: string) {
  return shouldReadFromNeon()
    ? readFromNeon(userId)
    : readFromSupabase(supabase, userId);
}
