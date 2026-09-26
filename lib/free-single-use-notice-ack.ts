import 'server-only';

import { getDatabaseBackend } from '@/lib/neon/config';
import { createNeonSql } from '@/lib/neon/server';
import { FREE_SINGLE_USE_NOTICE, FREE_SINGLE_USE_NOTICE_VERSION } from '@/lib/free-single-use-notice';

// Append-only evidence in private.free_single_use_notice_acknowledgements
// (neon/migrations/0023) that a Free teacher closed the single live use notice.

export type FreeSingleUseNoticeDismissal = 'ok' | 'close';

/** Never throws: without a record (or before migration 0023) the notice stays visible. */
export async function hasAcknowledgedFreeSingleUseNotice(userId: string) {
  if (getDatabaseBackend() !== 'neon') return false;
  try {
    const rows = await createNeonSql()`
      select exists (
        select 1 from private.free_single_use_notice_acknowledgements a
        where a.user_id = ${userId}::uuid
          and a.notice_version = ${FREE_SINGLE_USE_NOTICE_VERSION}
      ) as acknowledged
    `;
    return rows[0]?.acknowledged === true;
  } catch (error) {
    console.error('free single use notice acknowledgement lookup failed', error instanceof Error ? error.message : 'unknown');
    return false;
  }
}

export async function recordFreeSingleUseNoticeAcknowledgement(input: {
  userId: string;
  lessonId: string | null;
  locale: 'cs' | 'en';
  dismissedVia: FreeSingleUseNoticeDismissal;
}) {
  if (getDatabaseBackend() !== 'neon') throw new Error('free_single_use_notice_ack_unavailable');
  // The lesson is kept only when it belongs to the teacher; the text is taken
  // from the server constant, never from the request.
  const rows = await createNeonSql()`
    insert into private.free_single_use_notice_acknowledgements
      (user_id, lesson_id, notice_version, locale, notice_text, dismissed_via)
    select ${input.userId}::uuid,
           (select l.id from public.lessons l where l.id = ${input.lessonId}::uuid and l.owner_id = ${input.userId}::uuid),
           ${FREE_SINGLE_USE_NOTICE_VERSION},
           ${input.locale},
           ${FREE_SINGLE_USE_NOTICE[input.locale]},
           ${input.dismissedVia}
    where exists (select 1 from public.profiles p where p.id = ${input.userId}::uuid)
    returning acknowledged_at
  `;
  const acknowledgedAt = rows[0]?.acknowledged_at;
  if (acknowledgedAt instanceof Date) return acknowledgedAt.toISOString();
  if (typeof acknowledgedAt === 'string') return acknowledgedAt;
  throw new Error('free_single_use_notice_ack_write_failed');
}
