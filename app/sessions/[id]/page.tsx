import { notFound, redirect } from 'next/navigation';
import EvaluationBackgroundPump from '@/components/EvaluationBackgroundPump';
import SessionReport from '@/components/SessionReport';
import TeacherLiveTools from '@/components/TeacherLiveTools';
import TeacherScoreboardQuickAction from '@/components/TeacherScoreboardQuickAction';
import TeacherSession from '@/components/TeacherSession';
import { createClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

type Props = { params: Promise<{ id: string }> };
type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

const RETRY_DELAYS_MS = [200, 600] as const;

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function getTeacherUserId(supabase: SupabaseServerClient) {
  let lastError: unknown = null;

  for (let attempt = 0; attempt <= RETRY_DELAYS_MS.length; attempt += 1) {
    const { data, error } = await supabase.auth.getClaims();
    if (!error) {
      return typeof data?.claims?.sub === 'string' ? data.claims.sub : null;
    }

    lastError = error;
    if (attempt < RETRY_DELAYS_MS.length) await sleep(RETRY_DELAYS_MS[attempt]);
  }

  throw lastError ?? new Error('Teacher auth lookup failed.');
}

async function loadOwnedSession(supabase: SupabaseServerClient, id: string, userId: string) {
  let lastError: unknown = null;

  for (let attempt = 0; attempt <= RETRY_DELAYS_MS.length; attempt += 1) {
    const { data, error } = await supabase
      .from('sessions')
      .select('id')
      .eq('id', id)
      .eq('teacher_id', userId)
      .maybeSingle();

    if (!error) return data;

    lastError = error;
    if (attempt < RETRY_DELAYS_MS.length) await sleep(RETRY_DELAYS_MS[attempt]);
  }

  throw lastError ?? new Error('Teacher session lookup failed.');
}

export default async function TeacherSessionPage({ params }: Props) {
  const { id } = await params;
  const supabase = await createClient();
  const userId = await getTeacherUserId(supabase);
  if (!userId) redirect('/');

  const session = await loadOwnedSession(supabase, id, userId);
  if (!session) notFound();

  return (
    <>
      <EvaluationBackgroundPump sessionId={id} />
      <TeacherSession sessionId={id} />
      <TeacherScoreboardQuickAction sessionId={id} />
      <TeacherLiveTools sessionId={id} />
      <SessionReport sessionId={id} />
    </>
  );
}
