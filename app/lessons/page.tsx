import Link from 'next/link';
import { redirect } from 'next/navigation';
import LessonLibrary, { type LessonFolderItem, type LessonListItem } from './LessonLibrary';
import SessionActions from './SessionActions';
import SyllonautMark from '@/components/SyllonautMark';
import SignupCompletedAnalytics from '@/components/SignupCompletedAnalytics';
import { getLessonFolderEntitlement } from '@/lib/lesson-folders';
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

type Props = { searchParams: Promise<{ signup?: string | string[] }> };

export default async function LessonsPage({ searchParams }: Props) {
  const params = await searchParams;
  const signup = Array.isArray(params.signup) ? params.signup[0] : params.signup;
  const supabase = await createClient();
  const { data: claimsData } = await supabase.auth.getClaims();
  const userId = typeof claimsData?.claims?.sub === 'string' ? claimsData.claims.sub : null;
  if (!userId) redirect('/');

  const entitlement = await getLessonFolderEntitlement(supabase, userId);

  const { data: rows, error } = await supabase
    .from('lessons')
    .select('id, title, lesson, folder_id, created_at, updated_at')
    .eq('owner_id', userId)
    .order('updated_at', { ascending: false });

  let folderRows: { id: string; name: string; parent_id: string | null }[] = [];
  let foldersError: unknown = null;
  if (entitlement.enabled) {
    const folderResult = await supabase
      .from('lesson_folders')
      .select('id, name, parent_id')
      .eq('owner_id', userId)
      .order('name', { ascending: true });
    folderRows = (folderResult.data ?? []) as { id: string; name: string; parent_id: string | null }[];
    foldersError = folderResult.error;
  }

  const { data: sessionRows, error: sessionsError } = await supabase
    .from('sessions')
    .select('id, lesson_id, join_code, lesson_snapshot, started_at, ended_at')
    .eq('teacher_id', userId)
    .eq('status', 'ended')
    .not('ended_at', 'is', null)
    .order('ended_at', { ascending: false });

  if (error) console.error('load lessons failed', error);
  if (foldersError) console.error('load lesson folders failed', foldersError);
  if (sessionsError) console.error('load ended sessions failed', sessionsError);

  const lessons: LessonListItem[] = (rows ?? []).flatMap((row) => {
    const parsed = LessonSchema.safeParse(row.lesson);
    if (!parsed.success) return [];
    return [{
      id: row.id as string,
      title: row.title as string,
      subtitle: parsed.data.subtitle ?? null,
      audience: parsed.data.audience,
      totalMinutes: parsed.data.totalMinutes,
      blockCount: parsed.data.blocks.length,
      updatedAt: row.updated_at as string,
      folderId: typeof row.folder_id === 'string' ? row.folder_id : null,
    }];
  });

  const folders: LessonFolderItem[] = folderRows.map((row) => ({
    id: row.id,
    name: row.name,
    parentId: row.parent_id,
  }));

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

  const canManageFolders = entitlement.enabled && !foldersError;

  return (
    <main className="shell lessons-shell">
      {signup === 'completed' ? <SignupCompletedAnalytics /> : null}
      <header className="brand lessons-brand">
        <div className="brand-identity"><Link href="/" className="brand-home"><SyllonautMark /><strong>Syllonaut</strong></Link><span className="beta">BETA</span></div>
        <nav className="main-nav"><Link href="/new">Nová lekce</Link><Link href="/lessons" className="active">Moje lekce</Link></nav>
        <div className="lessons-user">{typeof claimsData?.claims?.email === 'string' ? claimsData.claims.email : 'Přihlášený učitel'}</div>
      </header>

      <section className="lessons-heading">
        <div>
          <span className="eyebrow">Palubní deník</span>
          <h1>Moje lekce</h1>
          <p>{entitlement.enabled ? 'Uspořádej lekce podle škol, tříd nebo předmětů.' : 'Všechny připravené lekce se sem ukládají automaticky.'}</p>
        </div>
        <Link href="/new" className="primary button-link">+ Nová lekce</Link>
      </section>

      {error ? <div className="error">Lekce se nepodařilo načíst. Zkus stránku obnovit.</div> : null}
      {foldersError ? <div className="error">Složky se nepodařilo načíst. Lekce zůstávají bezpečně uložené.</div> : null}

      {!error && lessons.length === 0 && !canManageFolders ? (
        <section className="lessons-empty panel">
          <span className="eyebrow">Začátek trasy</span>
          <h2>Zatím tu nic není</h2>
          <p>Vytvoř první lekci. Jakmile ji Syllonaut dokončí, uloží se sem automaticky.</p>
          <Link href="/new" className="primary button-link">Vytvořit první lekci</Link>
        </section>
      ) : null}

      {!error && (lessons.length > 0 || canManageFolders) ? (
        <LessonLibrary lessons={lessons} folders={folders} canManageFolders={canManageFolders} />
      ) : null}

      <section className="lessons-heading" style={{ marginTop: 44 }}>
        <div>
          <span className="eyebrow">Výsledky misí</span>
          <h2 style={{ fontSize: 30, margin: '5px 0 8px', letterSpacing: '-.035em' }}>Výsledky hodin</h2>
          <p>Ukončené hodiny zůstávají dostupné nejdéle 12 měsíců. Report můžeš kdykoli smazat ručně; tím se nenávratně smažou i související studentská data.</p>
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
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span className="beta">REPORT</span>
                  <SessionActions sessionId={id} title={title} />
                </div>
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
