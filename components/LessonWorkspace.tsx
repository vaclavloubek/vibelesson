'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { FormEvent, useEffect, useMemo, useRef, useState } from 'react';
import type { User } from '@supabase/supabase-js';
import AuthControls from '@/components/AuthControls';
import LocaleSwitcher from '@/components/LocaleSwitcher';
import { useUiLocale } from '@/components/LocaleProvider';
import GenerationProgress, { type GenerationStage } from '@/components/GenerationProgress';
import GradingStrictnessControl from '@/components/GradingStrictnessControl';
import LessonPreview from '@/components/LessonPreview';
import SyllonautMark from '@/components/SyllonautMark';
import { demoLesson, demoLessonEn } from '@/lib/demo';
import {
  bucketBlockCount,
  bucketDuration,
  bucketGroupSize,
  bucketMaterialSize,
  fileTypeGroup,
  generationErrorCode,
  revisionErrorCode,
  trackEvent,
  type GenerationFailureStage,
  type MaterialMode,
} from '@/lib/analytics';
import { extractMaterialsInBrowser } from '@/lib/materials-client';
import { MATERIAL_MAX_FILES, MATERIAL_MAX_TOTAL_BYTES } from '@/lib/materials';
import { localizedApiError } from '@/lib/i18n';
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
  const locale = useUiLocale();
  const english = locale === 'en';
  const ui = (cs: string, en: string) => english ? en : cs;
  const [prompt, setPrompt] = useState(initialPrompt ?? '');
  const [audience, setAudience] = useState(initialLesson?.audience ?? '');
  const [duration, setDuration] = useState(initialLesson ? String(initialLesson.totalMinutes) : '');
  const [groupSize, setGroupSize] = useState(initialLesson?.groupSize ?? '');
  const [tone, setTone] = useState('');
  const [lessonLanguage, setLessonLanguage] = useState('auto');
  const [customLessonLanguage, setCustomLessonLanguage] = useState('');
  const [materialMode, setMaterialMode] = useState<MaterialMode>('primary');
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
  const lessonCreationTrackedRef = useRef(false);

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

  function markLessonCreationStarted() {
    if (initialLessonId || lessonCreationTrackedRef.current) return;
    lessonCreationTrackedRef.current = true;
    trackEvent('lesson_creation_started');
  }

  function requireAuth() {
    if (authUser) return true;
    setError(ui('Pro AI funkce se nejdřív přihlas vpravo nahoře. Ukázková lekce funguje i bez účtu.', 'Sign in first to use AI features. The example lesson works without an account.'));
    return false;
  }

  function rememberSavedLesson(nextLesson: Lesson, nextLessonId: string) {
    if (!authUser) return;
    const snapshot: RecoverySnapshot = { ownerId: authUser.id, lessonId: nextLessonId, lesson: nextLesson };
    window.localStorage.setItem(LAST_LESSON_KEY, JSON.stringify(snapshot));
    setRecovery(snapshot);
  }

  function applyLessonResponse(data: LessonApiResponse) {
    if (!data.lesson) throw new Error(localizedApiError(data.error, locale, 'Server nevrátil lekci.', 'The server did not return a lesson.'));
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
    const hasMaterials = files.length > 0;
    const requestedDuration = Number(duration);

    if (!prompt.trim() && files.length === 0) {
      setError(ui('Popiš hodinu nebo nahraj alespoň jeden podklad.', 'Describe the lesson or upload at least one source file.'));
      return;
    }
    const requestedLessonLanguage = lessonLanguage === 'other' ? customLessonLanguage.trim() : lessonLanguage;
    if (lessonLanguage === 'other' && requestedLessonLanguage.length < 2) {
      setError(ui('Napiš jazyk, ve kterém chceš lekci vytvořit.', 'Enter the language you want the lesson to use.'));
      return;
    }
    if (files.length > MATERIAL_MAX_FILES) {
      setError(english ? `Upload no more than ${MATERIAL_MAX_FILES} files.` : `Nahraj nejvýše ${MATERIAL_MAX_FILES} souborů.`);
      return;
    }
    if (files.reduce((sum, file) => sum + file.size, 0) > MATERIAL_MAX_TOTAL_BYTES) {
      setError(ui('Podklady mohou mít dohromady nejvýše 10 MB.', 'Source materials can be up to 10 MB in total.'));
      return;
    }

    if (hasMaterials) {
      trackEvent('source_materials_added', {
        file_count: files.length,
        file_type_group: fileTypeGroup(files),
        size_bucket: bucketMaterialSize(files.reduce((sum, file) => sum + file.size, 0)),
        material_mode: materialMode,
      });
    }
    trackEvent('lesson_generation_started', {
      has_materials: hasMaterials,
      material_mode: materialMode,
      duration_bucket: bucketDuration(requestedDuration),
      group_size_bucket: bucketGroupSize(groupSize),
    });

    setBusy(true);
    setError('');
    setUndoLesson(null);
    setSelectedBlockId(null);
    setGenerationStartedAt(Date.now());
    setGenerationStage('requesting');

    let failureStage: GenerationFailureStage = 'materials';

    try {
      const materials = await extractMaterialsInBrowser(files);
      failureStage = 'request';
      const res = await fetch('/api/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt, audience, duration: Number(duration), groupSize, tone, lessonLanguage: requestedLessonLanguage || 'auto', uiLocale: locale, gradingStrictness, materialMode, materials, folderId: initialFolderId }),
      });

      const contentType = res.headers.get('content-type') ?? '';
      if (!res.ok || !contentType.includes('application/x-ndjson')) {
        const data = await res.json() as LessonApiResponse;
        if (!res.ok) throw new Error(localizedApiError(data.error, locale, 'Generování selhalo.', 'Lesson generation failed.'));
        failureStage = 'result';
        applyLessonResponse(data);
        trackEvent('lesson_generation_completed', {
          has_materials: hasMaterials,
          block_count_bucket: bucketBlockCount(data.lesson?.blocks.length ?? 0),
          duration_bucket: bucketDuration(data.lesson?.totalMinutes ?? requestedDuration),
        });
        setQuotaRefreshKey((value) => value + 1);
        if (data.lessonId) router.replace(`/lessons/${data.lessonId}`);
        return;
      }

      if (!res.body) throw new Error(ui('Server nevrátil průběh generování.', 'The server did not return generation progress.'));

      failureStage = 'stream';
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
        if (event.type === 'error') throw new Error(localizedApiError(event.error, locale, 'Generování selhalo.', 'Lesson generation failed.'));
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
      const completedLesson = resultLesson as Lesson | null;
      if (!completedLesson || !resultLessonId) throw new Error(ui('Generování skončilo bez hotové lekce.', 'Generation ended without a completed lesson.'));

      failureStage = 'result';
      applyLessonResponse({ lesson: completedLesson, lessonId: resultLessonId });
      trackEvent('lesson_generation_completed', {
        has_materials: hasMaterials,
        block_count_bucket: bucketBlockCount(completedLesson.blocks.length),
        duration_bucket: bucketDuration(completedLesson.totalMinutes),
      });
      setQuotaRefreshKey((value) => value + 1);
      router.replace(`/lessons/${resultLessonId}`);
    } catch (err) {
      trackEvent('lesson_generation_failed', {
        failure_stage: failureStage,
        error_code: generationErrorCode(err, failureStage),
      });
      const rawMessage = err instanceof Error ? err.message : '';
      const isTransportError = /string did not match|failed to fetch|load failed|network|connection/i.test(rawMessage);
      setError(isTransportError
        ? ui('Spojení se během generování přerušilo. Pokud se lekce stihla dokončit, najdeš ji v Moje lekce; jinak to zkus znovu.', 'The connection was interrupted during generation. If the lesson finished, you will find it in My lessons; otherwise try again.')
        : rawMessage || ui('Generování selhalo.', 'Lesson generation failed.'));
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
    trackEvent('lesson_revision_started', { revision_scope: 'whole_lesson' });
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
      if (!res.ok) throw new Error(localizedApiError(data.error, locale, 'Úprava selhala.', 'The edit failed.'));
      applyLessonResponse(data);
      setUndoLesson(data.lessonId ? before : null);
      setRevision('');
      setQuotaRefreshKey((value) => value + 1);
      trackEvent('lesson_revision_completed', { revision_scope: 'whole_lesson' });
    } catch (err) {
      trackEvent('lesson_revision_failed', { revision_scope: 'whole_lesson', error_code: revisionErrorCode(err) });
      if (lessonId) setSaveStatus('saved');
      setError(err instanceof Error ? err.message : ui('Úprava selhala.', 'The edit failed.'));
    } finally {
      setBusy(false);
    }
  }

  async function reviseSelectedBlock(e: FormEvent) {
    e.preventDefault();
    if (!lesson || !selectedBlock || !requireAuth()) return;
    const before = lesson;
    trackEvent('lesson_revision_started', { revision_scope: 'activity' });
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
      if (!res.ok) throw new Error(localizedApiError(data.error, locale, 'Úprava aktivity selhala.', 'The activity edit failed.'));
      applyLessonResponse(data);
      setUndoLesson(data.lessonId ? before : null);
      setBlockRevision('');
      setQuotaRefreshKey((value) => value + 1);
      trackEvent('lesson_revision_completed', { revision_scope: 'activity' });
    } catch (err) {
      trackEvent('lesson_revision_failed', { revision_scope: 'activity', error_code: revisionErrorCode(err) });
      if (lessonId) setSaveStatus('saved');
      setError(err instanceof Error ? err.message : ui('Úprava aktivity selhala.', 'The activity edit failed.'));
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
      if (!res.ok) throw new Error(localizedApiError(data.error, locale, 'Předchozí verzi se nepodařilo obnovit.', 'The previous version could not be restored.'));
      applyLessonResponse(data);
      setUndoLesson(null);
    } catch (err) {
      setSaveStatus('saved');
      setError(err instanceof Error ? err.message : ui('Předchozí verzi se nepodařilo obnovit.', 'The previous version could not be restored.'));
    } finally {
      setBusy(false);
    }
  }

  function loadDemo() {
    const nextDemo = english ? demoLessonEn : demoLesson;
    setLesson(nextDemo);
    setGradingStrictness(nextDemo.gradingStrictness ?? 'neutral');
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
      if (!response.ok || !data.lesson) throw new Error(localizedApiError(data.error, locale, 'Nastavení hodnocení se nepodařilo uložit.', 'The grading setting could not be saved.'));

      const parsed = LessonSchema.parse(data.lesson);
      setLesson(parsed);
      setGradingStrictness(parsed.gradingStrictness ?? 'neutral');
      setSaveStatus('saved');
      rememberSavedLesson(parsed, lessonId);
    } catch (err) {
      setLesson(previous);
      setGradingStrictness(previous.gradingStrictness ?? 'neutral');
      setSaveStatus('saved');
      setError(err instanceof Error ? err.message : ui('Nastavení hodnocení se nepodařilo uložit.', 'The grading setting could not be saved.'));
    }
  }

  const saveText = lessonId
    ? saveStatus === 'saving' ? ui('Ukládám změny…', 'Saving changes…') : ui('✓ Uloženo', '✓ Saved')
    : lesson ? ui('Ukázka · neukládá se', 'Example · not saved') : '';

  return (
    <main className="shell">
      <header className="brand">
        <div className="brand-identity"><Link href={`/${locale}`} className="brand-home"><SyllonautMark /><strong>Syllonaut</strong></Link><span className="beta">BETA</span></div>
        <nav className="main-nav"><Link href="/new">{ui('Nová lekce', 'New lesson')}</Link><Link href="/lessons">{ui('Moje lekce', 'My lessons')}</Link></nav>
        <div className="brand-side"><LocaleSwitcher /><p className="brand-tagline">{ui('AI navigátor pro interaktivní výuku.', 'AI navigator for interactive teaching.')}</p><AuthControls onAuthChange={setAuthUser} quotaRefreshKey={quotaRefreshKey} /></div>
      </header>

      {authUser && recovery && (!lessonId || recovery.lessonId !== lessonId) ? (
        <div className="recovery-banner">
          <span>{ui('Poslední uložená lekce:', 'Last saved lesson:')} <strong>{recovery.lesson.title}</strong></span>
          <button type="button" className="secondary" onClick={restoreLastLesson}>{ui('Pokračovat', 'Continue')}</button>
        </div>
      ) : null}

      <div className="workspace">
        <section className="builder" aria-busy={busy}>
          {lessonId && lesson ? (
            <div className="panel current-lesson-panel">
              <span className="eyebrow">{ui('Uložená lekce', 'Saved lesson')}</span>
              <h1>{lesson.title}</h1>
              <p className="muted-copy">{ui('Pokračuj AI úpravami níže. Každá úspěšná změna se ukládá automaticky.', 'Continue with AI edits below. Every successful change is saved automatically.')}</p>
              {aiGradingEnabled ? (
                <GradingStrictnessControl
                  value={gradingStrictness}
                  disabled={busy || saveStatus === 'saving'}
                  onChange={(next) => { void changeGradingStrictness(next); }}
                  compact
                />
              ) : null}
              <div className="actions"><Link href="/lessons" className="secondary button-link">← {ui('Moje lekce', 'My lessons')}</Link><Link href="/new" className="primary button-link">+ {ui('Nová lekce', 'New lesson')}</Link></div>
            </div>
          ) : (
            <div className="panel">
              <span className="eyebrow">{ui('Nová lekce', 'New lesson')}</span>
              <h1>{ui('Co mají studenti dnes zažít?', 'What should students experience today?')}</h1>
              {initialFolderId ? <p className="auth-hint">{ui('Nová lekce se po vytvoření uloží přímo do vybrané složky.', 'The new lesson will be saved directly into the selected folder.')}</p> : null}
              <form onSubmit={generate} onFocusCapture={markLessonCreationStarted}>
                <label>{ui('Volný popis hodiny', 'Lesson brief')}<textarea name="prompt" value={prompt} onChange={(e) => setPrompt(e.target.value)} placeholder={ui('Např. Chci 180 minut mediální gramotnosti pro prváky digitálního marketingu. Týmy po 3–4, hodně humoru, minimum výkladu…', 'E.g. I want 90 minutes of media literacy for first-year students. Teams of 3–4, practical work, minimal lecturing…')} /></label>
                <p className="auth-hint"><strong>{ui('Pište v jazyce, ve kterém chcete vytvořit lekci.', 'Write your brief in the language you want to use for the lesson.')}</strong> {ui('Syllonaut rozumí různým jazykům a vytvoří obsah ve stejném jazyce.', 'Syllonaut understands multiple languages and will create the content in the same language.')}</p>
                <div className="form-grid">
                  <label>{ui('Jazyk lekce', 'Lesson language')}
                    <select value={lessonLanguage} onChange={(event) => setLessonLanguage(event.target.value)} className="materials-mode-select">
                      <option value="auto">{ui('Automaticky podle zadání', 'Automatically from the brief')}</option>
                      <option value="cs">Čeština</option>
                      <option value="en">English</option>
                      <option value="de">Deutsch</option>
                      <option value="fr">Français</option>
                      <option value="es">Español</option>
                      <option value="pl">Polski</option>
                      <option value="sk">Slovenčina</option>
                      <option value="other">{ui('Jiný jazyk…', 'Other language…')}</option>
                    </select>
                  </label>
                  {lessonLanguage === 'other' ? <label>{ui('Jiný jazyk', 'Other language')}<input value={customLessonLanguage} onChange={(event) => setCustomLessonLanguage(event.target.value)} placeholder={ui('např. Italiano, Українська, Português…', 'e.g. Italiano, Українська, Português…')} required /></label> : null}
                  <label>{ui('Cílovka', 'Audience')}<input name="audience" value={audience} onChange={(e) => setAudience(e.target.value)} placeholder={ui('např. 1. ročník vysoké školy', 'e.g. first-year university students')} required /></label>
                  <label>{ui('Délka v minutách', 'Duration in minutes')}<input name="duration" type="number" min="10" max="360" value={duration} onChange={(e) => setDuration(e.target.value)} placeholder={ui('např. 90', 'e.g. 90')} required /></label>
                  <label>{ui('Velikost týmu', 'Team size')}<input name="groupSize" value={groupSize} onChange={(e) => setGroupSize(e.target.value)} placeholder={ui('např. 3–4 studenti', 'e.g. 3–4 students')} required /></label>
                  <label>{ui('Tón', 'Tone')}<input name="tone" value={tone} onChange={(e) => setTone(e.target.value)} placeholder={ui('např. živý, praktický a lehce vtipný', 'e.g. lively, practical and lightly humorous')} required /></label>
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
                      <strong>{ui('Přidat podklady k lekci', 'Add source materials')}</strong>
                      <span>{ui('volitelné', 'optional')}</span>
                    </span>
                    <span className="materials-disclosure-chevron" aria-hidden="true">⌄</span>
                  </summary>
                  <div className="materials-disclosure-body">
                    <label>{ui('Prezentace, pracovní listy nebo textové materiály', 'Presentations, worksheets or text materials')}
                      <input name="materials" type="file" multiple accept=".pdf,.pptx,.docx,.txt,.md,application/pdf,text/plain,text/markdown" />
                    </label>
                    <p className="muted-copy" style={{ marginTop: 8 }}>{ui('PDF, PPTX, DOCX, TXT nebo MD · nejvýše 5 souborů · dohromady max. 10 MB.', 'PDF, PPTX, DOCX, TXT or MD · up to 5 files · 10 MB total.')}</p>
                    <label style={{ marginTop: 12 }}>{ui('Jak s podklady pracovat', 'How to use the materials')}
                      <select name="materialMode" value={materialMode} onChange={(event) => setMaterialMode(event.target.value as MaterialMode)} className="materials-mode-select">
                        <option value="primary">{ui('Vycházet z podkladů', 'Use as the primary source')}</option>
                        <option value="strict">{ui('Držet se podkladů', 'Stay strictly within the materials')}</option>
                        <option value="inspiration">{ui('Použít jako inspiraci', 'Use as inspiration')}</option>
                      </select>
                    </label>
                    <p className="muted-copy" style={{ marginTop: 8 }}>{ui('Originální soubory zůstávají ve vašem zařízení. Syllonaut v prohlížeči získá jejich text a na server odešle pouze tento text; podklady ani extrahovaný obsah trvale neukládá.', 'Original files stay on your device. Syllonaut extracts their text in the browser and sends only that text to the server; neither the files nor extracted content are stored permanently.')}</p>
                  </div>
                </details>
                <div className="actions"><button className="primary" disabled={busy}>{busy ? ui('Syllonaut připravuje lekci…', 'Syllonaut is preparing the lesson…') : ui('Vytvořit lekci', 'Create lesson')}</button><button type="button" className="secondary" disabled={busy} onClick={loadDemo}>{ui('Ukázková lekce', 'Example lesson')}</button></div>
                {!authUser ? <p className="auth-hint">{ui('AI generování vyžaduje bezplatný účet. Ukázková lekce je dostupná bez přihlášení.', 'AI generation requires a free account. The example lesson is available without signing in.')}</p> : null}
              </form>
            </div>
          )}

          {lesson ? <>
            <div className="panel vibe-editor">
              <span className="eyebrow">{ui('AI úprava celé lekce', 'AI edit · whole lesson')}</span>
              <h2>{ui('Uprav celou lekci', 'Edit the whole lesson')}</h2>
              <form onSubmit={revise}>
                <label>
                  {ui('Pokyn pro úpravu celé lekce', 'Instruction for the whole-lesson edit')}
                  <textarea value={revision} onChange={(e) => setRevision(e.target.value)} placeholder={ui('Udělej druhé cvičení absurdnější. Zkrať úvod. Přidej soutěž mezi týmy…', 'Make the second activity more playful. Shorten the intro. Add a competition between teams…')} required />
                </label>
                <button className="primary" disabled={busy}>{busy ? ui('Upravuji…', 'Editing…') : ui('Upravit celou lekci', 'Edit whole lesson')}</button>
              </form>
              <div className="quick-edits"><button type="button" onClick={() => setRevision(ui('Udělej lekci zábavnější, ale ne infantilní.', 'Make the lesson more engaging, but not childish.'))}>{ui('Vtipnější', 'More playful')}</button><button type="button" onClick={() => setRevision(ui('Přidej více týmové soutěže a jasné bodování.', 'Add more team competition and clear scoring.'))}>{ui('Více soutěže', 'More competition')}</button><button type="button" onClick={() => setRevision(ui('Omez výklad a přidej více práce studentů.', 'Reduce lecturing and add more student work.'))}>{ui('Méně výkladu', 'Less lecturing')}</button></div>
            </div>
            <div className="panel block-editor">
              <span className="eyebrow">{ui('AI úprava jedné aktivity', 'AI edit · one activity')}</span>
              <h2>{selectedBlock ? selectedBlock.title : ui('Klikni na aktivitu v náhledu', 'Select an activity in the preview')}</h2>
              {selectedBlock ? <form onSubmit={reviseSelectedBlock}><label>{ui('Pokyn pro úpravu vybrané aktivity', 'Instruction for the selected activity')}<textarea value={blockRevision} onChange={(e) => setBlockRevision(e.target.value)} placeholder={ui('Např. Udělej to o polovinu kratší, přidej černější humor a jasnější výstup týmu.', 'E.g. Make it half as long, add sharper humour and a clearer team output.')} required /></label><button className="primary" disabled={busy}>{busy ? ui('Upravuji…', 'Editing…') : ui('Upravit jen tuto aktivitu', 'Edit this activity only')}</button></form> : <p className="muted-copy">{ui('Vybraný blok se upraví bez přegenerování zbytku hodiny.', 'The selected block is edited without regenerating the rest of the lesson.')}</p>}
            </div>
          </> : null}
          {error ? <div className="error" role="alert">{error}</div> : null}
        </section>

        <section className="stage">
          {lesson ? <><div className="stage-toolbar"><div role="group" aria-label={ui('Režim náhledu', 'Preview mode')}><button type="button" aria-pressed={view === 'teacher'} className={view === 'teacher' ? 'secondary active' : 'secondary'} onClick={() => setView('teacher')}>{ui('Učitelský náhled', 'Teacher preview')}</button><button type="button" aria-pressed={view === 'student'} className={view === 'student' ? 'secondary active' : 'secondary'} onClick={() => setView('student')}>{ui('Studentský režim', 'Student view')}</button></div><div className="stage-meta"><span>{lesson.totalMinutes} min</span>{undoLesson && lessonId ? <button type="button" className="undo-action" onClick={undoLastChange} disabled={busy}>↶ {ui('Vrátit poslední AI změnu', 'Undo last AI change')}</button> : null}{saveText ? <span className={saveStatus === 'saving' ? 'save-status saving' : 'save-status'} role="status" aria-live="polite" aria-atomic="true">{saveText}</span> : null}</div></div><LessonPreview lesson={lesson} mode={view} selectedBlockId={selectedBlockId} onSelectBlock={setSelectedBlockId} /></> : generationStage && generationStartedAt ? <GenerationProgress stage={generationStage} startedAt={generationStartedAt} duration={Number(duration)} audience={audience} groupSize={groupSize} /> : <div className="empty"><SyllonautMark /><h2>{ui('Tady vznikne vaše další lekce', 'Your next lesson will appear here')}</h2><p>{ui('Ne slajdy. Interaktivní scénář, který studenti skutečně používají.', 'Not slides. An interactive lesson flow students actually use.')}</p><div className="sample-prompts"><span>{ui('týmová práce', 'team work')}</span><span>{ui('hlasování', 'polls')}</span><span>{ui('kvízy', 'quizzes')}</span><span>{ui('odhalování', 'reveals')}</span><span>exit ticket</span></div></div>}
        </section>
      </div>
    </main>
  );
}
