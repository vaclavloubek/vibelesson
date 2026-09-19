import { notFound, redirect } from 'next/navigation';
import LessonWorkspace from '@/components/LessonWorkspace';
import StartSessionButton from '@/components/StartSessionButton';
import { getLessonReuseEntitlement } from '@/lib/lesson-reuse';
import { LessonSchema } from '@/lib/schema';
import { getLessonOrganizationOriginAccess } from '@/lib/organization-origin-access';
import { createClient } from '@/lib/supabase/server';

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

  const { data: row, error } = await supabase
    .from('lessons')
    .select('id, source_prompt, lesson')
    .eq('id', id)
    .eq('owner_id', userId)
    .single();

  if (error || !row) notFound();

  const parsed = LessonSchema.safeParse(row.lesson);
  if (!parsed.success) notFound();

  const [reusableLessons, originAccess] = await Promise.all([
    getLessonReuseEntitlement(supabase),
    getLessonOrganizationOriginAccess(userId, id),
  ]);
  const licenseLocked = Boolean(originAccess?.locked);
  let liveLocked = false;

  if (!reusableLessons) {
    const { data: usage, error: usageError } = await supabase
      .from('lesson_live_usage')
      .select('lesson_id')
      .eq('lesson_id', id)
      .maybeSingle();

    if (usageError) {
      console.error('load lesson live usage failed', usageError);
    } else {
      liveLocked = Boolean(usage);
    }
  }

  return (
    <>
      <StartSessionButton
        lessonId={row.id as string}
        userId={userId}
        liveLocked={liveLocked}
        licenseLocked={licenseLocked}
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
