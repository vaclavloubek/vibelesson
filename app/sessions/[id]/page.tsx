import { notFound, redirect } from 'next/navigation';
import EvaluationBackgroundPump from '@/components/EvaluationBackgroundPump';
import EvaluationReviewQueue from '@/components/EvaluationReviewQueue';
import SessionReport from '@/components/SessionReport';
import TeacherScoreboard from '@/components/TeacherScoreboard';
import TeacherSession from '@/components/TeacherSession';
import { createClient } from '@/lib/supabase/server';
import styles from './TeacherToolsRow.module.css';

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
      <div className={styles.shell}>
        <section className={styles.tools} aria-label="Nástroje učitele">
          <div className={styles.heading}>
            <span className="eyebrow">Nástroje učitele</span>
            <p className="muted-copy">Průběžné skóre a AI hodnocení zůstávají dostupné bez překrývání výuky.</p>
          </div>
          <div className={styles.grid}>
            <TeacherScoreboard sessionId={id} />
            <EvaluationReviewQueue sessionId={id} />
          </div>
        </section>
      </div>
      <SessionReport sessionId={id} />
    </>
  );
}
