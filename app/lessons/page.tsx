import Link from 'next/link';
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import LessonLibrary, { type LessonFolderItem, type LessonListItem } from './LessonLibrary';
import SessionActions from './SessionActions';
import SyllonautMark from '@/components/SyllonautMark';
import LocaleSwitcher from '@/components/LocaleSwitcher';
import SignupCompletedAnalytics from '@/components/SignupCompletedAnalytics';
import PublicHeaderAccountMenu from '@/components/PublicHeaderAccountMenu';
import AiPaymentPauseBanner from '@/components/AiPaymentPauseBanner';
import AiUsagePanel from '@/components/AiUsagePanel';
import type { AiQuotaSnapshot } from '@/lib/ai-quota';
import { APP_VERSION } from '@/lib/version';
import { LOCALE_REQUEST_HEADER, normalizeUiLocale } from '@/lib/i18n';
import { getLessonFolderEntitlement } from '@/lib/lesson-folders';
import { LessonFolderReadError, readLessonFolders } from '@/lib/lesson-folder-reader';
import { LessonListReadError, readLessonList, type LessonCatalogRow } from '@/lib/lesson-list-reader';
import { readSessionHistory, SessionHistoryReadError, type SessionHistoryRow } from '@/lib/session-history-reader';
import {
  LessonReuseReadError,
  readLessonLiveUsage,
  readLessonReuseEntitlement,
} from '@/lib/lesson-reuse-reader';
import { LessonSchema } from '@/lib/schema';
import { createClient } from '@/lib/supabase/server';
import { getOrganizationOriginAccessMap } from '@/lib/organization-origin-access';
import { getEffectiveAiBillingPauseState } from '@/lib/individual-ai-billing';
import { requireCurrentTermsForPage } from '@/lib/terms-page-gate';

export const dynamic = 'force-dynamic';

type Props = { searchParams?: Promise<{ signup?: string | string[] }> };

function formatUpdatedAt(value: string, locale: 'cs' | 'en') {
  return new Intl.DateTimeFormat(locale === 'en' ? 'en-GB' : 'cs-CZ', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'Europe/Prague',
  }).format(new Date(value));
}

function formatSessionDuration(startedAt: string | null, endedAt: string, locale: 'cs' | 'en') {
  if (!startedAt) return locale === 'en' ? 'Duration unknown' : 'Délka neznámá';
  const start = Date.parse(startedAt);
  const end = Date.parse(endedAt);
  if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) return locale === 'en' ? 'Duration unknown' : 'Délka neznámá';
  const minutes = Math.max(1, Math.round((end - start) / 60000));
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest ? `${hours} h ${rest} min` : `${hours} h`;
}

export default async function LessonsPage({ searchParams }: Props) {
  const requestHeaders = await headers();
  const locale = normalizeUiLocale(requestHeaders.get(LOCALE_REQUEST_HEADER)) ?? 'cs';
  const english = locale === 'en';
  const ui = (cs: string, en: string) => english ? en : cs;
  const params = await searchParams;
  const signupCompleted = params?.signup === 'completed';
  const supabase = await createClient();
  const { data: claimsData } = await supabase.auth.getClaims();
  const userId = typeof claimsData?.claims?.sub === 'string' ? claimsData.claims.sub : null;
  if (!userId) redirect(`/${locale}`);
  await requireCurrentTermsForPage(userId, '/lessons');

  const defaultAiBillingState: Awaited<ReturnType<typeof getEffectiveAiBillingPauseState>> = {
    reason: null,
    scope: null,
    organizationId: null,
    manager: false,
  };

  const lessonPromise = readLessonList(supabase, userId)
    .then((data) => ({ data, error: null as LessonListReadError | null }))
    .catch((lessonError: unknown) => ({
      data: [] as LessonCatalogRow[],
      error: lessonError instanceof LessonListReadError
        ? lessonError
        : new LessonListReadError('LESSON_LIST_QUERY_FAILED', lessonError),
    }));

  // Same RPC as /subscription. A failure (sporadic P0001) only hides the panel.
  const quotaPromise = Promise.resolve(supabase.rpc('get_ai_quota'))
    .then(({ data, error: quotaError }) => {
      if (quotaError) {
        console.error('load lessons AI usage failed', { code: quotaError.code });
        return null;
      }
      return ((Array.isArray(data) ? data[0] : data) as AiQuotaSnapshot | undefined) ?? null;
    })
    .catch(() => null);

  // These calls are independent. Running them concurrently bounds the page's
  // critical path to the slowest backend request instead of their total time.
  const [entitlement, reusableLessons, aiBillingState, lessonResult, sessionResult] = await Promise.all([
    getLessonFolderEntitlement(supabase, userId),
    readLessonReuseEntitlement(supabase, userId).catch((reuseError) => {
      console.error(
        'load lesson reuse entitlement failed',
        reuseError instanceof LessonReuseReadError ? reuseError.code : 'LESSON_REUSE_ENTITLEMENT_QUERY_FAILED',
      );
      return false;
    }),
    getEffectiveAiBillingPauseState(userId).catch((billingError) => {
      console.error('load AI billing pause state failed', billingError);
      return defaultAiBillingState;
    }),
    lessonPromise,
    readSessionHistory(supabase, userId)
      .then((data) => ({ data, error: null as SessionHistoryReadError | null }))
      .catch((sessionError: unknown) => ({
        data: [] as SessionHistoryRow[],
        error: sessionError instanceof SessionHistoryReadError
          ? sessionError
          : new SessionHistoryReadError('SESSION_HISTORY_QUERY_FAILED', sessionError),
      })),
  ]);

  const { data: rows, error } = lessonResult;
  const { data: sessionRows, error: sessionsError } = sessionResult;
  const originIds = (rows ?? [])
    .map((row) => typeof row.organization_origin_id === 'string' ? row.organization_origin_id : null)
    .filter((value): value is string => Boolean(value));

  let foldersError = false;
  const folderPromise = entitlement.enabled
    ? readLessonFolders(supabase, userId).catch((folderError) => {
      foldersError = true;
      console.error(
        'load lesson folders failed',
        folderError instanceof LessonFolderReadError ? folderError.code : 'LESSON_FOLDER_QUERY_FAILED',
      );
      return [];
    })
    : Promise.resolve([]);
  const usagePromise = reusableLessons
    ? Promise.resolve([])
    : readLessonLiveUsage(supabase, userId).catch((usageError) => {
      console.error(
        'load lesson live usage failed',
        usageError instanceof LessonReuseReadError ? usageError.code : 'LESSON_LIVE_USAGE_QUERY_FAILED',
      );
      return [];
    });

  const [folderRows, usageRows, originAccess, aiQuota] = await Promise.all([
    folderPromise,
    usagePromise,
    getOrganizationOriginAccessMap(userId, originIds),
    quotaPromise,
  ]);

  if (error) console.error('load lessons failed', error.code);
  if (sessionsError) console.error('load ended sessions failed', sessionsError.code);

  const usedLessonIds = new Set<string>();
  for (const usage of usageRows) {
    usedLessonIds.add(usage.lesson_id);
  }

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
      archived: !reusableLessons && usedLessonIds.has(row.id as string),
      licenseLocked: typeof row.organization_origin_id === 'string'
        ? Boolean(originAccess.get(row.organization_origin_id)?.locked)
        : false,
      organizationName: typeof row.organization_origin_id === 'string'
        ? originAccess.get(row.organization_origin_id)?.organizationName ?? null
        : null,
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
      {signupCompleted ? <SignupCompletedAnalytics /> : null}
      <header className="brand lessons-brand">
        <div className="brand-identity"><Link href={`/${locale}`} className="brand-home"><SyllonautMark /><strong>Syllonaut</strong></Link><span className="dashboard-version-stack"><span className="beta">BETA</span><span className="dashboard-version">v{APP_VERSION}</span></span></div>
        <nav className="main-nav" aria-label={ui('Hlavní navigace', 'Main navigation')}>
          <Link href={`/${locale}#jak-to-funguje`}>{ui('Jak to funguje', 'How it works')}</Link>
          <Link href={`/${locale}/pricing`}>{ui('Ceník', 'Pricing')}</Link>
          <Link href="/lessons" className="active">{ui('Moje lekce', 'My lessons')}</Link>
        </nav>
        <div className="lessons-user">
          <LocaleSwitcher />
          <PublicHeaderAccountMenu
            user={{
              id: userId,
              email: typeof claimsData?.claims?.email === 'string' ? claimsData.claims.email : undefined,
              user_metadata: claimsData?.claims?.user_metadata && typeof claimsData.claims.user_metadata === 'object' ? claimsData.claims.user_metadata as Record<string, unknown> : {},
            }}
          />
          <Link href="/new" className="primary button-link app-header-cta">{ui('Nová lekce', 'New lesson')}</Link>
        </div>
      </header>

      {aiBillingState.reason ? (
        <AiPaymentPauseBanner
          reason={aiBillingState.reason}
          scope={aiBillingState.scope}
          manager={aiBillingState.manager}
        />
      ) : null}

      <section className="lessons-heading">
        <div>
          <span className="eyebrow">{ui('Palubní deník', 'Logbook')}</span>
          <h1>{ui('Moje lekce', 'My lessons')}</h1>
          <p>{entitlement.enabled ? ui('Uspořádej lekce podle škol, tříd nebo předmětů.', 'Organize lessons by school, class or subject.') : ui('Všechny připravené lekce se sem ukládají automaticky.', 'All prepared lessons are saved here automatically.')}</p>
        </div>

      </section>

      <AiUsagePanel quota={aiQuota} english={english} />

      {error ? <div className="error">{ui('Lekce se nepodařilo načíst. Zkus stránku obnovit.', 'Lessons could not be loaded. Refresh the page and try again.')}</div> : null}
      {foldersError ? <div className="error">{ui('Složky se nepodařilo načíst. Lekce zůstávají bezpečně uložené.', 'Folders could not be loaded. Your lessons remain safely stored.')}</div> : null}

      {!error && lessons.length === 0 && !canManageFolders ? (
        <section className="lessons-empty panel">
          <span className="eyebrow">{ui('Začátek trasy', 'Start of the route')}</span>
          <h2>{ui('Zatím tu nic není', 'Nothing here yet')}</h2>
          <p>{ui('Vytvoř první lekci. Jakmile ji Syllonaut dokončí, uloží se sem automaticky.', 'Create your first lesson. Syllonaut will save it here automatically when generation is complete.')}</p>
          <Link href="/new" className="primary button-link">{ui('Vytvořit první lekci', 'Create your first lesson')}</Link>
        </section>
      ) : null}

      {!error && (lessons.length > 0 || canManageFolders) ? (
        <LessonLibrary lessons={lessons} folders={folders} canManageFolders={canManageFolders} reusableLessons={reusableLessons} userId={userId} />
      ) : null}

      <section className="lessons-heading" style={{ marginTop: 44 }}>
        <div>
          <span className="eyebrow">{ui('Výsledky misí', 'Mission results')}</span>
          <h2 style={{ fontSize: 30, margin: '5px 0 8px', letterSpacing: '-.035em' }}>{ui('Výsledky hodin', 'Lesson results')}</h2>
          <p>{ui('Ukončené hodiny zůstávají dostupné nejdéle 12 měsíců. Report můžeš kdykoli smazat ručně; tím se nenávratně smažou i související studentská data.', 'Completed lesson reports remain available for up to 12 months. You can delete a report manually at any time; related student data will be permanently deleted as well.')}</p>
        </div>
      </section>

      {sessionsError ? <div className="error">{ui('Historii výsledků se nepodařilo načíst. Zkus stránku obnovit.', 'Result history could not be loaded. Refresh the page and try again.')}</div> : null}

      {!sessionsError && recentResults.length === 0 ? (
        <section className="lessons-empty panel">
          <span className="eyebrow">{ui('Zatím bez výsledků', 'No results yet')}</span>
          <h2>{ui('První report vznikne po ukončení hodiny', 'Your first report appears after a lesson ends')}</h2>
          <p>{ui('Jakmile ukončíš živou hodinu, její výsledky se objeví tady.', 'When you end a live lesson, its results will appear here.')}</p>
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
                <span>{ui('Ukončeno', 'Ended')} {formatUpdatedAt(endedAt, locale)}</span>
                <span>{formatSessionDuration(startedAt, endedAt, locale)}</span>
                <span>{ui('Kód', 'Code')} {joinCode}</span>
              </div>
              <div className="lesson-card-footer">
                <span>{lessonId ? ui('Hodina z této lekce', 'Live run of this lesson') : ui('Starší hodina', 'Earlier live lesson')}</span>
                <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                  {lessonId ? <Link href={`/lessons/${lessonId}`} className="auth-link">{ui('Lekce', 'Lesson')}</Link> : null}
                  <Link href={`/sessions/${id}`} className="auth-link">{ui('Otevřít výsledky', 'Open results')}</Link>
                </div>
              </div>
            </article>
          ))}
        </section>
      ) : null}
    </main>
  );
}
