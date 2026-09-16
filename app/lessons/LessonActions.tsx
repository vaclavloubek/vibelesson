'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

type Props = {
  lessonId: string;
  title: string;
};

export default function LessonActions({ lessonId, title }: Props) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function renameLesson() {
    const nextTitle = window.prompt('Nový název lekce:', title)?.trim();
    if (!nextTitle || nextTitle === title) return;

    setBusy(true);
    setError('');
    try {
      const res = await fetch(`/api/lessons/${lessonId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: nextTitle }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Přejmenování selhalo.');
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Přejmenování selhalo.');
    } finally {
      setBusy(false);
    }
  }

  async function duplicateLesson() {
    setBusy(true);
    setError('');
    try {
      const res = await fetch(`/api/lessons/${lessonId}`, { method: 'POST' });
      const data = await res.json();
      if (!res.ok || !data.lessonId) throw new Error(data.error || 'Duplikace selhala.');
      router.push(`/lessons/${data.lessonId}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Duplikace selhala.');
      setBusy(false);
    }
  }

  async function deleteLesson() {
    if (!window.confirm(`Opravdu smazat lekci „${title}“? Tuto akci zatím nelze vrátit.`)) return;

    setBusy(true);
    setError('');
    try {
      const res = await fetch(`/api/lessons/${lessonId}`, { method: 'DELETE' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Smazání selhalo.');
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Smazání selhalo.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="lesson-actions-wrap">
      <details className="lesson-actions">
        <summary aria-label={`Akce pro lekci ${title}`}>•••</summary>
        <div className="lesson-actions-menu">
          <button type="button" onClick={renameLesson} disabled={busy}>Přejmenovat</button>
          <button type="button" onClick={duplicateLesson} disabled={busy}>Duplikovat</button>
          <button type="button" className="danger-action" onClick={deleteLesson} disabled={busy}>Smazat</button>
        </div>
      </details>
      {error ? <span className="lesson-action-error">{error}</span> : null}
    </div>
  );
}
