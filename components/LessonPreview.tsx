'use client';

import { useEffect, useMemo, useState } from 'react';
import ActivityModeBadge from '@/components/ActivityModeBadge';
import LessonDataTable from '@/components/LessonDataTable';
import FormattedInstructions from '@/components/FormattedInstructions';
import { useUiLocale } from '@/components/LocaleProvider';
import { getLessonAccessibilityAuthoringIssues } from '@/lib/accessibility-authoring';
import { resolveLessonCollaborationMode, type Lesson, type LessonBlock } from '@/lib/schema';

function label(type: LessonBlock['type'], english: boolean) {
  const cs: Record<LessonBlock['type'], string> = {
    intro: 'Úvod', team_task: 'Týmová práce', poll: 'Hlasování', quiz: 'Kvíz',
    open_text: 'Otevřená odpověď', ranking: 'Řazení', reveal: 'Odhalení',
    timer: 'Časovač', exit_ticket: 'Exit ticket',
  };
  const en: Record<LessonBlock['type'], string> = {
    intro: 'Introduction', team_task: 'Team task', poll: 'Poll', quiz: 'Quiz',
    open_text: 'Open response', ranking: 'Ranking', reveal: 'Reveal',
    timer: 'Timer', exit_ticket: 'Exit ticket',
  };
  return (english ? en : cs)[type];
}

function shortLabel(type: LessonBlock['type'], english: boolean) {
  const cs: Record<LessonBlock['type'], string> = {
    intro: 'Úvod', team_task: 'Tým', poll: 'Poll', quiz: 'Kvíz', open_text: 'Text',
    ranking: 'Řazení', reveal: 'Reveal', timer: 'Timer', exit_ticket: 'Exit',
  };
  const en: Record<LessonBlock['type'], string> = {
    intro: 'Intro', team_task: 'Team', poll: 'Poll', quiz: 'Quiz', open_text: 'Text',
    ranking: 'Ranking', reveal: 'Reveal', timer: 'Timer', exit_ticket: 'Exit',
  };
  return (english ? en : cs)[type];
}

function Block({ block, index, teacherMode, editable, selected, recentlyChanged, onSelect, startMinute, english, contentLanguage }: {
  block: LessonBlock; index: number; teacherMode: boolean; editable: boolean; selected: boolean; recentlyChanged: boolean; onSelect?: () => void; startMinute?: number; english: boolean; contentLanguage?: string | null;
}) {
  const [revealed, setRevealed] = useState(false);
  const [selectedOption, setSelectedOption] = useState<string>('');
  const [seconds, setSeconds] = useState(block.durationMinutes * 60);
  const [running, setRunning] = useState(false);

  useEffect(() => {
    setSeconds(block.durationMinutes * 60);
    setRunning(false);
  }, [block.durationMinutes]);

  useEffect(() => {
    if (!running || seconds <= 0) return;
    const id = window.setInterval(() => setSeconds((s) => Math.max(0, s - 1)), 1000);
    return () => window.clearInterval(id);
  }, [running, seconds]);

  const mm = String(Math.floor(seconds / 60)).padStart(2, '0');
  const ss = String(seconds % 60).padStart(2, '0');

  return (
    <article className={`lesson-block lesson-block-type-${block.type}${recentlyChanged ? ' recently-changed-block' : ''}${selected ? ' selected-block' : ''}`}>
      {editable ? <button type="button" className="edit-block" data-tour="lesson-edit-block" aria-pressed={selected} onClick={onSelect}>{selected ? (english ? 'Selected for editing' : 'Vybráno k úpravě') : (english ? 'Edit block' : 'Upravit blok')}</button> : null}
      <div className="block-head">
        <div style={{ display: 'grid', gap: 6 }}>
          {editable && recentlyChanged ? <span className="revision-change-badge">{english ? 'New / updated' : 'Nové / upravené'}</span> : null}
          <span className="eyebrow">{index + 1}. {label(block.type, english)}</span>
          <ActivityModeBadge type={block.type} points={block.points} />
          <h3 lang={contentLanguage ?? undefined} dir={contentLanguage ? 'auto' : undefined}>{block.title}</h3>
          {teacherMode && typeof startMinute === 'number' ? <span className="block-time-range">{startMinute}–{startMinute + block.durationMinutes}. {english ? 'minute' : 'minuta'}</span> : null}
        </div>
        <span className="duration">{block.durationMinutes} min</span>
      </div>
      <FormattedInstructions text={block.instructions} className="instructions" lang={contentLanguage} />
      {block.dataTable ? <div lang={contentLanguage ?? undefined} dir={contentLanguage ? 'auto' : undefined}><LessonDataTable data={block.dataTable} /></div> : null}
      {block.items?.length ? <div className="items">{block.items.map((item) => <div className="item" key={item} lang={contentLanguage ?? undefined} dir={contentLanguage ? 'auto' : undefined}>{item}</div>)}</div> : null}
      {block.options?.length ? <div className="options" role="group" aria-label={english ? 'Answer options' : 'Možnosti odpovědi'}>{block.options.map((option) => <button key={option} type="button" aria-pressed={selectedOption === option} onClick={() => setSelectedOption(option)} className={selectedOption === option ? 'option selected' : 'option'} lang={contentLanguage ?? undefined} dir={contentLanguage ? 'auto' : undefined}>{option}</button>)}</div> : null}
      {['open_text', 'exit_ticket'].includes(block.type) ? <label>{english ? 'Student answer' : 'Odpověď studenta'}<textarea placeholder={english ? 'Student answer…' : 'Odpověď studenta…'} /></label> : null}
      {block.type === 'reveal' && block.revealText ? <div><button type="button" className="secondary" onClick={() => setRevealed((v) => !v)}>{revealed ? (english ? 'Hide reveal' : 'Skrýt pointu') : (english ? 'Reveal' : 'Odhalit pointu')}</button>{revealed ? <div role="status"><FormattedInstructions text={block.revealText} className="reveal" lang={contentLanguage} /></div> : null}</div> : null}
      {block.type === 'quiz' && selectedOption && teacherMode && block.correctAnswer ? <div className="reveal" role="status">{english ? 'Correct answer:' : 'Správná odpověď:'} <strong lang={contentLanguage ?? undefined} dir={contentLanguage ? 'auto' : undefined}>{block.correctAnswer}</strong></div> : null}
      {block.type === 'timer' ? <div className="timerbox"><strong role="timer" aria-label={`${english ? 'Time remaining' : 'Zbývající čas'} ${mm}:${ss}`}>{mm}:{ss}</strong><button type="button" className="secondary" onClick={() => setRunning((v) => !v)}>{running ? (english ? 'Pause' : 'Pauza') : 'Start'}</button><button type="button" className="secondary" onClick={() => { setRunning(false); setSeconds(block.durationMinutes * 60); }}>Reset</button></div> : null}
      {teacherMode && block.teacherNote ? <details><summary>{english ? 'Teacher note' : 'Poznámka pro učitele'}</summary><p lang={contentLanguage ?? undefined} dir={contentLanguage ? 'auto' : undefined}>{block.teacherNote}</p></details> : null}
    </article>
  );
}

export default function LessonPreview({ lesson, mode, selectedBlockId = null, recentlyChangedBlockIds = [], onSelectBlock, onEditBlock, readOnly = false }: { lesson: Lesson; mode: 'teacher' | 'student' | 'shared'; selectedBlockId?: string | null; recentlyChangedBlockIds?: string[]; onSelectBlock?: (id: string) => void; onEditBlock?: (id: string) => void; readOnly?: boolean }) {
  const english = useUiLocale() === 'en';
  const editable = mode === 'teacher' && !readOnly;
  const [studentPreviewIndex, setStudentPreviewIndex] = useState(0);
  const sum = lesson.blocks.reduce((total, block) => total + block.durationMinutes, 0);
  const starts = useMemo(() => lesson.blocks.map((_, index) => lesson.blocks.slice(0, index).reduce((total, block) => total + block.durationMinutes, 0)), [lesson.blocks]);
  const accessibilityIssues = useMemo(() => getLessonAccessibilityAuthoringIssues(lesson), [lesson]);
  const recentlyChangedBlocks = useMemo(() => new Set(recentlyChangedBlockIds), [recentlyChangedBlockIds]);
  const collaborationMode = resolveLessonCollaborationMode(lesson);

  useEffect(() => {
    setStudentPreviewIndex((current) => Math.min(current, Math.max(0, lesson.blocks.length - 1)));
  }, [lesson.blocks.length]);

  const studentBlock = lesson.blocks[studentPreviewIndex] ?? null;
  const studentProgress = lesson.blocks.length ? ((studentPreviewIndex + 1) / lesson.blocks.length) * 100 : 0;

  if (mode === 'student') {
    return (
      <div className="preview student-preview">
        <div className="student-preview-toolbar">
          <div>
            <span className="eyebrow">{english ? 'Student preview' : 'Studentský náhled'}</span>
            <p>{english ? 'This is how a student sees only the currently active part of the lesson.' : 'Takto student uvidí vždy jen právě aktivní část hodiny.'}</p>
          </div>
          <span className="student-preview-counter">{studentPreviewIndex + 1} / {lesson.blocks.length}</span>
        </div>

        <div className="student-preview-device">
          <div className="student-preview-device-head">
            <div><span className="student-preview-name">Syllonaut</span><strong lang={lesson.language} dir={lesson.language ? 'auto' : undefined}>{lesson.title}</strong></div>
            <span>{studentPreviewIndex + 1}/{lesson.blocks.length}</span>
          </div>
          <div
            className="student-progress-track"
            role="progressbar"
            aria-label={english ? 'Student preview progress' : 'Průběh studentského náhledu'}
            aria-valuemin={1}
            aria-valuemax={lesson.blocks.length}
            aria-valuenow={studentPreviewIndex + 1}
            aria-valuetext={english ? `Block ${studentPreviewIndex + 1} of ${lesson.blocks.length}` : `Blok ${studentPreviewIndex + 1} z ${lesson.blocks.length}`}
          >
            <div className="student-progress-fill" style={{ width: `${studentProgress}%` }} />
          </div>
          {studentBlock ? <Block block={studentBlock} index={studentPreviewIndex} teacherMode={false} editable={false} selected={false} recentlyChanged={false} english={english} contentLanguage={lesson.language} /> : null}
          <div className="student-preview-nav">
            <button type="button" className="secondary" disabled={studentPreviewIndex === 0} onClick={() => setStudentPreviewIndex((index) => Math.max(0, index - 1))}>← {english ? 'Previous' : 'Předchozí'}</button>
            <button type="button" className="primary" disabled={studentPreviewIndex >= lesson.blocks.length - 1} onClick={() => setStudentPreviewIndex((index) => Math.min(lesson.blocks.length - 1, index + 1))}>{english ? 'Next' : 'Další'} →</button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="preview">
      <div className="preview-header">
        <span className="eyebrow">{english ? 'Teacher preview' : 'Učitelský náhled'}</span>
        <h2 lang={lesson.language} dir={lesson.language ? 'auto' : undefined}>{lesson.title}</h2>
        {lesson.subtitle ? <p lang={lesson.language} dir={lesson.language ? 'auto' : undefined}>{lesson.subtitle}</p> : null}
        <div className="meta"><span>{lesson.audience}</span><span>{collaborationMode === 'individual' ? (english ? 'Individual activities only' : 'Pouze individuální aktivity') : (english ? `Individual + team activities · teams of ${lesson.groupSize}` : `Individuální + týmové aktivity · týmy po ${lesson.groupSize}`)}</span><span>{sum} min</span><span>{lesson.blocks.length} {english ? 'activities' : 'aktivit'}</span></div>
      </div>

      <details className="reveal" style={{ marginTop: 14 }} open={accessibilityIssues.length > 0}>
        <summary>
          {english ? 'Content accessibility check' : 'Kontrola přístupnosti obsahu'}: {accessibilityIssues.length
            ? (english ? `${accessibilityIssues.length} warning(s)` : `${accessibilityIssues.length} upozornění`)
            : (english ? 'no detected issues' : 'bez zjištěných problémů')}
        </summary>
        {accessibilityIssues.length ? (
          <ul style={{ marginBottom: 0 }}>
            {accessibilityIssues.map((issue) => (
              <li key={`${issue.blockId}-${issue.code}`}>
                <strong>{issue.blockTitle}:</strong> {issue.message} <span><strong>{english ? 'How to fix:' : 'Jak opravit:'}</strong> {issue.suggestion}</span>
              </li>
            ))}
          </ul>
        ) : <p className="muted-copy" style={{ marginBottom: 0 }}>{english
          ? 'The automated check found no missing table caption, drag-only instruction, obvious reliance on colour or position, or undescribed visual reference. This is an authoring aid, not a substitute for human review.'
          : 'Automatická kontrola nenašla chybějící popisek tabulky, drag-only pokyn, zjevnou závislost na barvě či poloze ani nepopsaný odkaz na vizuální materiál. Jde o pomocnou kontrolu, ne náhradu lidského posouzení.'}</p>}
      </details>

      <div className="lesson-route" aria-label={english ? 'Lesson flow' : 'Průběh lekce'}>
        {lesson.blocks.map((block, index) => {
          const content = <><span className="lesson-route-index">{index + 1}</span><span className="lesson-route-label">{shortLabel(block.type, english)}</span><span className="lesson-route-time">{block.durationMinutes}m</span></>;
          const className = `lesson-route-stop lesson-route-stop-${block.type}${recentlyChangedBlocks.has(block.id) ? ' recently-changed-route-stop' : ''}${selectedBlockId === block.id ? ' active' : ''}`;
          return editable ? (
            <button
              type="button"
              key={block.id}
              className={className}
              aria-pressed={selectedBlockId === block.id}
              onClick={() => onSelectBlock?.(block.id)}
              title={`${index + 1}. ${block.title} · ${block.durationMinutes} min`}
            >
              {content}
            </button>
          ) : <div key={block.id} className={className} title={`${index + 1}. ${block.title} · ${block.durationMinutes} min`}>{content}</div>;
        })}
      </div>

      <div className="objectives"><strong>{english ? 'After the lesson, students will be able to:' : 'Po lekci studenti zvládnou:'}</strong><ul>{lesson.learningObjectives.map((o) => <li key={o} lang={lesson.language} dir={lesson.language ? 'auto' : undefined}>{o}</li>)}</ul></div>
      <div className="lesson-list">{lesson.blocks.map((block, index) => <Block key={block.id} block={block} index={index} teacherMode editable={editable} selected={selectedBlockId === block.id} recentlyChanged={recentlyChangedBlocks.has(block.id)} onSelect={editable ? () => onEditBlock?.(block.id) : undefined} startMinute={starts[index]} english={english} contentLanguage={lesson.language} />)}</div>
    </div>
  );
}
