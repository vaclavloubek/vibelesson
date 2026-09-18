'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { FormEvent, useEffect, useMemo, useState } from 'react';
import type { User } from '@supabase/supabase-js';
import AuthControls from '@/components/AuthControls';
import GenerationProgress, { type GenerationStage } from '@/components/GenerationProgress';
import GradingStrictnessControl from '@/components/GradingStrictnessControl';
import LessonPreview from '@/components/LessonPreview';
import SyllonautMark from '@/components/SyllonautMark';
import { demoLesson } from '@/lib/demo';
import { extractMaterialsInBrowser } from '@/lib/materials-client';
import { MATERIAL_MAX_FILES, MATERIAL_MAX_TOTAL_BYTES } from '@/lib/materials';
import { LessonSchema, type GradingStrictness, type Lesson } from '@/lib/schema';

const LAST_LESSON_KEY = 'syllonaut_last_lesson_v1';
const LEGACY_LAST_LESSON_KEY = 'edupilot_last_lesson_v1';

type LessonApiResponse = {
  lesson?: Lesson;
  lessonId?: string | null;
  error?: string;
};

type GenerationStreamEvent =
  | { type: 'progress'; stage: Exclude<GenerationStage, 'requesting'> }
  | { type: 'result'; lesson: Lesson; lessonId: string }
  | { type: 'error'; error: string };

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
  initialFolderId?: string | null;
};

export default function LessonWorkspace({ initialLesson = null, initialLessonId = null, initialPrompt = null, initialFolderId = null }: Props) {
  const router = useRouter();
  const [prompt, setPrompt] = useState(initialPrompt ?? '');
  const [audience, setAudience] = useState(initialLesson?.audience ?? '');
  const [duration, setDuration] = useState(initialLesson ? String(initialLesson.totalMinutes) : '');
  const [groupSize, setGroupSize] = useState(initialLesson?.groupSize ?? '');
  const [tone, setTone] = useState('');
  const [gradingStrictness, setGradingStrictness] = useState<GradingStrictness>(initialLesson?.gradingStrictness ?? 'neutral');
  const [aiGradingEnabled, setAiGradingEnabled] = useState(false);
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
  const [generationStage, setGenerationStage] = useState<GenerationStage | null>(null);
  const [generationStartedAt, setGenerationStartedAt] = useState<number | null>(null);

  const selectedBlock = useMemo(() => lesson?.blocks.find((b) => b.id === selectedBlockId) ?? null, [lesson, selectedBlockId]);

  useEffect(() => {
    let cancelled = false;
    if (!authUser) {
      setAiGradingEnabled(false);
      return;
    }

    void fetch('/api/entitlements', { cache: 'no-store' })
      .then(async (response) => {
        const data = await response.json() as { aiGradingEnabled?: boolean };
        if (!cancelled) setAiGradingEnabled(response.ok && Boolean(data.aiGradingEnabled));
      })
      .catch(() => {
        if (!cancelled) setAiGradingEnabled(false);
      });

    return () => { cancelled = true; };
  }, [authUser]);

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
    setGradingStrictness(parsed.gradingStrictness ?? 'neutral');
    setLessonId(data.lessonId ?? null);
    setSelectedBlockId(null);

    if (data.lessonId) {
      setSaveStatus('saved');
      rememberSavedLesson(parsed, data.lessonId);
    } else {
      setSaveStatus('idle');
    }
  }

  async function generate(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!requireAuth()) return;

    const formData = new FormData(e.currentTarget);
    const files = formData.getAll('materials').filter((value): value is File => value instanceof File && value.size > 0);
    const materialMode = String(formData.get('materialMode') ?? 'primary');

    if (!prompt.trim() && files.length === 0) {
      setError('Popiš hodinu nebo nahraj alespoň jeden podklad.');
      return;
    }
    if (files.length > MATERIAL_MAX_FILES) {
      setError(`Nahraj nejvýše ${MATERIAL_MAX_FILES} souborů.`);
      return;
    }
    if (files.reduce((sum, file) => sum + file.size, 0) > MATERIAL_MAX_TOTAL_BYTES) {
      setError('Podklady mohou mít dohromady nejvýše 10 MB.');
      return;
    }

    setBusy(true);
    setError('');
    setUndoLesson(null);
    setSelectedBlockId(null);
    setGenerationStartedAt(Date.now());
    setGenerationStage('requesting');

    try {
      const materials = await extractMaterialsInBrowser(files);
      const res = await fetch('/api/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt, audience, duration: Number(duration), groupSize, tone, gradingStrictness, materialMode, materials, folderId: initialFolderId }),
      });

      const contentType = res.headers.get('content-type') ?? '';
      if (!res.ok || !contentType.includes('application/x-ndjson')) {
        const data = await res.json() as LessonApiResponse;
        if (!res.ok) throw new Error(data.error || 'Generování selhalo.');
        applyLessonResponse(data);
        setQuotaRefreshKey((value) => value + 1);
        if (data.lessonId) router.replace(`/lessons/${data.lessonId}`);
        return;
      }

      if (!res.body) throw new Error('Server nevrátil průběh generování.');

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let resultLesson: Lesson | null = null;
      let resultLessonId: string | null = null;

      const handleLine = (line: string) => {
        if (!line.trim()) return;
        const event = JSON.parse(line) as GenerationStreamEvent;
        if (event.type === 'progress') {
          setGenerationStage(event.stage);
          return;
        }
        if (event.type === 'error') throw new Error(event.error);
        if (event.type === 'result') {
          resultLesson = LessonSchema.parse(event.lesson);
          resultLessonId = event.lessonId;
        }
      };

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';
        for (const line of lines) handleLine(line);
      }

      buffer += decoder.decode();
      if (buffer.trim()) handleLine(buffer);
      if (!resultLesson || !resultLessonId) throw new Error('Generování skončilo bez hotové lekce.');

      applyLessonResponse({ lesson: resultLesson, lessonId: resultLessonId });
      setQuotaRefreshKey((value) => value + 1);
      router.replace(`/lessons/${resultLessonId}`);
    } catch (err) {
      const rawMessage = err instanceof Error ? err.message : '';
      const isTransportError = /string did not match|failed to fetch|load failed|network|connection/i.test(rawMessage);
      setError(isTransportError
        ? 'Spojení se během generování přerušilo. Pokud se lekce stihla dokončit, najdeš ji v Moje lekce; jinak to zkus znovu.'
        : rawMessage || 'Generování selhalo.');
    } finally {
      setBusy(false);
      setGenerationStage(null);
      setGenerationStartedAt(null);
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
    setGradingStrictness(demoLesson.gradingStrictness ?? 'neutral');
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

  async function changeGradingStrictness(next: GradingStrictness) {
    setGradingStrictness(next);
    if (!lesson || !lessonId || busy) return;

    const previous = lesson;
    const nextLesson: Lesson = { ...lesson, gradingStrictness: next };
    setLesson(nextLesson);
    setSaveStatus('saving');
    setError('');

    try {
      const response = await fetch(`/api/lessons/${lessonId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ lesson: nextLesson }),
      });
      const data = await response.json() as LessonApiResponse;
      if (!response.ok || !data.lesson) throw new Error(data.error || 'Nastavení hodnocení se nepodařilo uložit.');

      const parsed = LessonSchema.parse(data.lesson);
      setLesson(parsed);
      setGradingStrictness(parsed.gradingStrictness ?? 'neutral');
      setSaveStatus('saved');
      rememberSavedLesson(parsed, lessonId);
    } catch (err) {
      setLesson(previous);
      setGradingStrictness(previous.gradingStrictness ?? 'neutral');
      setSaveStatus('saved');
      setError(err instanceof Error ? err.message : 'Nastavení hodnocení se nepodařilo uložit.');
    }
  }

  const saveText = lessonId
    ? saveStatus === 'saving' ? 'Ukládám změny…' : '✓ Uloženo'
    : lesson ? 'Ukázka · neukládá se' : '';

  return (
    <main className="shell">
      <header className="brand">
        <div className="brand-identity"><Link href="/" className="brand-home"><SyllonautMark /><strong>Syllonaut</strong></Link><span className="beta">BETA</span></div>
        <nav className="main-nav"><Link href="/new">Nová lekce</Link><Link href="/lessons">Moje lekce</Link></nav>
        <div className="brand-side"><p className="brand-tagline">AI navigátor pro interaktivní výuku.</p><AuthControls onAuthChange={setAuthUser} quotaRefreshKey={quotaRefreshKey} /></div>
      </header>

      {authUser && recovery && (!lessonId || recovery.lessonId !== lessonId) ? (
        <div className="recovery-banner">
          <span>Poslední uložená lekce: <strong>{recovery.lesson.title}</strong></span>
          <button type="button" className="secondary" onClick={restoreLastLesson}>Pokračovat</button>
        </div>
      ) : null}

      <div className="workspace">
        <section className="builder" aria-busy={busy}>
          {lessonId && lesson ? (
            <div className="panel current-lesson-panel">
              <span className="eyebrow">Uložená lekce</span>
              <h1>{lesson.title}</h1>
              <p className="muted-copy">Pokračuj AI úpravami níže. Každá úspěšná změna se ukládá automaticky.</p>
              {aiGradingEnabled ? (
                <GradingStrictnessControl
                  value={gradingStrictness}
                  disabled={busy || saveStatus === 'saving'}
                  onChange={(next) => { void changeGradingStrictness(next); }}
                  compact
                />
              ) : null}
              <div className="actions"><Link href="/lessons" className="secondary button-link">← Moje lekce</Link><Link href="/new" className="primary button-link">+ Nová lekce</Link></div>
            </div>
          ) : (
            <div className="panel">
              <span className="eyebrow">Nová lekce</span>
              <h1>Co mají studenti dnes zažít?</h1>
              {initialFolderId ? <p className="auth-hint">Nová lekce se po vytvoření uloží přímo do vybrané složky.</p> : null}
              <form onSubmit={generate}>
                <label>Volný popis hodiny<textarea name="prompt" value={prompt} onChange={(e) => setPrompt(e.target.value)} placeholder="Např. Chci 180 minut mediální gramotnosti pro prváky digitálního marketingu. Týmy po 3–4, hodně humoru, minimum výkladu…" /></label>
                <div className="form-grid">
                  <label>Cílovka<input name="audience" value={audience} onChange={(e) => setAudience(e.target.value)} placeholder="např. 1. ročník vysoké školy" required /></label>
                  <label>Délka v minutách<input name="duration" type="number" min="10" max="360" value={duration} onChange={(e) => setDuration(e.target.value)} placeholder="např. 90" required /></label>
                  <label>Velikost týmu<input name="groupSize" value={groupSize} onChange={(e) => setGroupSize(e.target.value)} placeholder="např. 3–4 studenti" required /></label>
                  <label>Tón<input name="tone" value={tone} onChange={(e) => setTone(e.target.value)} placeholder="např. živý, praktický a lehce vtipný" required /></label>
                </div>
                {aiGradingEnabled ? (
                  <GradingStrictnessControl
                    value={gradingStrictness}
                    onChange={setGradingStrictness}
                  />
                ) : null}
                <details className="materials-disclosure">
                  <summary>
                    <span className="materials-disclosure-label">
                      <strong>Přidat podklady k lekci</strong>
                      <span>volitelné</span>
                    </span>
                    <span className="materials-disclosure-chevron" aria-hidden="true">⌄</span>
                  </summary>
                  <div className="materials-disclosure-body">
                    <label>Prezentace, pracovní listy nebo textové materiály
                      <input name="materials" type="file" multiple accept=".pdf,.pptx,.docx,.txt,.md,application/pdf,text/plain,text/markdown" />
                    </label>
                    <p className="muted-copy" style={{ marginTop: 8 }}>PDF, PPTX, DOCX, TXT nebo MD · nejvýše 5 souborů · dohromady max. 10 MB.</p>
                    <label style={{ marginTop: 12 }}>Jak s podklady pracovat
                      <select name="materialMode" defaultValue="primary" className="materials-mode-select">
                        <option value="primary">Vycházet z podkladů</option>
                        <option value="strict">Držet se podkladů</option>
                        <option value="inspiration">Použít jako inspiraci</option>
                      </select>
                    </label>
                    <p className="muted-copy" style={{ marginTop: 8 }}>Originální soubory zůstávají ve vašem zařízení. Syllonaut v prohlížeči získá jejich text a na server odešle pouze tento text; podklady ani extrahovaný obsah trvale neukládá.</p>
                  </div>
                </details>
                <div className="actions"><button className="primary" disabled={busy}>{busy ? 'Syllonaut připravuje lekci…' : 'Vytvořit lekci'}</button><button type="button" className="secondary" disabled={busy} onClick={loadDemo}>Ukázková lekce</button></div>
                {!authUser ? <p className="auth-hint">AI generování vyžaduje bezplatný účet. Ukázková lekce je dostupná bez přihlášení.</p> : null}
              </form>
            </div>
          )}

          {lesson ? <>
            <div className="panel vibe-editor">
              <span className="eyebrow">AI úprava celé lekce</span>
              <h2>Uprav celou lekci</h2>
              <form onSubmit={revise}>
                <label>
                  Pokyn pro úpravu celé lekce
                  <textarea value={revision} onChange={(e) => setRevision(e.target.value)} placeholder="Udělej druhé cvičení absurdnější. Zkrať úvod. Přidej soutěž mezi týmy…" required />
                </label>
                <button className="primary" disabled={busy}>{busy ? 'Upravuji…' : 'Upravit celou lekci'}</button>
              </form>
              <div className="quick-edits"><button type="button" onClick={() => setRevision('Udělej lekci zábavnější, ale ne infantilní.')}>Vtipnější</button><button type="button" onClick={() => setRevision('Přidej více týmové soutěže a jasné bodování.')}>Více soutěže</button><button type="button" onClick={() => setRevision('Omez výklad a přidej více práce studentů.')}>Méně výkladu</button></div>
            </div>
            <div className="panel block-editor">
              <span className="eyebrow">AI úprava jedné aktivity</span>
              <h2>{selectedBlock ? selectedBlock.title : 'Klikni na aktivitu v náhledu'}</h2>
              {selectedBlock ? <form onSubmit={reviseSelectedBlock}><label>Pokyn pro úpravu vybrané aktivity<textarea value={blockRevision} onChange={(e) => setBlockRevision(e.target.value)} placeholder="Např. Udělej to o polovinu kratší, přidej černější humor a jasnější výstup týmu." required /></label><button className="primary" disabled={busy}>{busy ? 'Upravuji…' : 'Upravit jen tuto aktivitu'}</button></form> : <p className="muted-copy">Vybraný blok se upraví bez přegenerování zbytku hodiny.</p>}
            </div>
          </> : null}
          {error ? <div className="error" role="alert">{error}</div> : null}
        </section>

        <section className="stage">
          {lesson ? <><div className="stage-toolbar"><div role="group" aria-label="Režim náhledu"><button type="button" aria-pressed={view === 'teacher'} className={view === 'teacher' ? 'secondary active' : 'secondary'} onClick={() => setView('teacher')}>Učitelský náhled</button><button type="button" aria-pressed={view === 'student'} className={view === 'student' ? 'secondary active' : 'secondary'} onClick={() => setView('student')}>Studentský režim</button></div><div className="stage-meta"><span>{lesson.totalMinutes} min</span>{undoLesson && lessonId ? <button type="button" className="undo-action" onClick={undoLastChange} disabled={busy}>↶ Vrátit poslední AI změnu</button> : null}{saveText ? <span className={saveStatus === 'saving' ? 'save-status saving' : 'save-status'} role="status" aria-live="polite" aria-atomic="true">{saveText}</span> : null}</div></div><LessonPreview lesson={lesson} mode={view} selectedBlockId={selectedBlockId} onSelectBlock={setSelectedBlockId} /></> : generationStage && generationStartedAt ? <GenerationProgress stage={generationStage} startedAt={generationStartedAt} duration={Number(duration)} audience={audience} groupSize={groupSize} /> : <div className="empty"><SyllonautMark /><h2>Tady vznikne vaše další lekce</h2><p>Ne slajdy. Interaktivní scénář, který studenti skutečně používají.</p><div className="sample-prompts"><span>týmová práce</span><span>hlasování</span><span>kvízy</span><span>odhalování</span><span>exit ticket</span></div></div>}
        </section>
      </div>
    </main>
  );
}
