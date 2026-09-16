'use client';

import { useEffect, useState } from 'react';
import type { PublicLessonBlock } from '@/lib/live';

type Props = {
  sessionId: string;
  block: PublicLessonBlock;
  teamName: string;
  response: { text: string; updatedByParticipantId: string | null } | null;
  onSaved: () => void;
};

export default function TeamTaskResponseInput({ sessionId, block, teamName, response, onSaved }: Props) {
  const [text, setText] = useState(response?.text ?? '');
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    setText(response?.text ?? '');
  }, [response?.text, block.id]);

  async function submit() {
    if (busy || !text.trim()) return;
    setBusy(true);
    setSaved(false);
    setError('');
    try {
      const result = await fetch(`/api/student/sessions/${sessionId}/team-response`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ blockId: block.id, text: text.trim() }),
      });
      const data = await result.json() as { error?: string };
      if (!result.ok) throw new Error(data.error || 'Týmovou odpověď se nepodařilo uložit.');
      setSaved(true);
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Týmovou odpověď se nepodařilo uložit.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="panel">
      <span className="eyebrow">Společná odpověď · {teamName}</span>
      <p className="muted-copy" style={{ marginTop: 8 }}>Toto pole sdílí celý tým. Kdokoli z týmu může odpověď upravit, dokud učitel nepřejde dál.</p>
      <textarea
        value={text}
        onChange={(event) => { setText(event.target.value); setSaved(false); }}
        maxLength={4000}
        rows={7}
        placeholder="Zapište společný výstup týmu…"
        disabled={busy}
        style={{ marginTop: 12 }}
      />
      <div className="actions">
        <button type="button" className="primary" disabled={busy || !text.trim()} onClick={() => void submit()}>
          {busy ? 'Ukládám…' : response ? 'Uložit změnu' : 'Odeslat týmovou odpověď'}
        </button>
      </div>
      {saved ? <p className="muted-copy" style={{ marginBottom: 0 }}>Týmová odpověď je uložená.</p> : null}
      {error ? <div className="error" style={{ marginTop: 10 }}>{error}</div> : null}
    </section>
  );
}
