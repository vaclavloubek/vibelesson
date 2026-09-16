import Link from 'next/link';
import { redirect } from 'next/navigation';
import LessonActions from './LessonActions';
import SyllonautMark from '@/components/SyllonautMark';
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

function formatSessionDuration(startedAt: string | null, endedAt: string) {
  if (!startedAt) return 'Délka neznámá';
  const start = Date.parse(startedAt);
  const end = Date.parse(endedAt);
  if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) return 'Délka neznámá';
  const minutes = Math.max(1, Math.round((end - start) / 60000));
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest ? `${hours} h ${rest} min` : `${hours} h`;
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

  const { data: sessionRows, error: sessionsError } = await supabase
    .from('sessions')
    .select('id, lesson_id, join_code, lesson_snapshot, started_at, ended_at')
    .eq('teacher_id', userId)
    .eq('status', 'ended')
    .not('ended_at', 'is', null)
    .order('ended_at', { ascending: false })
    .limit(12);

  if (error) console.error('load lessons failed', error);
  if (sessionsError) console.error('load ended sessions failed', sessionsError);

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

  const recentResults = (sessionRows ?? []).flatMap((row) => {
    const parsed = LessonSchema.safeParse(row.lesson_snapshot);
    const endedAt = typeof row.ended_at === 'string' ? row.ended_at : null;
    if (!parsed.success || !endedAt) return [];
    return [{
      id: row.id as string,
      lessonId: row.lesson_id as string | null,
      joinCode: row.join_code as string,
      title: parsed.data.title,
      subtitle: parsed.data.subtitle,
      startedAt: row.started_at as string | null,
      endedAt,
    }];
  });

  return (
    <main className="shell lessons-shell">
      <header className="brand lessons-brand">
        <div className="brand-identity"><Link href="/" className="brand-home"><SyllonautMark /><strong>Syllonaut</strong></Link><span className="beta">BETA</span></div>
        <nav className="main-nav"><Link href="/new">Nová lekce</Link><Link href="/lessons" className="active">Moje lekce</Link></nav>
        <div className="lessons-user">{typeof claimsData?.claims?.email === 'string' ? claimsData.claims.email : 'Přihlášený učitel'}</div>
      </header>

      <section className="lessons-heading">
        <div>
          <span className="eyebrow">Palubní deník</span>
          <h1>Moje lekce</h1>
          <p>Všechny připravené lekce se sem ukládají automaticky.</p>
        </div>
        <Link href="/new" className="primary button-link">+ Nová lekce</Link>
      </section>

      {error ? <div className="error">Lekce se nepodařilo načíst. Zkus stránku obnovit.</div> : null}

      {!error && lessons.length === 0 ? (
        <section className="lessons-empty panel">
          <span className="eyebrow">Začátek trasy</span>
          <h2>Zatím tu nic není</h2>
          <p>Vytvoř první lekci. Jakmile ji Syllonaut dokončí, uloží se sem automaticky.</p>
          <Link href="/new" className="primary button-link">Vytvořit první lekci</Link>
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

      <section className="lessons-heading" style={{ marginTop: 44 }}>
        <div>
          <span className="eyebrow">Výsledky misí</span>
          <h2 style={{ fontSize: 30, margin: '5px 0 8px', letterSpacing: '-.035em' }}>Poslední výsledky</h2>
          <p>Ukončené hodiny zůstávají dostupné i později. Otevřením se vrátíš k celému reportu a CSV exportu.</p>
        </div>
      </section>

      {sessionsError ? <div className="error">Historii výsledků se nepodařilo načíst. Zkus stránku obnovit.</div> : null}

      {!sessionsError && recentResults.length === 0 ? (
        <section className="lessons-empty panel">
          <span className="eyebrow">Zatím bez výsledků</span>
          <h2>První report vznikne po ukončení hodiny</h2>
          <p>Jakmile ukončíš živou session, její výsledky se objeví tady.</p>
        </section>
      ) : null}

      {!sessionsError && recentResults.length ? (
        <section className="lesson-grid">
          {recentResults.map(({ id, lessonId, joinCode, title, subtitle, startedAt, endedAt }) => (
            <article className="lesson-card" key={id}>
              <div className="lesson-card-top">
                <div>
                  <Link href={`/sessions/${id}`} className="lesson-title-link"><h2>{title}</h2></Link>
                  {subtitle ? <p>{subtitle}</p> : null}
                </div>
                <span className="beta">REPORT</span>
              </div>
              <div className="lesson-card-meta">
                <span>Ukončeno {formatUpdatedAt(endedAt)}</span>
                <span>{formatSessionDuration(startedAt, endedAt)}</span>
                <span>Kód {joinCode}</span>
              </div>
              <div className="lesson-card-footer">
                <span>{lessonId ? 'Uložená session této lekce' : 'Historická session'}</span>
                <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                  {lessonId ? <Link href={`/lessons/${lessonId}`} className="auth-link">Lekce</Link> : null}
                  <Link href={`/sessions/${id}`} className="auth-link">Otevřít výsledky</Link>
                </div>
              </div>
            </article>
          ))}
        </section>
      ) : null}
    </main>
  );
}
