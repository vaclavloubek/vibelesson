import 'server-only';

import { createNeonSql } from '@/lib/neon/server';
import { createClient as createSupabaseClient } from '@/lib/supabase/server';

export class LessonShareReadError extends Error {
  readonly code: string;

  constructor(code: string, cause?: unknown) {
    super('Public lesson share lookup failed.', { cause });
    this.name = 'LessonShareReadError';
    this.code = code;
  }
}

function shouldReadFromNeon() {
  const enabled = process.env.NEON_SHARED_LESSON_READS;
  if (enabled === undefined || enabled === '' || enabled === 'false') return false;
  if (enabled !== 'true') {
    throw new LessonShareReadError('INVALID_NEON_SHARED_LESSON_READS');
  }

  if (process.env.VERCEL_ENV === 'production' && process.env.NEON_CUTOVER_APPROVED !== 'true') {
    throw new LessonShareReadError('NEON_PRODUCTION_READ_NOT_APPROVED');
  }

  return true;
}

async function readFromNeon(token: string) {
  const sql = createNeonSql();

  try {
    const rows = await sql`
      select snapshot
      from public.lesson_shares
      where token = ${token}
        and status = 'active'
        and organization_origin_id is null
      limit 1
    `;

    return rows[0]?.snapshot ?? null;
  } catch (error) {
    throw new LessonShareReadError('NEON_LESSON_SHARE_QUERY_FAILED', error);
  }
}

async function readFromSupabase(token: string) {
  const supabase = await createSupabaseClient();
  const { data, error } = await supabase.rpc('get_lesson_share', { p_token: token });

  if (error) {
    throw new LessonShareReadError(error.code || 'SUPABASE_LESSON_SHARE_RPC_FAILED', error);
  }

  return data;
}

export async function readPublicLessonShare(token: string) {
  return shouldReadFromNeon() ? readFromNeon(token) : readFromSupabase(token);
}
