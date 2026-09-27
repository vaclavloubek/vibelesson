import LessonWorkspace from '@/components/LessonWorkspace';
import { createClient } from '@/lib/supabase/server';
import { requireCurrentTermsForPage } from '@/lib/terms-page-gate';

type Props = {
  searchParams: Promise<{ folder?: string | string[]; ukazka?: string | string[] }>;
};

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export default async function NewLessonPage({ searchParams }: Props) {
  const params = await searchParams;
  const rawFolder = Array.isArray(params.folder) ? params.folder[0] : params.folder;
  const initialFolderId = rawFolder && UUID_PATTERN.test(rawFolder) ? rawFolder : null;
  // /new?ukazka=1 opens the built-in example lesson (nothing is saved).
  const initialDemo = (Array.isArray(params.ukazka) ? params.ukazka[0] : params.ukazka) === '1';

  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const userId = typeof data?.claims?.sub === 'string' ? data.claims.sub : null;
  if (userId) {
    const returnTo = initialFolderId ? `/new?folder=${encodeURIComponent(initialFolderId)}` : initialDemo ? '/new?ukazka=1' : '/new';
    await requireCurrentTermsForPage(userId, returnTo);
  }

  return <LessonWorkspace initialFolderId={initialFolderId} initialDemo={initialDemo} signedIn={Boolean(userId)} />;
}
