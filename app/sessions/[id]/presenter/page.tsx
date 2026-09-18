import { notFound, redirect } from 'next/navigation';
import PresenterMode from '@/components/PresenterMode';
import { readLiveResume } from '@/lib/live-resume';
import { createClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'Prezentační režim | Syllonaut',
};

type Props = { params: Promise<{ id: string }> };

export default async function PresenterPage({ params }: Props) {
  const { id } = await params;
  const supabase = await createClient();
  const resume = await readLiveResume(id);
  const { data: claimsData, error: authError } = await supabase.auth.getClaims();
  const userId = typeof claimsData?.claims?.sub === 'string' ? claimsData.claims.sub : null;

  if (!userId) {
    if (!authError || !resume) redirect('/');
    console.warn('presenter page restored from resume ticket', { sessionId: id });
    return <PresenterMode sessionId={id} />;
  }

  const { data: session, error: sessionError } = await supabase
    .from('sessions')
    .select('id')
    .eq('id', id)
    .eq('teacher_id', userId)
    .maybeSingle();

  if (sessionError) {
    if (resume?.userId !== userId) throw sessionError;
    console.warn('presenter ownership lookup degraded; using resume ticket', { sessionId: id });
    return <PresenterMode sessionId={id} />;
  }
  if (!session) notFound();

  return <PresenterMode sessionId={id} />;
}
