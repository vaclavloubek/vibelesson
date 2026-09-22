import 'server-only';

import type { SupabaseClient } from '@supabase/supabase-js';
import { createNeonSql } from '@/lib/neon/server';
import { getLessonReuseEntitlement } from '@/lib/lesson-reuse';

export type LessonLiveUsageRow = {
  lesson_id: string;
};

export class LessonReuseReadError extends Error {
  readonly code: string;

  constructor(code: string, cause?: unknown) {
    super('Lesson reuse lookup failed.', { cause });
    this.name = 'LessonReuseReadError';
    this.code = code;
  }
}

function shouldReadFromNeon() {
  const enabled = process.env.NEON_LESSON_REUSE_READS;
  if (enabled === undefined || enabled === '' || enabled === 'false') return false;
  if (enabled !== 'true') {
    throw new LessonReuseReadError('INVALID_NEON_LESSON_REUSE_READS');
  }

  if (process.env.VERCEL_ENV === 'production' && process.env.NEON_CUTOVER_APPROVED !== 'true') {
    throw new LessonReuseReadError('NEON_PRODUCTION_LESSON_REUSE_READ_NOT_APPROVED');
  }

  return true;
}

function normalizeEntitlement(row: Record<string, unknown> | null) {
  if (!row || typeof row.enabled !== 'boolean') {
    throw new LessonReuseReadError('INVALID_LESSON_REUSE_ENTITLEMENT_RESULT');
  }
  return row.enabled;
}

function normalizeUsage(rows: Record<string, unknown>[]) {
  return rows.map((row) => {
    if (typeof row.lesson_id !== 'string') {
      throw new LessonReuseReadError('INVALID_LESSON_LIVE_USAGE_RESULT');
    }
    return { lesson_id: row.lesson_id };
  }).sort((left, right) => left.lesson_id.localeCompare(right.lesson_id));
}

async function readEntitlementFromNeon(userId: string) {
  const sql = createNeonSql();

  try {
    const rows = await sql`
      select coalesce((
        select
          p.role = 'admin'
          or coalesce(p.active_plan_code, 'free') <> 'free'
          or exists (
            select 1
            from private.current_active_organization(${userId}::uuid)
          )
        from public.profiles p
        where p.id = ${userId}
      ), false) as enabled
    `;

    return normalizeEntitlement((rows[0] as Record<string, unknown> | undefined) ?? null);
  } catch (error) {
    if (error instanceof LessonReuseReadError) throw error;
    throw new LessonReuseReadError('NEON_LESSON_REUSE_ENTITLEMENT_QUERY_FAILED', error);
  }
}

async function readUsageFromNeon(userId: string, lessonId?: string) {
  const sql = createNeonSql();

  try {
    const rows = lessonId
      ? await sql`
          select lesson_id::text as lesson_id
          from public.lesson_live_usage
          where owner_id = ${userId}
            and lesson_id = ${lessonId}
          order by lesson_id asc
        `
      : await sql`
          select lesson_id::text as lesson_id
          from public.lesson_live_usage
          where owner_id = ${userId}
          order by lesson_id asc
        `;

    return normalizeUsage(rows);
  } catch (error) {
    if (error instanceof LessonReuseReadError) throw error;
    throw new LessonReuseReadError('NEON_LESSON_LIVE_USAGE_QUERY_FAILED', error);
  }
}

async function readUsageFromSupabase(
  supabase: SupabaseClient,
  userId: string,
  lessonId?: string,
) {
  let query = supabase
    .from('lesson_live_usage')
    .select('lesson_id')
    .eq('owner_id', userId)
    .order('lesson_id', { ascending: true });

  if (lessonId) query = query.eq('lesson_id', lessonId);
  const { data, error } = await query;

  if (error) {
    throw new LessonReuseReadError(error.code || 'SUPABASE_LESSON_LIVE_USAGE_QUERY_FAILED', error);
  }

  return normalizeUsage((data ?? []) as Record<string, unknown>[]);
}

export async function readLessonReuseEntitlement(
  supabase: SupabaseClient,
  userId: string,
) {
  return shouldReadFromNeon()
    ? readEntitlementFromNeon(userId)
    : getLessonReuseEntitlement(supabase);
}

export async function readLessonLiveUsage(
  supabase: SupabaseClient,
  userId: string,
  lessonId?: string,
) {
  return shouldReadFromNeon()
    ? readUsageFromNeon(userId, lessonId)
    : readUsageFromSupabase(supabase, userId, lessonId);
}
