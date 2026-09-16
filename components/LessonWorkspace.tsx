'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { FormEvent, useEffect, useMemo, useState } from 'react';
import type { User } from '@supabase/supabase-js';
import AuthControls from '@/components/AuthControls';
import LessonPreview from '@/components/LessonPreview';
import { demoLesson } from '@/lib/demo';
import { LessonSchema, type Lesson } from '@/lib/schema';

const LAST_LESSON_KEY = 'syllonaut_last_lesson_v1';
const LEGACY_LAST_LESSON_KEY = 'edupilot_last_lesson_v1';

type LessonApiResponse = {
  lesson?: Lesson;
  lessonId?: string | null;
  error?: string;
};

type RecoverySnapshot = {
  ownerId: string;
  lessonId: string;
  lesson: Lesson;
};

type SaveStatus = 'idle' | 'saving' | 'saved';

type Props = {
  initialLesson?: Lesson | null;
  initialLessonId?: string | null;
  initialPrompt?: string | null;
};

export default function LessonWorkspace({ initialLesson = null, initialLessonId = null, initialPrompt = null }: Props) {
  const router = useRouter();
  const [prompt, setPrompt] = useState(initialPrompt ?? '');
  const [audience, setAudience] = useState(initialLesson?.audience ?? '1. ročník vysoké školy');
  const [duration, setDuration] = useState(initialLesson?.totalMinutes ?? 90);
  const [groupSize, setGroupSize] = useState(initialLesson?.groupSize ?? '3–4 studenti');
  const [tone, setTone] = useState('živý, praktický a lehce vtipný');
  const [lesson, setLesson] = useState<Lesson | null>(initialLesson);
  const [lessonId, setLessonId] = useState<string | null>(initialLessonId);
  const [undoLesson, setUndoLesson] = useState<Lesson | null>(null);
  const [revision, setRevision] = useState('');
  const [blockRevision, setBlockRevision] = useState('');
  const [selectedBlockId, setSelectedBlockId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [view, setView] = useState<'teacher' | 'student'>('teacher');
  const [authUser, setAuthUser] = useState<User | null>(null);
  const [saveStatus, setSaveStatus] = useState<SaveStatus>(initialLessonId ? 'saved' : 'idle');
  const [quotaRefreshKey, setQuotaRefreshKey] = useState(0);
  const [recovery, setRecovery] = useState<RecoverySnapshot | null>(null);

  const selectedBlock = useMemo(() => lesson?.blocks.find((b) => b.id === selectedBlockId) ?? null, [lesson, selectedBlockId]);

  useEffect(() => {
    if (!authUser) {
      setRecovery(null);
      return;
    }

    try {
      const currentRaw = window.localStorage.getItem(LAST_LESSON_KEY);
      const legacyRaw = currentRaw ? null : window.localStorage.getItem(LEGACY_LAST_LESSON_KEY);
      const raw = currentRaw ?? legacyRaw;
      if (!raw) return;
      const parsed = JSON.parse(raw) as Partial<RecoverySnapshot>;
      if (parsed.ownerId !== authUser.id || typeof parsed.lessonId !== 'string') return;
      const parsedLesson = LessonSchema.safeParse(parsed.lesson);
      if (!parsedLesson.success) return;
      const snapshot = { ownerId: authUser.id, lessonId: parsed.lessonId, lesson: parsedLesson.data };
      setRecovery(snapshot);
      if (!currentRaw && legacyRaw) {
        window.localStorage.setItem(LAST_LESSON_KEY, JSON.stringify(snapshot));
        window.localStorage.removeItem(LEGACY_LAST_LESSON_KEY);
      }
    } catch {
      window.localStorage.removeItem(LAST_LESSON_KEY);
      window.localStorage.removeItem(LEGACY_LAST_LESSON_KEY);
    }
  }, [authUser]);

  useEffect(() => {
    if (!authUser || !initialLesson || !initialLessonId) return;
    const snapshot: RecoverySnapshot = { ownerId: authUser.id, lessonId: initialLessonId, lesson: initialLesson };
    window.localStorage.setItem(LAST_LESSON_KEY, JSON.stringify(snapshot));
    setRecovery(snapshot);
  }, [authUser, initialLesson, initialLessonId]);

  useEffect(() => {
    if (saveStatus !== 'saving') return;
    const warn = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [saveStatus]);

  function requireAuth() {
    if (authUser) return true;
    setError('Pro AI funkce se nejdřív přihlas vpravo nahoře. Ukázková lekce funguje i bez účtu.');
    return false;
  }

  function rememberSavedLesson(nextLesson: Lesson, nextLessonId: string) {
    if (!authUser) return;
    const snapshot: RecoverySnapshot = { ownerId: authUser.id, lessonId: nextLessonId, lesson: nextLesson };
    window.localStorage.setItem(LAST_LESSON_KEY, JSON.stringify(snapshot));
    setRecovery(snapshot);
  }

  function applyLessonResponse(data: LessonApiResponse) {
    if (!data.lesson) throw new Error(data.error || 'Server nevrátil lekci.');
    const parsed = LessonSchema.parse(data.lesson);
    setLesson(parsed);
    setLessonId(data.lessonId ?? null);
    setSelectedBlockId(null);

    if (data.lessonId) {
      setSaveStatus('saved');
      rememberSavedLesson(parsed, data.lessonId);
    } else {
      setSaveStatus('idle');
    }
  }

  async function generate(e: FormEvent) {
    e.preventDefault();
    if (!requireAuth()) return;
    setBusy(true);
    setError('');
    setUndoLesson(null);
    setSelectedBlockId(null);
    try {
      const res = await fetch('/api/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt, audience, duration, groupSize, tone }),
      });
      const data = await res.json() as LessonApiResponse;
      if (!res.ok) throw new Error(data.error || 'Generování selhalo.');
      applyLessonResponse(data);
      setQuotaRefreshKey((value) => value + 1);
      if (data.lessonId) router.replace(`/lessons/${data.lessonId}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Generování selhalo.');
    } finally {
      setBusy(false);
    }
  }

  async function revise(e: FormEvent) {
    e.preventDefault();
    if (!lesson || !requireAuth()) return;
    const before = lesson;
    setBusy(true);
    setError('');
    if (lessonId) setSaveStatus('saving');
    try {
      const res = await fetch('/api/revise', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ instruction: revision, lesson, lessonId }),
      });
      const data = await res.json() as LessonApiResponse;
      if (!res.ok) throw new Error(data.error || 'Úprava selhala.');
      applyLessonResponse(data);
      setUndoLesson(data.lessonId ? before : null);
      setRevision('');
      setQuotaRefreshKey((value) => value + 1);
    } catch (err) {
      if (lessonId) setSaveStatus('saved');
      setError(err instanceof Error ? err.message : 'Úprava selhala.');
    } finally {
      setBusy(false);
    }
  }

  async function reviseSelectedBlock(e: FormEvent) {
    e.preventDefault();
    if (!lesson || !selectedBlock || !requireAuth()) return;
    const before = lesson;
    setBusy(true);
    setError('');
    if (lessonId) setSaveStatus('saving');
    try {
      const res = await fetch('/api/revise-block', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ instruction: blockRevision, lesson, lessonId, blockId: selectedBlock.id }),
      });
      const data = await res.json() as LessonApiResponse;
      if (!res.ok) throw new Error(data.error || 'Úprava aktivity selhala.');
      applyLessonResponse(data);
      setUndoLesson(data.lessonId ? before : null);
      setBlockRevision('');
      setQuotaRefreshKey((value) => value + 1);
    } catch (err) {
      if (lessonId) setSaveStatus('saved');
      setError(err instanceof Error ? err.message : 'Úprava aktivity selhala.');
    } finally {
      setBusy(false);
    }
  }

  async function undoLastChange() {
    if (!lessonId || !undoLesson || busy) return;
    setBusy(true);
    setError('');
    setSaveStatus('saving');
    try {
      const res = await fetch(`/api/lessons/${lessonId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ lesson: undoLesson }),
      });
      const data = await res.json() as LessonApiResponse;
      if (!res.ok) throw new Error(data.error || 'Předchozí verzi se nepodařilo obnovit.');
      applyLessonResponse(data);
      setUndoLesson(null);
    } catch (err) {
      setSaveStatus('saved');
      setError(err instanceof Error ? err.message : 'Předchozí verzi se nepodařilo obnovit.');
    } finally {
      setBusy(false);
    }
  }

  function loadDemo() {
    setLesson(demoLesson);
    setLessonId(null);
    setUndoLesson(null);
    setSaveStatus('idle');
    setSelectedBlockId(null);
    setError('');
  }

  function restoreLastLesson() {
    if (!recovery) return;
    router.push(`/lessons/${recovery.lessonId}`);
  }

  const saveText = lessonId
    ? saveStatus === 'saving' ? 'Ukládám změny…' : '✓ Uloženo'
    : lesson ? 'Ukázka · neukládá se' : '';

  return (
    <main className="shell">
      <header className="brand">
        <div className="brand-identity"><Link href="/" className="brand-home"><span className="brand-mark">S</span><strong>Syllonaut</strong></Link><span className="beta">BETA</span></div>
        <nav className="main-nav"><Link href="/">Nová lekce</Link><Link href="/lessons">Moje lekce</Link></nav>
        <div className="brand-side"><p className="brand-tagline">AI navigátor pro interaktivní výuku.</p><AuthControls onAuthChange={setAuthUser} quotaRefreshKey={quotaRefreshKey} /></div>
      </header>

      {authUser && recovery && (!lessonId || recovery.lessonId !== lessonId) ? (
        <div className="recovery-banner">
          <span>Poslední uložená lekce: <strong>{recovery.lesson.title}</strong></span>
          <button type="button" className="secondary" onClick={restoreLastLesson}>Pokračovat</button>
        </div>
      ) : null}

      <div className="workspace">
        <section className="builder">
          {lessonId && lesson ? (
            <div className="panel current-lesson-panel">
              <span className="eyebrow">Uložená lekce</span>
              <h1>{lesson.title}</h1>
              <p className="muted-copy">Pokračuj AI úpravami níže. Každá úspěšná změna se ukládá automaticky.</p>
              <div className="actions"><Link href="/lessons" className="secondary button-link">← Moje lekce</Link><Link href="/" className="primary button-link">+ Nová lekce</Link></div>
            </div>
          ) : (
            <div className="panel">
              <span className="eyebrow">Připrav výukovou misi</span>
              <h1>Co mají studenti dnes zažít?</h1>
              <form onSubmit={generate}>
                <label>Volný popis hodiny<textarea value={prompt} onChange={(e) => setPrompt(e.target.value)} placeholder="Např. Chci 180 minut mediální gramotnosti pro prváky digitálního marketingu. Týmy po 3–4, hodně humoru, minimum výkladu…" required /></label>
                <div className="form-grid">
                  <label>Cílovka<input value={audience} onChange={(e) => setAudience(e.target.value)} /></label>
                  <label>Délka v minutách<input type="number" min="10" max="360" value={duration} onChange={(e) => setDuration(Number(e.target.value))} /></label>
                  <label>Velikost týmu<input value={groupSize} onChange={(e) => setGroupSize(e.target.value)} /></label>
                  <label>Tón<input value={tone} onChange={(e) => setTone(e.target.value)} /></label>
                </div>
                <div className="actions"><button className="primary" disabled={busy}>{busy ? 'AI připravuje kurz…' : 'Připravit lekci'}</button><button type="button" className="secondary" onClick={loadDemo}>Ukázková mise</button></div>
                {!authUser ? <p className="auth-hint">AI generování vyžaduje bezplatný účet. Ukázková mise je dostupná bez přihlášení.</p> : null}
              </form>
            </div>
          )}

          {lesson ? <>
            <div className="panel vibe-editor"><span className="eyebrow">AI úprava celé lekce</span><h2>Uprav kurz mise</h2><form onSubmit={revise}><textarea value={revision} onChange={(e) => setRevision(e.target.value)} placeholder="Udělej druhé cvičení absurdnější. Zkrať úvod. Přidej soutěž mezi týmy…" required /><button className="primary" disabled={busy}>{busy ? 'Upravuji…' : 'Upravit celou lekci'}</button></form><div className="quick-edits"><button type="button" onClick={() => setRevision('Udělej lekci zábavnější, ale ne infantilní.')}>Vtipnější</button><button type="button" onClick={() => setRevision('Přidej více týmové soutěže a jasné bodování.')}>Více soutěže</button><button type="button" onClick={() => setRevision('Omez výklad a přidej více práce studentů.')}>Méně výkladu</button></div></div>
            <div className="panel block-editor"><span className="eyebrow">AI úprava jedné aktivity</span><h2>{selectedBlock ? selectedBlock.title : 'Klikni na aktivitu v náhledu'}</h2>{selectedBlock ? <form onSubmit={reviseSelectedBlock}><textarea value={blockRevision} onChange={(e) => setBlockRevision(e.target.value)} placeholder="Např. Udělej to o polovinu kratší, přidej černější humor a jasnější výstup týmu." required /><button className="primary" disabled={busy}>{busy ? 'Upravuji…' : 'Upravit jen tuto aktivitu'}</button></form> : <p className="muted-copy">Vybraný blok se upraví bez přegenerování zbytku hodiny.</p>}</div>
          </> : null}
          {error ? <div className="error">{error}</div> : null}
        </section>

        <section className="stage">
          {lesson ? <><div className="stage-toolbar"><div><button type="button" className={view === 'teacher' ? 'secondary active' : 'secondary'} onClick={() => setView('teacher')}>Učitelský náhled</button><button type="button" className={view === 'student' ? 'secondary active' : 'secondary'} onClick={() => setView('student')}>Studentský režim</button></div><div className="stage-meta"><span>{lesson.totalMinutes} min</span>{undoLesson && lessonId ? <button type="button" className="undo-action" onClick={undoLastChange} disabled={busy}>↶ Vrátit poslední AI změnu</button> : null}{saveText ? <span className={saveStatus === 'saving' ? 'save-status saving' : 'save-status'}>{saveText}</span> : null}</div></div><LessonPreview lesson={lesson} mode={view} selectedBlockId={selectedBlockId} onSelectBlock={setSelectedBlockId} /></> : <div className="empty"><div className="empty-icon">✦</div><h2>Tady vznikne vaše další mise</h2><p>Ne slajdy. Interaktivní scénář, který studenti skutečně používají.</p><div className="sample-prompts"><span>týmové mise</span><span>hlasování</span><span>kvízy</span><span>odhalování stop</span><span>exit ticket</span></div></div>}
        </section>
      </div>
    </main>
  );
}
