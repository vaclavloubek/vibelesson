import Link from 'next/link';
import { redirect } from 'next/navigation';
import LessonActions from './LessonActions';
import { LessonSchema } from '@/lib/schema';
import { createClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

function formatUpdatedAt(value: string) {
  return new Intl.DateTimeFormat('cs-CZ', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'Europe/Prague',
  }).format(new Date(value));
}

export default async function LessonsPage() {
  const supabase = await createClient();
  const { data: claimsData } = await supabase.auth.getClaims();
  const userId = typeof claimsData?.claims?.sub === 'string' ? claimsData.claims.sub : null;
  if (!userId) redirect('/');

  const { data: rows, error } = await supabase
    .from('lessons')
    .select('id, title, lesson, created_at, updated_at')
    .eq('owner_id', userId)
    .order('updated_at', { ascending: false });

  if (error) console.error('load lessons failed', error);

  const lessons = (rows ?? []).flatMap((row) => {
    const parsed = LessonSchema.safeParse(row.lesson);
    if (!parsed.success) return [];
    return [{
      id: row.id as string,
      title: row.title as string,
      lesson: parsed.data,
      updatedAt: row.updated_at as string,
    }];
  });

  return (
    <main className="shell lessons-shell">
      <header className="brand lessons-brand">
        <div className="brand-identity"><Link href="/" className="brand-home"><span className="brand-mark">E</span><strong>EduPilot</strong></Link><span className="beta">BETA</span></div>
        <nav className="main-nav"><Link href="/">Nová lekce</Link><Link href="/lessons" className="active">Moje lekce</Link></nav>
        <div className="lessons-user">{typeof claimsData?.claims?.email === 'string' ? claimsData.claims.email : 'Přihlášený učitel'}</div>
      </header>

      <section className="lessons-heading">
        <div>
          <span className="eyebrow">Pracovní prostor</span>
          <h1>Moje lekce</h1>
          <p>Všechny vygenerované lekce se sem ukládají automaticky.</p>
        </div>
        <Link href="/" className="primary button-link">+ Nová lekce</Link>
      </section>

      {error ? <div className="error">Lekce se nepodařilo načíst. Zkus stránku obnovit.</div> : null}

      {!error && lessons.length === 0 ? (
        <section className="lessons-empty panel">
          <h2>Zatím tu nic není</h2>
          <p>Vytvoř první lekci. Jakmile ji AI dokončí, uloží se sem automaticky.</p>
          <Link href="/" className="primary button-link">Vytvořit první lekci</Link>
        </section>
      ) : null}

      <section className="lesson-grid">
        {lessons.map(({ id, title, lesson, updatedAt }) => (
          <article className="lesson-card" key={id}>
            <div className="lesson-card-top">
              <div>
                <Link href={`/lessons/${id}`} className="lesson-title-link"><h2>{title}</h2></Link>
                {lesson.subtitle ? <p>{lesson.subtitle}</p> : null}
              </div>
              <LessonActions lessonId={id} title={title} />
            </div>
            <div className="lesson-card-meta">
              <span>{lesson.audience}</span>
              <span>{lesson.totalMinutes} min</span>
              <span>{lesson.blocks.length} aktivit</span>
            </div>
            <div className="lesson-card-footer">
              <span>Upraveno {formatUpdatedAt(updatedAt)}</span>
              <Link href={`/lessons/${id}`} className="auth-link">Otevřít</Link>
            </div>
          </article>
        ))}
      </section>
    </main>
  );
}
