import 'server-only';

import type { SupabaseClient } from '@supabase/supabase-js';
import { LessonSchema } from '@/lib/schema';
import { currentFreeDeviceBudgetHash } from '@/lib/free-device-budget';
import { getLessonReuseEntitlement } from '@/lib/lesson-reuse';
import { createNeonSql } from '@/lib/neon/server';
import { createAdminClient } from '@/lib/supabase/admin';

export type LessonDuplicateResult = {
  lessonId: string | null;
  allowed: boolean;
  used: number | null;
  monthlyLimit: number | null;
  denialCode: string | null;
  deviceUsed: number | null;
  deviceLimit: number | null;
};

type DuplicateRow = {
  lesson_id?: unknown;
  allowed?: unknown;
  used?: unknown;
  monthly_limit?: unknown;
  denial_code?: unknown;
  device_used?: unknown;
  device_limit?: unknown;
};

export class LessonDuplicateWriteError extends Error {
  readonly code: string;

  constructor(code: string, cause?: unknown) {
    super('Lesson duplication failed.', { cause });
    this.name = 'LessonDuplicateWriteError';
    this.code = code;
  }
}

function shouldDuplicateInNeon() {
  const enabled = process.env.DATABASE_BACKEND === 'neon' ? 'true' : process.env.NEON_LESSON_DUPLICATE_WRITES;
  if (enabled === undefined || enabled === '' || enabled === 'false') return false;
  if (enabled !== 'true') {
    throw new LessonDuplicateWriteError('INVALID_NEON_LESSON_DUPLICATE_WRITES');
  }

  if (process.env.VERCEL_ENV === 'production' && process.env.NEON_CUTOVER_APPROVED !== 'true') {
    throw new LessonDuplicateWriteError('NEON_PRODUCTION_LESSON_DUPLICATE_NOT_APPROVED');
  }

  return true;
}

function optionalString(value: unknown) {
  return typeof value === 'string' ? value : null;
}

function optionalNumber(value: unknown) {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value !== '' && Number.isFinite(Number(value))) return Number(value);
  return null;
}

function normalizeResult(row: DuplicateRow | undefined): LessonDuplicateResult {
  if (!row || typeof row.allowed !== 'boolean') {
    throw new LessonDuplicateWriteError('INVALID_LESSON_DUPLICATE_RESULT');
  }

  const result = {
    lessonId: optionalString(row.lesson_id),
    allowed: row.allowed,
    used: optionalNumber(row.used),
    monthlyLimit: optionalNumber(row.monthly_limit),
    denialCode: optionalString(row.denial_code),
    deviceUsed: optionalNumber(row.device_used),
    deviceLimit: optionalNumber(row.device_limit),
  };

  if (result.allowed && !result.lessonId) {
    throw new LessonDuplicateWriteError('LESSON_DUPLICATE_RETURNED_NO_ROW');
  }

  return result;
}

async function duplicateInNeon(userId: string, lessonId: string) {
  try {
    const deviceHash = await currentFreeDeviceBudgetHash();
    const sql = createNeonSql();
    const rows = await sql`
      select
        lesson_id::text as lesson_id,
        allowed,
        used,
        monthly_limit,
        denial_code,
        device_used,
        device_limit
      from public.duplicate_lesson_server(
        ${userId}::uuid,
        ${lessonId}::uuid,
        ${deviceHash}
      )
    `;
    return normalizeResult(rows[0] as DuplicateRow | undefined);
  } catch (error) {
    if (error instanceof LessonDuplicateWriteError) throw error;
    throw new LessonDuplicateWriteError('NEON_LESSON_DUPLICATE_FAILED', error);
  }
}

async function duplicateInSupabase(
  supabase: SupabaseClient,
  userId: string,
  lessonId: string,
) {
  let requestId: string | null = null;

  try {
    const { data: current, error: readError } = await supabase
      .from('lessons')
      .select('title, source_prompt, lesson, folder_id')
      .eq('id', lessonId)
      .eq('owner_id', userId)
      .maybeSingle();

    if (readError) throw readError;
    if (!current) {
      return normalizeResult({ allowed: false, denial_code: 'lesson_not_found' });
    }

    const admin = createAdminClient();
    const reusableLessons = await getLessonReuseEntitlement(supabase);
    let quotaRow: DuplicateRow = { allowed: true };

    if (!reusableLessons) {
      const deviceHash = await currentFreeDeviceBudgetHash();
      const { data: quotaData, error: quotaError } = await admin.rpc('reserve_lesson_import_server', {
        p_user_id: userId,
        p_device_token_hash: deviceHash,
      });
      if (quotaError) throw quotaError;

      quotaRow = (Array.isArray(quotaData) ? quotaData[0] : quotaData) as DuplicateRow;
      if (!quotaRow?.allowed) return normalizeResult(quotaRow);

      requestId = optionalString((quotaRow as DuplicateRow & { request_id?: unknown }).request_id);
      if (!requestId) throw new LessonDuplicateWriteError('LESSON_DUPLICATE_QUOTA_REQUEST_MISSING');
    }

    const lesson = LessonSchema.parse(current.lesson);
    const copyTitle = `${current.title} – kopie`.slice(0, 200);
    const copiedLesson = LessonSchema.parse({ ...lesson, title: copyTitle });

    const { data: copy, error: insertError } = await admin
      .from('lessons')
      .insert({
        owner_id: userId,
        title: copyTitle,
        source_prompt: current.source_prompt,
        lesson: copiedLesson,
        folder_id: current.folder_id,
        source_lesson_id: lessonId,
      })
      .select('id')
      .single();

    if (insertError || !copy?.id) throw insertError ?? new Error('Duplicate returned no row.');

    if (requestId) {
      const { data: finished, error: finishError } = await admin.rpc('finish_generation_request_server', {
        p_user_id: userId,
        p_request_id: requestId,
        p_status: 'succeeded',
        p_cost_usd: 0,
        p_lesson_id: copy.id,
      });
      if (finishError || finished !== true) {
        throw finishError ?? new Error('Duplicate quota request was not completed.');
      }
    }

    return normalizeResult({ ...quotaRow, allowed: true, lesson_id: copy.id });
  } catch (error) {
    if (requestId) {
      const admin = createAdminClient();
      const { error: finishError } = await admin.rpc('finish_generation_request_server', {
        p_user_id: userId,
        p_request_id: requestId,
        p_status: 'failed',
        p_cost_usd: 0,
        p_lesson_id: null,
      });
      if (finishError) console.error('fail duplicate quota request cleanup failed', finishError);
    }

    if (error instanceof LessonDuplicateWriteError) throw error;
    throw new LessonDuplicateWriteError('SUPABASE_LESSON_DUPLICATE_FAILED', error);
  }
}

export async function duplicateOwnedLesson(
  supabase: SupabaseClient,
  userId: string,
  lessonId: string,
) {
  return shouldDuplicateInNeon()
    ? duplicateInNeon(userId, lessonId)
    : duplicateInSupabase(supabase, userId, lessonId);
}
