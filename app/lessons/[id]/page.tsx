import { notFound, redirect } from 'next/navigation';
import LessonWorkspace from '@/components/LessonWorkspace';
import StartSessionButton from '@/components/StartSessionButton';
import {
  LessonReuseReadError,
  readLessonLiveUsage,
  readLessonReuseEntitlement,
} from '@/lib/lesson-reuse-reader';
import { LessonDetailReadError, readLessonDetail } from '@/lib/lesson-detail-reader';
import { LessonSchema } from '@/lib/schema';
import { getLessonOrganizationOriginAccess } from '@/lib/organization-origin-access';
import { createClient } from '@/lib/supabase/server';
import { requireCurrentTermsForPage } from '@/lib/terms-page-gate';

export const dynamic = 'force-dynamic';

type Props = {
  params: Promise<{ id: string }>;
};

export default async function LessonPage({ params }: Props) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: claimsData } = await supabase.auth.getClaims();
  const userId = typeof claimsData?.claims?.sub === 'string' ? claimsData.claims.sub : null;
  if (!userId) redirect('/');
  await requireCurrentTermsForPage(userId, `/lessons/${id}`);

  const row = await readLessonDetail(supabase, userId, id).catch((lessonError: unknown) => {
    console.error(
      'load lesson detail failed',
      lessonError instanceof LessonDetailReadError ? lessonError.code : 'LESSON_DETAIL_QUERY_FAILED',
    );
    return null;
  });

  if (!row) notFound();

  const parsed = LessonSchema.safeParse(row.lesson);
  if (!parsed.success) notFound();

  const [reusableLessons, originAccess] = await Promise.all([
    readLessonReuseEntitlement(supabase, userId).catch((reuseError) => {
      console.error(
        'load lesson reuse entitlement failed',
        reuseError instanceof LessonReuseReadError ? reuseError.code : 'LESSON_REUSE_ENTITLEMENT_QUERY_FAILED',
      );
      return false;
    }),
    getLessonOrganizationOriginAccess(userId, id),
  ]);
  const licenseLocked = Boolean(originAccess?.locked);
  let liveLocked = false;

  if (!reusableLessons) {
    const usage = await readLessonLiveUsage(supabase, userId, id).catch((usageError) => {
      console.error(
        'load lesson live usage failed',
        usageError instanceof LessonReuseReadError ? usageError.code : 'LESSON_LIVE_USAGE_QUERY_FAILED',
      );
      return [];
    });
    liveLocked = usage.length > 0;
  }

  return (
    <>
      <StartSessionButton
        lessonId={row.id as string}
        userId={userId}
        liveLocked={liveLocked}
        licenseLocked={licenseLocked}
        freeSingleUse={!reusableLessons && !liveLocked && !licenseLocked}
        organizationName={originAccess?.organizationName ?? null}
      />
      <LessonWorkspace
        initialLesson={parsed.data}
        initialLessonId={row.id as string}
        initialOwnerId={userId}
        initialPrompt={(row.source_prompt as string | null) ?? null}
        licenseLocked={licenseLocked}
        organizationName={originAccess?.organizationName ?? null}
      />
    </>
  );
}
