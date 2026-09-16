'use client';

import { useEffect, useState } from 'react';
import type { Lesson, LessonBlock } from '@/lib/schema';

function label(type: LessonBlock['type']) {
  const labels: Record<LessonBlock['type'], string> = {
    intro: 'Úvod',
    team_task: 'Týmová mise',
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

function Block({ block, index, teacherMode, selected, onSelect }: { block: LessonBlock; index: number; teacherMode: boolean; selected: boolean; onSelect: () => void }) {
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
    <article className={`lesson-block ${selected ? 'selected-block' : ''}`}>
      {teacherMode ? <button type="button" className="edit-block" onClick={onSelect}>{selected ? 'Vybráno k úpravě' : 'Upravit blok'}</button> : null}
      <div className="block-head">
        <div><span className="eyebrow">{index + 1}. {label(block.type)}</span><h3>{block.title}</h3></div>
        <span className="duration">{block.durationMinutes} min</span>
      </div>
      <p className="instructions">{block.instructions}</p>
      {block.items?.length ? <div className="items">{block.items.map((item) => <div className="item" key={item}>{item}</div>)}</div> : null}
      {block.options?.length ? <div className="options">{block.options.map((option) => <button key={option} type="button" onClick={() => setSelectedOption(option)} className={selectedOption === option ? 'option selected' : 'option'}>{option}</button>)}</div> : null}
      {['open_text', 'exit_ticket'].includes(block.type) ? <textarea placeholder="Odpověď studenta…" /> : null}
      {block.type === 'reveal' && block.revealText ? <div><button type="button" className="secondary" onClick={() => setRevealed((v) => !v)}>{revealed ? 'Skrýt pointu' : 'Odhalit pointu'}</button>{revealed ? <div className="reveal">{block.revealText}</div> : null}</div> : null}
      {block.type === 'quiz' && selectedOption && teacherMode && block.correctAnswer ? <div className="reveal">Správná odpověď: <strong>{block.correctAnswer}</strong></div> : null}
      {block.type === 'timer' ? <div className="timerbox"><strong>{mm}:{ss}</strong><button type="button" className="secondary" onClick={() => setRunning((v) => !v)}>{running ? 'Pauza' : 'Start'}</button><button type="button" className="secondary" onClick={() => { setRunning(false); setSeconds(block.durationMinutes * 60); }}>Reset</button></div> : null}
      {teacherMode && block.teacherNote ? <details><summary>Poznámka pro učitele</summary><p>{block.teacherNote}</p></details> : null}
      {typeof block.points === 'number' ? <div className="points">Max. {block.points} bodů</div> : null}
    </article>
  );
}

export default function LessonPreview({ lesson, mode, selectedBlockId, onSelectBlock }: { lesson: Lesson; mode: 'teacher' | 'student'; selectedBlockId: string | null; onSelectBlock: (id: string) => void }) {
  const sum = lesson.blocks.reduce((total, block) => total + block.durationMinutes, 0);
  return (
    <div className="preview">
      <div className="preview-header">
        <span className="eyebrow">{mode === 'teacher' ? 'Učitelský náhled' : 'Studentská aplikace'}</span>
        <h2>{lesson.title}</h2>
        {lesson.subtitle ? <p>{lesson.subtitle}</p> : null}
        <div className="meta"><span>{lesson.audience}</span><span>{lesson.groupSize}</span><span>{sum} min</span></div>
      </div>
      {mode === 'teacher' ? <div className="objectives"><strong>Po lekci studenti zvládnou:</strong><ul>{lesson.learningObjectives.map((o) => <li key={o}>{o}</li>)}</ul></div> : null}
      <div className="lesson-list">{lesson.blocks.map((block, index) => <Block key={block.id} block={block} index={index} teacherMode={mode === 'teacher'} selected={selectedBlockId === block.id} onSelect={() => onSelectBlock(block.id)} />)}</div>
    </div>
  );
}
