'use client';

import { useEffect, useMemo, useState } from 'react';
import ActivityModeBadge from '@/components/ActivityModeBadge';
import LessonDataTable from '@/components/LessonDataTable';
import type { Lesson, LessonBlock } from '@/lib/schema';

function label(type: LessonBlock['type']) {
  const labels: Record<LessonBlock['type'], string> = {
    intro: 'Úvod',
    team_task: 'Týmová práce',
    poll: 'Hlasování',
    quiz: 'Kvíz',
    open_text: 'Otevřená odpověď',
    ranking: 'Řazení',
    reveal: 'Odhalení',
    timer: 'Časovač',
    exit_ticket: 'Exit ticket',
  };
  return labels[type];
}

function shortLabel(type: LessonBlock['type']) {
  const labels: Record<LessonBlock['type'], string> = {
    intro: 'Úvod',
    team_task: 'Tým',
    poll: 'Poll',
    quiz: 'Kvíz',
    open_text: 'Text',
    ranking: 'Řazení',
    reveal: 'Reveal',
    timer: 'Timer',
    exit_ticket: 'Exit',
  };
  return labels[type];
}

function Block({ block, index, teacherMode, selected, onSelect, startMinute }: { block: LessonBlock; index: number; teacherMode: boolean; selected: boolean; onSelect: () => void; startMinute?: number }) {
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
    <article className={`lesson-block lesson-block-type-${block.type} ${selected ? 'selected-block' : ''}`}>
      {teacherMode ? <button type="button" className="edit-block" aria-pressed={selected} onClick={onSelect}>{selected ? 'Vybráno k úpravě' : 'Upravit blok'}</button> : null}
      <div className="block-head">
        <div style={{ display: 'grid', gap: 6 }}>
          <span className="eyebrow">{index + 1}. {label(block.type)}</span>
          <ActivityModeBadge type={block.type} />
          <h3>{block.title}</h3>
          {teacherMode && typeof startMinute === 'number' ? <span className="block-time-range">{startMinute}–{startMinute + block.durationMinutes}. minuta</span> : null}
        </div>
        <span className="duration">{block.durationMinutes} min</span>
      </div>
      <p className="instructions">{block.instructions}</p>
      {block.dataTable ? <LessonDataTable data={block.dataTable} /> : null}
      {block.items?.length ? <div className="items">{block.items.map((item) => <div className="item" key={item}>{item}</div>)}</div> : null}
      {block.options?.length ? <div className="options" role="group" aria-label="Možnosti odpovědi">{block.options.map((option) => <button key={option} type="button" aria-pressed={selectedOption === option} onClick={() => setSelectedOption(option)} className={selectedOption === option ? 'option selected' : 'option'}>{option}</button>)}</div> : null}
      {['open_text', 'exit_ticket'].includes(block.type) ? <label>Odpověď studenta<textarea placeholder="Odpověď studenta…" /></label> : null}
      {block.type === 'reveal' && block.revealText ? <div><button type="button" className="secondary" onClick={() => setRevealed((v) => !v)}>{revealed ? 'Skrýt pointu' : 'Odhalit pointu'}</button>{revealed ? <div className="reveal" role="status">{block.revealText}</div> : null}</div> : null}
      {block.type === 'quiz' && selectedOption && teacherMode && block.correctAnswer ? <div className="reveal" role="status">Správná odpověď: <strong>{block.correctAnswer}</strong></div> : null}
      {block.type === 'timer' ? <div className="timerbox"><strong role="timer" aria-label={`Zbývající čas ${mm}:${ss}`}>{mm}:{ss}</strong><button type="button" className="secondary" onClick={() => setRunning((v) => !v)}>{running ? 'Pauza' : 'Start'}</button><button type="button" className="secondary" onClick={() => { setRunning(false); setSeconds(block.durationMinutes * 60); }}>Reset</button></div> : null}
      {teacherMode && block.teacherNote ? <details><summary>Poznámka pro učitele</summary><p>{block.teacherNote}</p></details> : null}
      {typeof block.points === 'number' ? <div className="points">Max. {block.points} bodů</div> : null}
    </article>
  );
}

export default function LessonPreview({ lesson, mode, selectedBlockId, onSelectBlock }: { lesson: Lesson; mode: 'teacher' | 'student'; selectedBlockId: string | null; onSelectBlock: (id: string) => void }) {
  const [studentPreviewIndex, setStudentPreviewIndex] = useState(0);
  const sum = lesson.blocks.reduce((total, block) => total + block.durationMinutes, 0);
  const starts = useMemo(() => lesson.blocks.map((_, index) => lesson.blocks.slice(0, index).reduce((total, block) => total + block.durationMinutes, 0)), [lesson.blocks]);

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
            <span className="eyebrow">Studentský náhled</span>
            <p>Takto student uvidí vždy jen právě aktivní část hodiny.</p>
          </div>
          <span className="student-preview-counter">{studentPreviewIndex + 1} / {lesson.blocks.length}</span>
        </div>

        <div className="student-preview-device">
          <div className="student-preview-device-head">
            <div>
              <span className="student-preview-name">Syllonaut</span>
              <strong>{lesson.title}</strong>
            </div>
            <span>{studentPreviewIndex + 1}/{lesson.blocks.length}</span>
          </div>
          <div
            className="student-progress-track"
            role="progressbar"
            aria-label="Průběh studentského náhledu"
            aria-valuemin={1}
            aria-valuemax={lesson.blocks.length}
            aria-valuenow={studentPreviewIndex + 1}
            aria-valuetext={`Blok ${studentPreviewIndex + 1} z ${lesson.blocks.length}`}
          >
            <div className="student-progress-fill" style={{ width: `${studentProgress}%` }} />
          </div>
          {studentBlock ? <Block block={studentBlock} index={studentPreviewIndex} teacherMode={false} selected={false} onSelect={() => {}} /> : null}
          <div className="student-preview-nav">
            <button type="button" className="secondary" disabled={studentPreviewIndex === 0} onClick={() => setStudentPreviewIndex((index) => Math.max(0, index - 1))}>← Předchozí</button>
            <button type="button" className="primary" disabled={studentPreviewIndex >= lesson.blocks.length - 1} onClick={() => setStudentPreviewIndex((index) => Math.min(lesson.blocks.length - 1, index + 1))}>Další →</button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="preview">
      <div className="preview-header">
        <span className="eyebrow">Učitelský náhled</span>
        <h2>{lesson.title}</h2>
        {lesson.subtitle ? <p>{lesson.subtitle}</p> : null}
        <div className="meta"><span>{lesson.audience}</span><span>{lesson.groupSize}</span><span>{sum} min</span><span>{lesson.blocks.length} aktivit</span></div>
      </div>

      <div className="lesson-route" aria-label="Průběh lekce">
        {lesson.blocks.map((block, index) => (
          <button
            type="button"
            key={block.id}
            className={`lesson-route-stop lesson-route-stop-${block.type}${selectedBlockId === block.id ? ' active' : ''}`}
            aria-pressed={selectedBlockId === block.id}
            onClick={() => onSelectBlock(block.id)}
            title={`${index + 1}. ${block.title} · ${block.durationMinutes} min`}
          >
            <span className="lesson-route-index">{index + 1}</span>
            <span className="lesson-route-label">{shortLabel(block.type)}</span>
            <span className="lesson-route-time">{block.durationMinutes}m</span>
          </button>
        ))}
      </div>

      <div className="objectives"><strong>Po lekci studenti zvládnou:</strong><ul>{lesson.learningObjectives.map((o) => <li key={o}>{o}</li>)}</ul></div>
      <div className="lesson-list">{lesson.blocks.map((block, index) => <Block key={block.id} block={block} index={index} teacherMode selected={selectedBlockId === block.id} onSelect={() => onSelectBlock(block.id)} startMinute={starts[index]} />)}</div>
    </div>
  );
}
