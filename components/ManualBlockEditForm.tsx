'use client';

import { FormEvent, useRef, useState } from 'react';
import type { ManualBlockEdit } from '@/lib/manual-block-edit';
import type { LessonBlock } from '@/lib/schema';

type Props = {
  block: LessonBlock;
  busy: boolean;
  english: boolean;
  onSave: (edit: ManualBlockEdit) => Promise<void>;
  onCancel: () => void;
};

const listStyle = { border: 0, margin: 0, padding: 0, display: 'grid', gap: 6 } as const;

export default function ManualBlockEditForm({ block, busy, english, onSave, onCancel }: Props) {
  const ui = (cs: string, en: string) => english ? en : cs;
  const submittingRef = useRef(false);
  const [title, setTitle] = useState(block.title);
  const [instructions, setInstructions] = useState(block.instructions);
  const [duration, setDuration] = useState(String(block.durationMinutes));
  const [items, setItems] = useState(block.items ?? []);
  const [options, setOptions] = useState(block.options ?? []);
  const [revealText, setRevealText] = useState(block.revealText ?? '');
  const [teacherNote, setTeacherNote] = useState(block.teacherNote ?? '');
  const correctIndex = block.correctAnswer !== undefined ? (block.options ?? []).indexOf(block.correctAnswer) : -1;

  const edit: ManualBlockEdit = {
    title,
    instructions,
    durationMinutes: Number(duration),
    ...(block.items ? { items } : {}),
    ...(block.options ? { options } : {}),
    ...(block.revealText !== undefined ? { revealText } : {}),
    teacherNote,
  };
  const dirty = title !== block.title
    || instructions !== block.instructions
    || Number(duration) !== block.durationMinutes
    || items.some((item, index) => item !== block.items?.[index])
    || options.some((option, index) => option !== block.options?.[index])
    || revealText !== (block.revealText ?? '')
    || teacherNote !== (block.teacherNote ?? '');

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (busy || submittingRef.current || !dirty) return;
    submittingRef.current = true;
    try {
      await onSave(edit);
    } finally {
      submittingRef.current = false;
    }
  }

  return (
    <form onSubmit={submit}>
      <label>{ui('Název aktivity', 'Activity title')}<input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={300} required /></label>
      <label>{ui('Zadání', 'Instructions')}<textarea value={instructions} onChange={(e) => setInstructions(e.target.value)} maxLength={10000} required /></label>
      <label>{ui('Minutáž (min)', 'Duration (min)')}<input type="number" inputMode="numeric" min={1} max={60} step={1} value={duration} onChange={(e) => setDuration(e.target.value)} required /></label>
      {block.items ? (
        <fieldset style={listStyle}>
          <legend>{ui('Položky', 'Items')}</legend>
          {items.map((item, index) => (
            <input key={index} value={item} onChange={(e) => setItems(items.map((value, i) => i === index ? e.target.value : value))} aria-label={ui(`Položka ${index + 1}`, `Item ${index + 1}`)} maxLength={2000} required />
          ))}
        </fieldset>
      ) : null}
      {block.options ? (
        <fieldset style={listStyle}>
          <legend>{ui('Možnosti odpovědi', 'Answer options')}</legend>
          {options.map((option, index) => (
            <label key={index}>
              {index === correctIndex ? ui(`Možnost ${index + 1} · správná odpověď`, `Option ${index + 1} · correct answer`) : ui(`Možnost ${index + 1}`, `Option ${index + 1}`)}
              <input value={option} onChange={(e) => setOptions(options.map((value, i) => i === index ? e.target.value : value))} maxLength={2000} required />
            </label>
          ))}
          {block.type === 'quiz' ? <p className="muted-copy" style={{ margin: 0 }}>{ui('Správnou odpověď a body mění jen úprava s AI.', 'Only an AI edit changes the correct answer and points.')}</p> : null}
        </fieldset>
      ) : null}
      {block.revealText !== undefined ? (
        <label>{ui('Pointa (prázdné pole ji odstraní)', 'Reveal (leave empty to remove it)')}<textarea value={revealText} onChange={(e) => setRevealText(e.target.value)} maxLength={10000} /></label>
      ) : null}
      <label>{ui('Poznámka pro učitele (prázdné pole ji odstraní)', 'Teacher note (leave empty to remove it)')}<textarea value={teacherNote} onChange={(e) => setTeacherNote(e.target.value)} maxLength={10000} /></label>
      <div className="actions">
        <button className="primary" disabled={busy || !dirty}>{busy ? ui('Ukládám…', 'Saving…') : ui('Uložit změny', 'Save changes')}</button>
        <button type="button" className="secondary" onClick={onCancel} disabled={busy}>{ui('Zrušit', 'Cancel')}</button>
      </div>
    </form>
  );
}
