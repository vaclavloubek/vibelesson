'use client';

import { useEffect, useMemo, useState } from 'react';
import type { FormEvent } from 'react';
import type { PublicLessonBlock, StudentAnswer } from '@/lib/live';

type Props = {
  sessionId: string;
  block: PublicLessonBlock;
  response: StudentAnswer | null;
  onSaved: (answer: StudentAnswer) => void;
};

const SAVE_TIMEOUT_MS = 8_000;
const VERIFY_TIMEOUT_MS = 5_000;

async function fetchWithTimeout(input: RequestInfo | URL, init: RequestInit, timeoutMs: number) {
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(input, { ...init, signal: controller.signal });
  } finally {
    window.clearTimeout(timer);
  }
}

function sameAnswer(left: StudentAnswer, right: StudentAnswer) {
  return JSON.stringify(left) === JSON.stringify(right);
}

export default function StudentResponseInput({ sessionId, block, response, onSaved }: Props) {
  const initialText = response && 'text' in response ? response.text ?? '' : '';
  const initialRanking = response && 'ranking' in response ? response.ranking : (block.items ?? []);
  const initialRankingText = response && 'ranking' in response ? response.text ?? '' : '';

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);
  const [text, setText] = useState(initialText);
  const [ranking, setRanking] = useState<string[]>(initialRanking);
  const [rankingText, setRankingText] = useState(initialRankingText);
  const [recentlyMoved, setRecentlyMoved] = useState<string | null>(null);
  const [moveStatus, setMoveStatus] = useState('');

  useEffect(() => {
    if (!recentlyMoved) return;
    const timer = window.setTimeout(() => setRecentlyMoved(null), 650);
    return () => window.clearTimeout(timer);
  }, [recentlyMoved]);

  const rankingChanged = useMemo(() => {
    if (!(response && 'ranking' in response)) return true;
    return response.ranking.join('\u0000') !== ranking.join('\u0000') || response.text !== rankingText;
  }, [ranking, rankingText, response]);

  async function save(answer: StudentAnswer) {
    if (busy) return;
    setBusy(true);
    setError('');
    setSaved(false);
    try {
      const result = await fetchWithTimeout(`/api/student/sessions/${sessionId}/response`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ blockId: block.id, answer }),
      }, SAVE_TIMEOUT_MS);
      const data = await result.json() as { answer?: StudentAnswer; error?: string };
      if (!result.ok || !data.answer) {
        setError(data.error || 'Odpověď se nepodařilo uložit.');
        return;
      }
      onSaved(data.answer);
      setSaved(true);
    } catch {
      try {
        const verification = await fetchWithTimeout(`/api/student/sessions/${sessionId}`, {
          cache: 'no-store',
        }, VERIFY_TIMEOUT_MS);
        const state = await verification.json() as {
          activeBlock?: { id?: string } | null;
          myResponse?: StudentAnswer | null;
        };
        if (verification.ok && state.activeBlock?.id === block.id && state.myResponse && sameAnswer(state.myResponse, answer)) {
          onSaved(state.myResponse);
          setSaved(true);
          return;
        }
      } catch {
        // The connection is still unavailable. Let the user retry without keeping the UI stuck.
      }
      setError('Spojení se při ukládání přerušilo. Zkus odpověď odeslat znovu.');
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
        {saved ? <p className="student-save-success">✓ Odpověď je uložená.</p> : null}
        {error ? <div className="error">{error}</div> : null}
      </section>
    );
  }

  if (block.type === 'ranking') {
    function move(index: number, delta: -1 | 1) {
      const target = index + delta;
      if (target < 0 || target >= ranking.length) return;
      const movedItem = ranking[index];
      setRanking((current) => {
        const next = [...current];
        [next[index], next[target]] = [next[target], next[index]];
        return next;
      });
      setRecentlyMoved(movedItem);
      setMoveStatus(`${movedItem} je teď na ${target + 1}. místě.`);
      setSaved(false);
    }

    function submitRanking(event: FormEvent) {
      event.preventDefault();
      const explanation = rankingText.trim();
      if (!explanation) return;
      void save({ ranking, text: explanation });
    }

    const sourceItems = block.items ?? [];

    return (
      <section className="panel">
        <span className="eyebrow">Tvoje pořadí</span>
        <p className="muted-copy">Seřaď všechny položky od 1. místa dolů. Každá má vlastní jemný odstín, takže ji můžeš při přesouvání snadno sledovat.</p>
        {ranking.length >= 2 ? (
          <form onSubmit={submitRanking} style={{ display: 'grid', gap: 12, marginTop: 14 }}>
            <div className="ranking-list">
              {ranking.map((item, index) => {
                const sourceIndex = sourceItems.indexOf(item);
                const tone = (sourceIndex >= 0 ? sourceIndex : index) % 5;
                return (
                  <div
                    className={`ranking-item ranking-item-tone-${tone}${recentlyMoved === item ? ' ranking-item--moved' : ''}`}
                    key={item}
                  >
                    <strong className="ranking-position">{index + 1}.</strong>
                    <span className="ranking-copy">{item}</span>
                    <div className="ranking-controls">
                      <button type="button" className="secondary" aria-label={`Posunout ${item} nahoru`} disabled={busy || index === 0} onClick={() => move(index, -1)}>↑</button>
                      <button type="button" className="secondary" aria-label={`Posunout ${item} dolů`} disabled={busy || index === ranking.length - 1} onClick={() => move(index, 1)}>↓</button>
                    </div>
                  </div>
                );
              })}
            </div>
            <p className="ranking-move-status" aria-live="polite">{moveStatus}</p>
            <label>
              Krátké zdůvodnění (povinné)
              <textarea
                value={rankingText}
                onChange={(event) => { setRankingText(event.target.value); setSaved(false); }}
                maxLength={2000}
                rows={4}
                placeholder="Jednou až dvěma větami vysvětli, proč je první volba silnější nebo relevantnější než poslední…"
                disabled={busy}
              />
            </label>
            <div className="actions" style={{ marginTop: 0 }}>
              <button type="submit" className="primary" disabled={busy || !rankingChanged || !rankingText.trim()}>{busy ? 'Ukládám…' : response ? 'Uložit změnu' : 'Odeslat pořadí'}</button>
            </div>
          </form>
        ) : <div className="error" style={{ marginTop: 12 }}>Tento blok nemá dost položek k seřazení.</div>}
        {saved ? <p className="student-save-success">✓ Pořadí i zdůvodnění jsou uložené.</p> : null}
        {error ? <div className="error" style={{ marginTop: 10 }}>{error}</div> : null}
      </section>
    );
  }

  if (block.type === 'open_text' || block.type === 'exit_ticket') {
    function submit(event: FormEvent) {
      event.preventDefault();
      void save({ text: text.trim() });
    }

    const isExit = block.type === 'exit_ticket';
    return (
      <section className="panel">
        <span className="eyebrow">{isExit ? 'Tvoje závěrečná odpověď' : 'Tvoje odpověď'}</span>
        <form onSubmit={submit} style={{ display: 'grid', gap: 12, marginTop: 10 }}>
          <textarea
            value={text}
            onChange={(event) => { setText(event.target.value); setSaved(false); }}
            maxLength={2000}
            rows={isExit ? 4 : 6}
            placeholder={isExit ? 'Napiš krátkou závěrečnou odpověď…' : 'Napiš svou odpověď…'}
            disabled={busy}
            style={{ width: '100%', resize: 'vertical', minHeight: isExit ? 100 : 130, padding: 14, borderRadius: 12, border: '1px solid var(--line)', font: 'inherit' }}
          />
          <div className="actions" style={{ marginTop: 0 }}>
            <button type="submit" className="primary" disabled={busy || !text.trim()}>{busy ? 'Ukládám…' : response ? 'Uložit změnu' : 'Odeslat odpověď'}</button>
          </div>
        </form>
        {saved ? <p className="student-save-success">✓ Odpověď je uložená. Můžeš ji ještě upravit, dokud učitel nepřejde dál.</p> : null}
        {error ? <div className="error" style={{ marginTop: 10 }}>{error}</div> : null}
      </section>
    );
  }

  return null;
}
