'use client';

import { useEffect, useMemo, useState } from 'react';
import type { FormEvent } from 'react';
import type { PublicLessonBlock, StudentAnswer } from '@/lib/live';
import { LIVE_OUTBOX_FAILED_EVENT, LIVE_OUTBOX_SYNCED_EVENT, queueLiveRequest, removeLiveOutbox } from '@/lib/live-offline';

type Props = {
  sessionId: string;
  block: PublicLessonBlock;
  response: StudentAnswer | null;
  responseSubmitted: boolean;
  onSaved: (answer: StudentAnswer, submittedCurrent?: boolean) => void;
};

type ResponseAction = 'save' | 'submit';

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

export default function StudentResponseInput({ sessionId, block, response, responseSubmitted, onSaved }: Props) {
  const initialText = response && 'text' in response ? response.text ?? '' : '';
  const initialRanking = response && 'ranking' in response ? response.ranking : (block.items ?? []);
  const initialRankingText = response && 'ranking' in response ? response.text ?? '' : '';

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);
  const [queued, setQueued] = useState(false);
  const [submitted, setSubmitted] = useState(responseSubmitted);
  const [text, setText] = useState(initialText);
  const [ranking, setRanking] = useState<string[]>(initialRanking);
  const [rankingText, setRankingText] = useState(initialRankingText);
  const [recentlyMoved, setRecentlyMoved] = useState<string | null>(null);
  const [moveStatus, setMoveStatus] = useState('');

  useEffect(() => {
    setSubmitted(responseSubmitted);
  }, [responseSubmitted]);

  useEffect(() => {
    const prefix = `student-response:${sessionId}:${block.id}:`;
    const synced = (event: Event) => {
      const id = (event as CustomEvent<{ id?: string }>).detail?.id;
      if (id?.startsWith(prefix)) setQueued(false);
    };
    const failed = (event: Event) => {
      const id = (event as CustomEvent<{ id?: string }>).detail?.id;
      if (id?.startsWith(prefix)) {
        setQueued(false);
        setError('Lokálně uloženou odpověď se po obnovení spojení nepodařilo přijmout. Zkontroluj aktuální úkol.');
      }
    };
    window.addEventListener(LIVE_OUTBOX_SYNCED_EVENT, synced);
    window.addEventListener(LIVE_OUTBOX_FAILED_EVENT, failed);
    return () => {
      window.removeEventListener(LIVE_OUTBOX_SYNCED_EVENT, synced);
      window.removeEventListener(LIVE_OUTBOX_FAILED_EVENT, failed);
    };
  }, [block.id, sessionId]);

  useEffect(() => {
    if (!recentlyMoved) return;
    const timer = window.setTimeout(() => setRecentlyMoved(null), 650);
    return () => window.clearTimeout(timer);
  }, [recentlyMoved]);

  const rankingChanged = useMemo(() => {
    if (!(response && 'ranking' in response)) return true;
    return response.ranking.join('\u0000') !== ranking.join('\u0000') || response.text !== rankingText;
  }, [ranking, rankingText, response]);

  const serverText = response && 'text' in response ? response.text ?? '' : '';
  const textChanged = text.trim() !== serverText.trim();

  async function save(answer: StudentAnswer, responseAction: ResponseAction = 'save') {
    if (busy) return;
    const outboxId = `student-response:${sessionId}:${block.id}:${responseAction}`;
    setBusy(true);
    setError('');
    setSaved(false);
    try {
      const result = await fetchWithTimeout(`/api/student/sessions/${sessionId}/response`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ blockId: block.id, answer, responseAction }),
      }, SAVE_TIMEOUT_MS);
      const data = await result.json() as {
        answer?: StudentAnswer;
        submittedCurrent?: boolean;
        error?: string;
      };
      if (!result.ok || !data.answer) {
        setError(data.error || 'Odpověď se nepodařilo uložit.');
        return;
      }
      const submittedCurrent = Boolean(data.submittedCurrent);
      void removeLiveOutbox(outboxId).catch(() => undefined);
      setQueued(false);
      onSaved(data.answer, submittedCurrent);
      if (block.type === 'open_text' || block.type === 'exit_ticket') setSubmitted(submittedCurrent);
      setSaved(true);
    } catch {
      try {
        const verification = await fetchWithTimeout(`/api/student/sessions/${sessionId}`, {
          cache: 'no-store',
        }, VERIFY_TIMEOUT_MS);
        const state = await verification.json() as {
          activeBlock?: { id?: string } | null;
          myResponse?: StudentAnswer | null;
          myResponseSubmitted?: boolean;
        };
        if (verification.ok && state.activeBlock?.id === block.id && state.myResponse && sameAnswer(state.myResponse, answer)) {
          onSaved(state.myResponse, Boolean(state.myResponseSubmitted));
          if (block.type === 'open_text' || block.type === 'exit_ticket') setSubmitted(Boolean(state.myResponseSubmitted));
          setSaved(true);
          return;
        }
      } catch {
        // The connection is still unavailable. Let the user retry without keeping the UI stuck.
      }
      try {
        await queueLiveRequest({
          id: outboxId,
          sessionId,
          kind: 'student-response',
          url: `/api/student/sessions/${sessionId}/response`,
          method: 'POST',
          body: { blockId: block.id, answer, responseAction },
        });
        onSaved(answer, false);
        if (block.type === 'open_text' || block.type === 'exit_ticket') setSubmitted(false);
        setSaved(true);
        setQueued(true);
        setError('');
        return;
      } catch {
        setError('Spojení se při ukládání přerušilo a lokální úložiště není dostupné. Odpověď zatím zůstává jen v tomto formuláři.');
      }
    } finally {
      setBusy(false);
    }
  }

  if (block.type === 'poll' || block.type === 'quiz') {
    const selected = response && 'choice' in response ? response.choice : null;
    const options = block.options ?? [];
    return (
      <section className="panel" style={{ display: 'grid', gap: 12 }} aria-busy={busy}>
        <div>
          <span className="eyebrow">Tvoje odpověď</span>
          <p className="muted-copy" style={{ marginBottom: 0 }}>Vyber jednu možnost. Odpověď můžeš změnit, dokud učitel nepřejde dál.</p>
        </div>
        {options.length ? (
          <div style={{ display: 'grid', gap: 10 }} role="group" aria-label="Možnosti odpovědi">
            {options.map((option) => (
              <button
                type="button"
                key={option}
                className={selected === option ? 'primary' : 'secondary'}
                aria-pressed={selected === option}
                disabled={busy}
                onClick={() => void save({ choice: option })}
                style={{ textAlign: 'left', justifyContent: 'flex-start', whiteSpace: 'normal', height: 'auto', minHeight: 48 }}
              >
                {option}
              </button>
            ))}
          </div>
        ) : <div className="error" role="alert">Tento blok nemá žádné možnosti odpovědi.</div>}
        {queued ? <p className="student-save-success" role="status" aria-live="polite">✓ Odpověď je uložená v tomto zařízení a odešle se po obnovení spojení.</p> : saved ? <p className="student-save-success" role="status" aria-live="polite">✓ Odpověď je uložená.</p> : null}
        {error ? <div className="error" role="alert">{error}</div> : null}
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
      <section className="panel" aria-busy={busy}>
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
        ) : <div className="error" role="alert" style={{ marginTop: 12 }}>Tento blok nemá dost položek k seřazení.</div>}
        {saved ? <p className="student-save-success" role="status" aria-live="polite">✓ Pořadí i zdůvodnění jsou uložené.</p> : null}
        {error ? <div className="error" role="alert" style={{ marginTop: 10 }}>{error}</div> : null}
      </section>
    );
  }

  if (block.type === 'open_text' || block.type === 'exit_ticket') {
    function submit(event: FormEvent) {
      event.preventDefault();
      const value = text.trim();
      if (!value) return;
      void save({ text: value }, 'submit');
    }

    const isExit = block.type === 'exit_ticket';
    return (
      <section className="panel" aria-busy={busy}>
        <span className="eyebrow">{isExit ? 'Tvoje závěrečná odpověď' : 'Tvoje odpověď'}</span>
        <p className="muted-copy" style={{ marginTop: 8, marginBottom: 0 }}>Text můžeš průběžně ukládat jako koncept. AI hodnocení se zařadí až ve chvíli, kdy odpověď odevzdáš.</p>
        <form onSubmit={submit} style={{ display: 'grid', gap: 12, marginTop: 10 }}>
          <label>
            {isExit ? 'Závěrečná odpověď' : 'Odpověď'}
            <textarea
              value={text}
              onChange={(event) => { setText(event.target.value); setSaved(false); setSubmitted(false); }}
              maxLength={2000}
              rows={isExit ? 4 : 6}
              placeholder={isExit ? 'Napiš krátkou závěrečnou odpověď…' : 'Napiš svou odpověď…'}
              disabled={busy}
              style={{ width: '100%', resize: 'vertical', minHeight: isExit ? 100 : 130, padding: 14, borderRadius: 12, border: '1px solid var(--line)', font: 'inherit' }}
            />
          </label>
          <div className="actions" style={{ marginTop: 0 }}>
            <button
              type="button"
              className="secondary"
              disabled={busy || !text.trim() || !textChanged}
              onClick={() => { void save({ text: text.trim() }, 'save'); }}
            >
              {busy ? 'Ukládám…' : 'Uložit koncept'}
            </button>
            <button type="submit" className="primary" disabled={busy || !text.trim() || submitted}>
              {busy ? 'Odevzdávám…' : submitted ? 'Odevzdáno' : 'Odevzdat odpověď'}
            </button>
          </div>
        </form>
        {submitted ? (
          <p className="student-save-success" role="status" aria-live="polite">✓ Odpověď je odevzdaná. Můžeš ji dál upravovat jako koncept, dokud učitel nepřejde dál.</p>
        ) : saved ? (
          <p className="student-save-success" role="status" aria-live="polite">✓ Koncept je uložený. Pro hodnocení odpověď ještě odevzdej.</p>
        ) : null}
        {error ? <div className="error" role="alert" style={{ marginTop: 10 }}>{error}</div> : null}
      </section>
    );
  }

  return null;
}
