import 'server-only';

import { currentFreeDeviceBudgetHash } from '@/lib/free-device-budget';
import { createNeonSql } from '@/lib/neon/server';
import { createAdminClient } from '@/lib/supabase/admin';

export type SharedLessonImportResult = {
  lessonId: string | null;
  allowed: boolean;
  denialCode: string | null;
  alreadyImported: boolean;
};

type ImportRow = {
  lesson_id?: unknown;
  allowed?: unknown;
  denial_code?: unknown;
  already_imported?: unknown;
};

export class SharedLessonImportWriteError extends Error {
  readonly code: string;

  constructor(code: string, cause?: unknown) {
    super('Shared lesson import failed.', { cause });
    this.name = 'SharedLessonImportWriteError';
    this.code = code;
  }
}

function shouldImportInNeon() {
  const enabled = process.env.NEON_SHARED_LESSON_IMPORT_WRITES;
  if (enabled === undefined || enabled === '' || enabled === 'false') return false;
  if (enabled !== 'true') {
    throw new SharedLessonImportWriteError('INVALID_NEON_SHARED_LESSON_IMPORT_WRITES');
  }

  if (process.env.VERCEL_ENV === 'production' && process.env.NEON_CUTOVER_APPROVED !== 'true') {
    throw new SharedLessonImportWriteError('NEON_PRODUCTION_SHARED_LESSON_IMPORT_NOT_APPROVED');
  }

  return true;
}

function normalizeResult(row: ImportRow | undefined): SharedLessonImportResult {
  if (!row || typeof row.allowed !== 'boolean') {
    throw new SharedLessonImportWriteError('INVALID_SHARED_LESSON_IMPORT_RESULT');
  }

  const lessonId = typeof row.lesson_id === 'string' ? row.lesson_id : null;
  const denialCode = typeof row.denial_code === 'string' ? row.denial_code : null;
  const alreadyImported = row.already_imported === true;

  if (row.allowed && !lessonId) {
    throw new SharedLessonImportWriteError('SHARED_LESSON_IMPORT_RETURNED_NO_ROW');
  }

  return { lessonId, allowed: row.allowed, denialCode, alreadyImported };
}

async function importInNeon(userId: string, token: string) {
  try {
    const deviceHash = await currentFreeDeviceBudgetHash();
    const sql = createNeonSql();
    const rows = await sql`
      select
        lesson_id::text as lesson_id,
        allowed,
        denial_code,
        already_imported
      from public.import_shared_lesson_neon_server(
        ${userId}::uuid,
        ${token},
        ${deviceHash}
      )
    `;
    return normalizeResult(rows[0] as ImportRow | undefined);
  } catch (error) {
    if (error instanceof SharedLessonImportWriteError) throw error;
    throw new SharedLessonImportWriteError('NEON_SHARED_LESSON_IMPORT_FAILED', error);
  }
}

async function importInSupabase(userId: string, token: string) {
  const admin = createAdminClient();
  const deviceHash = await currentFreeDeviceBudgetHash();
  const { data, error } = await admin.rpc('import_lesson_share_server', {
    p_user_id: userId,
    p_token: token,
    p_device_token_hash: deviceHash,
  });

  if (error) {
    if (error.code === 'P0002') {
      return normalizeResult({ allowed: false, denial_code: 'share_not_found' });
    }
    for (const code of [
      'free_lesson_import_quota_exhausted',
      'free_device_budget_exhausted',
      'free_device_cookie_required',
    ]) {
      if (error.message?.includes(code)) {
        return normalizeResult({ allowed: false, denial_code: code });
      }
    }
    throw new SharedLessonImportWriteError(error.code || 'SUPABASE_SHARED_LESSON_IMPORT_FAILED', error);
  }

  return normalizeResult({ lesson_id: data, allowed: true, already_imported: false });
}

export async function importSharedLesson(userId: string, token: string) {
  return shouldImportInNeon()
    ? importInNeon(userId, token)
    : importInSupabase(userId, token);
}
