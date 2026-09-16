import { notFound, redirect } from 'next/navigation';
import EvaluationBackgroundPump from '@/components/EvaluationBackgroundPump';
import SessionReport from '@/components/SessionReport';
import TeacherSession from '@/components/TeacherSession';
import { createClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

type Props = { params: Promise<{ id: string }> };

export default async function TeacherSessionPage({ params }: Props) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: claimsData } = await supabase.auth.getClaims();
  const userId = typeof claimsData?.claims?.sub === 'string' ? claimsData.claims.sub : null;
  if (!userId) redirect('/');

  const { data: session } = await supabase
    .from('sessions')
    .select('id')
    .eq('id', id)
    .eq('teacher_id', userId)
    .maybeSingle();
  if (!session) notFound();

  return (
    <>
      <EvaluationBackgroundPump sessionId={id} />
      <TeacherSession sessionId={id} />
      <SessionReport sessionId={id} />
    </>
  );
}
