import type { Metadata } from 'next';
import { headers } from 'next/headers';
import { notFound, redirect } from 'next/navigation';
import PresenterMode from '@/components/PresenterMode';
import { readLiveResume } from '@/lib/live-resume';
import { LOCALE_REQUEST_HEADER, normalizeUiLocale } from '@/lib/i18n';
import { createClient } from '@/lib/supabase/server';
import { readOwnedSessionAccess } from '@/lib/session-access-reader';
import { requireCurrentTermsForPage } from '@/lib/terms-page-gate';

export const dynamic = 'force-dynamic';

export async function generateMetadata(): Promise<Metadata> {
  const requestHeaders = await headers();
  const locale = normalizeUiLocale(requestHeaders.get(LOCALE_REQUEST_HEADER)) ?? 'cs';
  return {
    title: locale === 'en' ? 'Presenter mode | Syllonaut' : 'Prezentační režim | Syllonaut',
  };
}

type Props = { params: Promise<{ id: string }> };

export default async function PresenterPage({ params }: Props) {
  const requestHeaders = await headers();
  const locale = normalizeUiLocale(requestHeaders.get(LOCALE_REQUEST_HEADER)) ?? 'cs';
  const { id } = await params;
  const supabase = await createClient();
  const resume = await readLiveResume(id);
  const { data: claimsData, error: authError } = await supabase.auth.getClaims();
  const userId = typeof claimsData?.claims?.sub === 'string' ? claimsData.claims.sub : null;

  if (!userId) {
    if (!authError || !resume) redirect(`/${locale}`);
    console.warn('presenter page restored from resume ticket after primary auth failure', {
      sessionId: id,
      authError: true,
    });
    return <PresenterMode sessionId={id} userId={resume.userId} />;
  }

  await requireCurrentTermsForPage(userId, `/sessions/${id}/presenter`);

  let session: { id: string } | null = null;
  try {
    session = await readOwnedSessionAccess(supabase, userId, id);
  } catch (error) {
    if (resume?.userId !== userId) throw error;
    console.warn('presenter ownership lookup degraded; using resume ticket', { sessionId: id });
    return <PresenterMode sessionId={id} userId={userId} />;
  }
  if (!session) notFound();

  return <PresenterMode sessionId={id} userId={userId} />;
}
