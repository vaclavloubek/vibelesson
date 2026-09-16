'use client';

import { FormEvent, useMemo, useState } from 'react';
import LessonPreview from '@/components/LessonPreview';
import { demoLesson } from '@/lib/demo';
import type { Lesson } from '@/lib/schema';

export default function Home() {
  const [prompt, setPrompt] = useState('');
  const [audience, setAudience] = useState('1. ročník vysoké školy');
  const [duration, setDuration] = useState(90);
  const [groupSize, setGroupSize] = useState('3–4 studenti');
  const [tone, setTone] = useState('živý, praktický a lehce vtipný');
  const [lesson, setLesson] = useState<Lesson | null>(null);
  const [revision, setRevision] = useState('');
  const [blockRevision, setBlockRevision] = useState('');
  const [selectedBlockId, setSelectedBlockId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [view, setView] = useState<'teacher' | 'student'>('teacher');

  const selectedBlock = useMemo(() => lesson?.blocks.find((b) => b.id === selectedBlockId) ?? null, [lesson, selectedBlockId]);

  async function generate(e: FormEvent) {
    e.preventDefault();
    setBusy(true); setError(''); setSelectedBlockId(null);
    try {
      const res = await fetch('/api/generate', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ prompt, audience, duration, groupSize, tone }) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Generování selhalo.');
      setLesson(data);
    } catch (err) { setError(err instanceof Error ? err.message : 'Generování selhalo.'); }
    finally { setBusy(false); }
  }

  async function revise(e: FormEvent) {
    e.preventDefault();
    if (!lesson) return;
    setBusy(true); setError('');
    try {
      const res = await fetch('/api/revise', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ instruction: revision, lesson }) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Úprava selhala.');
      setLesson(data); setRevision(''); setSelectedBlockId(null);
    } catch (err) { setError(err instanceof Error ? err.message : 'Úprava selhala.'); }
    finally { setBusy(false); }
  }

  async function reviseSelectedBlock(e: FormEvent) {
    e.preventDefault();
    if (!lesson || !selectedBlock) return;
    setBusy(true); setError('');
    try {
      const res = await fetch('/api/revise-block', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ instruction: blockRevision, block: selectedBlock, lessonContext: { title: lesson.title, audience: lesson.audience, groupSize: lesson.groupSize, learningObjectives: lesson.learningObjectives } }),
      });
      const updated = await res.json();
      if (!res.ok) throw new Error(updated.error || 'Úprava aktivity selhala.');
      const blocks = lesson.blocks.map((b) => b.id === updated.id ? updated : b);
      setLesson({ ...lesson, blocks, totalMinutes: blocks.reduce((s, b) => s + b.durationMinutes, 0) });
      setBlockRevision('');
    } catch (err) { setError(err instanceof Error ? err.message : 'Úprava aktivity selhala.'); }
    finally { setBusy(false); }
  }

  function loadDemo() { setLesson(demoLesson); setSelectedBlockId(null); setError(''); }

  return (
    <main className="shell">
      <header className="brand">
        <div><span className="brand-mark">V</span><strong>VibeLesson</strong><span className="beta">BETA</span></div>
        <p>Popiš hodinu. AI z ní udělá interaktivní výuku.</p>
      </header>

      <div className="workspace">
        <section className="builder">
          <div className="panel">
            <span className="eyebrow">1 · Vytvoř lekci</span>
            <h1>Co mají studenti dnes zažít?</h1>
            <form onSubmit={generate}>
              <label>Volný popis hodiny<textarea value={prompt} onChange={(e) => setPrompt(e.target.value)} placeholder="Např. Chci 180 minut mediální gramotnosti pro prváky digitálního marketingu. Týmy po 3–4, hodně humoru, minimum výkladu…" required /></label>
              <div className="form-grid">
                <label>Cílovka<input value={audience} onChange={(e) => setAudience(e.target.value)} /></label>
                <label>Délka v minutách<input type="number" min="10" max="360" value={duration} onChange={(e) => setDuration(Number(e.target.value))} /></label>
                <label>Velikost týmu<input value={groupSize} onChange={(e) => setGroupSize(e.target.value)} /></label>
                <label>Tón<input value={tone} onChange={(e) => setTone(e.target.value)} /></label>
              </div>
              <div className="actions"><button className="primary" disabled={busy}>{busy ? 'AI přemýšlí…' : 'Vygenerovat hodinu'}</button><button type="button" className="secondary" onClick={loadDemo}>Ukázková lekce</button></div>
            </form>
          </div>

          {lesson ? <>
            <div className="panel vibe-editor"><span className="eyebrow">2 · Vibe edit celé lekce</span><h2>Řekni, co chceš změnit</h2><form onSubmit={revise}><textarea value={revision} onChange={(e) => setRevision(e.target.value)} placeholder="Udělej druhé cvičení absurdnější. Zkrať úvod. Přidej soutěž mezi týmy…" required /><button className="primary" disabled={busy}>{busy ? 'Upravuji…' : 'Upravit celou lekci'}</button></form><div className="quick-edits"><button type="button" onClick={() => setRevision('Udělej lekci zábavnější, ale ne infantilní.')}>Vtipnější</button><button type="button" onClick={() => setRevision('Přidej více týmové soutěže a jasné bodování.')}>Více soutěže</button><button type="button" onClick={() => setRevision('Omez výklad a přidej více práce studentů.')}>Méně výkladu</button></div></div>
            <div className="panel block-editor"><span className="eyebrow">3 · Vibe edit jedné aktivity</span><h2>{selectedBlock ? selectedBlock.title : 'Klikni na aktivitu v náhledu'}</h2>{selectedBlock ? <form onSubmit={reviseSelectedBlock}><textarea value={blockRevision} onChange={(e) => setBlockRevision(e.target.value)} placeholder="Např. Udělej to o polovinu kratší, přidej černější humor a jasnější výstup týmu." required /><button className="primary" disabled={busy}>{busy ? 'Upravuji…' : 'Upravit jen tuto aktivitu'}</button></form> : <p className="muted-copy">Vybraný blok se upraví bez přegenerování zbytku hodiny.</p>}</div>
          </> : null}
          {error ? <div className="error">{error}</div> : null}
        </section>

        <section className="stage">
          {lesson ? <><div className="stage-toolbar"><div><button type="button" className={view === 'teacher' ? 'secondary active' : 'secondary'} onClick={() => setView('teacher')}>Učitelský náhled</button><button type="button" className={view === 'student' ? 'secondary active' : 'secondary'} onClick={() => setView('student')}>Studentský režim</button></div><span>{lesson.totalMinutes} min</span></div><LessonPreview lesson={lesson} mode={view} selectedBlockId={selectedBlockId} onSelectBlock={setSelectedBlockId} /></> : <div className="empty"><div className="empty-icon">✦</div><h2>Tady vznikne hodina</h2><p>Ne slajdy. Interaktivní scénář, který studenti skutečně používají.</p><div className="sample-prompts"><span>týmové mise</span><span>hlasování</span><span>kvízy</span><span>odhalování stop</span><span>exit ticket</span></div></div>}
        </section>
      </div>
    </main>
  );
}
