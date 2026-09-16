'use client';

import { FormEvent, useState } from 'react';
import type { PublicLessonBlock, StudentAnswer } from '@/lib/live';

type Props = {
  sessionId: string;
  block: PublicLessonBlock;
  response: StudentAnswer | null;
  onSaved: (answer: StudentAnswer) => void;
};

export default function StudentResponseInput({ sessionId, block, response, onSaved }: Props) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);
  const [text, setText] = useState('text' in (response ?? {}) ? (response as { text: string }).text : '');

  async function save(answer: StudentAnswer) {
    if (busy) return;
    setBusy(true);
    setError('');
    setSaved(false);
    try {
      const result = await fetch(`/api/student/sessions/${sessionId}/response`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ blockId: block.id, answer }),
      });
      const data = await result.json() as { answer?: StudentAnswer; error?: string };
      if (!result.ok || !data.answer) throw new Error(data.error || 'Odpověď se nepodařilo uložit.');
      onSaved(data.answer);
      setSaved(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Odpověď se nepodařilo uložit.');
    } finally {
      setBusy(false);
    }
  }

  if (block.type === 'poll' || block.type === 'quiz') {
    const selected = response && 'choice' in response ? response.choice : null;
    const options = block.options ?? [];
    return (
      <section className="panel" style={{ display: 'grid', gap: 12 }}>
        <div>
          <span className="eyebrow">Tvoje odpověď</span>
          <p className="muted-copy" style={{ marginBottom: 0 }}>Vyber jednu možnost. Odpověď můžeš změnit, dokud učitel nepřejde dál.</p>
        </div>
        {options.length ? (
          <div style={{ display: 'grid', gap: 10 }}>
            {options.map((option) => (
              <button
                type="button"
                key={option}
                className={selected === option ? 'primary' : 'secondary'}
                disabled={busy}
                onClick={() => void save({ choice: option })}
                style={{ textAlign: 'left', justifyContent: 'flex-start', whiteSpace: 'normal', height: 'auto', minHeight: 48 }}
              >
                {option}
              </button>
            ))}
          </div>
        ) : <div className="error">Tento blok nemá žádné možnosti odpovědi.</div>}
        {saved ? <p className="muted-copy" style={{ margin: 0 }}>Odpověď je uložená.</p> : null}
        {error ? <div className="error">{error}</div> : null}
      </section>
    );
  }

  if (block.type === 'open_text') {
    function submit(event: FormEvent) {
      event.preventDefault();
      void save({ text: text.trim() });
    }

    return (
      <section className="panel">
        <span className="eyebrow">Tvoje odpověď</span>
        <form onSubmit={submit} style={{ display: 'grid', gap: 12, marginTop: 10 }}>
          <textarea
            value={text}
            onChange={(event) => { setText(event.target.value); setSaved(false); }}
            maxLength={2000}
            rows={6}
            placeholder="Napiš svou odpověď…"
            disabled={busy}
            style={{ width: '100%', resize: 'vertical', minHeight: 130, padding: 14, borderRadius: 12, border: '1px solid var(--border)', font: 'inherit' }}
          />
          <div className="actions" style={{ marginTop: 0 }}>
            <button type="submit" className="primary" disabled={busy || !text.trim()}>{busy ? 'Ukládám…' : response ? 'Uložit změnu' : 'Odeslat odpověď'}</button>
          </div>
        </form>
        {saved ? <p className="muted-copy" style={{ marginBottom: 0 }}>Odpověď je uložená. Můžeš ji ještě upravit, dokud učitel nepřejde dál.</p> : null}
        {error ? <div className="error" style={{ marginTop: 10 }}>{error}</div> : null}
      </section>
    );
  }

  return null;
}
