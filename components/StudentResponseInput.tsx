'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import type { PublicLessonBlock, StudentAnswer } from '@/lib/live';
import { enqueueLiveOperation } from '@/lib/live-offline';
import { postLiveControlEvent } from '@/lib/live-control-client';
import { activityMode, trackEvent } from '@/lib/analytics';
import { useUiLocale } from '@/components/LocaleProvider';
import { localizedApiError } from '@/lib/i18n';

type Props = {
  sessionId: string;
  block: PublicLessonBlock;
  response: StudentAnswer | null;
  responseSubmitted: boolean;
  contentLanguage?: string | null;
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

export default function StudentResponseInput({ sessionId, block, response, responseSubmitted, contentLanguage = null, onSaved }: Props) {
  const english = useUiLocale() === 'en';
  const ui = (cs: string, en: string) => english ? en : cs;
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
  const trackedBlockResponsesRef = useRef(new Set<string>());

  useEffect(() => {
    setSubmitted(responseSubmitted);
    if (responseSubmitted) {
      setError('');
      setQueued(false);
      setSaved(true);
    }
  }, [responseSubmitted]);

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

  function trackSubmittedResponse(responseAction: ResponseAction, submittedCurrent: boolean) {
    const explicitSubmit = (block.type === 'ranking' || block.type === 'open_text' || block.type === 'exit_ticket')
      && responseAction === 'submit'
      && submittedCurrent;
    const directSubmit = block.type === 'poll' || block.type === 'quiz';
    if ((!explicitSubmit && !directSubmit) || trackedBlockResponsesRef.current.has(block.id)) return;

    trackedBlockResponsesRef.current.add(block.id);
    trackEvent('activity_response_submitted', {
      activity_type: block.type,
      activity_mode: activityMode(block.type),
    });
  }

  async function save(answer: StudentAnswer, responseAction: ResponseAction = 'save') {
    if (busy) return;
    const operationId = crypto.randomUUID();
    setBusy(true);
    setError('');
    setSaved(false);
    setQueued(false);
    try {
      const result = await fetchWithTimeout(`/api/student/sessions/${sessionId}/response`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ blockId: block.id, answer, responseAction, operationId }),
      }, SAVE_TIMEOUT_MS);
      const data = await result.json() as {
        answer?: StudentAnswer;
        submittedCurrent?: boolean;
        error?: string;
      };
      if (!result.ok || !data.answer) {
        if (result.status === 408 || result.status === 429 || result.status >= 500) {
          throw new Error(data.error || 'Transient response save failure.');
        }
        setError(localizedApiError(data.error, english ? 'en' : 'cs', 'Odpověď se nepodařilo uložit.', 'The answer could not be saved.'));
        return;
      }
      const submittedCurrent = Boolean(data.submittedCurrent);
      onSaved(data.answer, submittedCurrent);
      if (block.type === 'open_text' || block.type === 'exit_ticket' || block.type === 'ranking') setSubmitted(submittedCurrent);
      setSaved(true);
      setQueued(false);
      trackSubmittedResponse(responseAction, submittedCurrent);
      void postLiveControlEvent(
        sessionId,
        'student',
        'student.response',
        { blockId: block.id, answer: data.answer, submitted: submittedCurrent, source: 'primary' },
        operationId,
      );
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
          if (block.type === 'open_text' || block.type === 'exit_ticket' || block.type === 'ranking') setSubmitted(Boolean(state.myResponseSubmitted));
          setSaved(true);
          trackSubmittedResponse(responseAction, Boolean(state.myResponseSubmitted));
          return;
        }
      } catch {
        // The connection is still unavailable. Let the user retry without keeping the UI stuck.
      }
      const liveFallbackSaved = await postLiveControlEvent(
        sessionId,
        'student',
        'student.response',
        { blockId: block.id, answer, submitted: responseAction === 'submit', source: 'fallback' },
        operationId,
      );
      const queuedLocally = await enqueueLiveOperation({
        id: operationId,
        sessionId,
        kind: 'student-response',
        url: `/api/student/sessions/${sessionId}/response`,
        method: 'POST',
        body: { blockId: block.id, answer, responseAction, operationId },
        createdAt: Date.now(),
      });
      if (queuedLocally || liveFallbackSaved) {
        if (liveFallbackSaved) trackSubmittedResponse(responseAction, responseAction === 'submit');
        setQueued(true);
        setError('');
      } else {
        setError(ui('Spojení se při ukládání přerušilo. Zkus odpověď odeslat znovu.', 'The connection was interrupted while saving. Try submitting the answer again.'));
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
          <span className="eyebrow">{ui('Tvoje odpověď', 'Your answer')}</span>
          <p className="muted-copy" style={{ marginBottom: 0 }}>{ui('Vyber jednu možnost. Odpověď můžeš změnit, dokud učitel nepřejde dál.', 'Choose one option. You can change your answer until the teacher moves on.')}</p>
        </div>
        {options.length ? (
          <div style={{ display: 'grid', gap: 10 }} role="group" aria-label={ui('Možnosti odpovědi', 'Answer options')}>
            {options.map((option) => (
              <button
                type="button"
                key={option}
                className={selected === option ? 'primary' : 'secondary'}
                aria-pressed={selected === option}
                disabled={busy}
                onClick={() => void save({ choice: option })}
                style={{ textAlign: 'left', justifyContent: 'flex-start', whiteSpace: 'normal', height: 'auto', minHeight: 48 }}
                lang={contentLanguage ?? undefined}
                dir={contentLanguage ? 'auto' : undefined}
              >
                {option}
              </button>
            ))}
          </div>
        ) : <div className="error" role="alert">{ui('Tento blok nemá žádné možnosti odpovědi.', 'This block has no answer options.')}</div>}
        {saved ? <p className="student-save-success" role="status" aria-live="polite">✓ {ui('Odpověď je uložená.', 'Your answer is saved.')}</p> : null}
        {queued ? <p className="muted-copy" role="status" aria-live="polite">{ui('Odpověď je bezpečně uložená v tomto zařízení a odešle se po obnovení spojení.', 'Your answer is safely stored on this device and will be sent when the connection is restored.')}</p> : null}
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
      setMoveStatus(english ? `${movedItem} is now in position ${target + 1}.` : `${movedItem} je teď na ${target + 1}. místě.`);
      setSaved(false);
      setSubmitted(false);
    }

    function submitRanking(event: FormEvent) {
      event.preventDefault();
      const explanation = rankingText.trim();
      if (!explanation) return;
      void save({ ranking, text: explanation }, 'submit');
    }

    const sourceItems = block.items ?? [];

    return (
      <section className="panel" aria-busy={busy}>
        <span className="eyebrow">{ui('Tvoje pořadí', 'Your ranking')}</span>
        <p className="muted-copy">{ui('Seřaď všechny položky od 1. místa dolů. Každá má vlastní jemný odstín, takže ji můžeš při přesouvání snadno sledovat.', 'Rank all items from first place down. Each item has a subtle shade so it is easier to follow while moving it.')}</p>
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
                    <span className="ranking-copy" lang={contentLanguage ?? undefined} dir={contentLanguage ? 'auto' : undefined}>{item}</span>
                    <div className="ranking-controls">
                      <button type="button" className="secondary" aria-label={english ? `Move ${item} up` : `Posunout ${item} nahoru`} disabled={busy || index === 0} onClick={() => move(index, -1)}>↑</button>
                      <button type="button" className="secondary" aria-label={english ? `Move ${item} down` : `Posunout ${item} dolů`} disabled={busy || index === ranking.length - 1} onClick={() => move(index, 1)}>↓</button>
                    </div>
                  </div>
                );
              })}
            </div>
            <p className="ranking-move-status" aria-live="polite">{moveStatus}</p>
            <label>
              {ui('Krátké zdůvodnění (povinné)', 'Short explanation (required)')}
              <textarea
                value={rankingText}
                onChange={(event) => { setRankingText(event.target.value); setSaved(false); setSubmitted(false); }}
                maxLength={2000}
                rows={4}
                placeholder={ui('Jednou až dvěma větami vysvětli, proč je první volba silnější nebo relevantnější než poslední…', 'In one or two sentences, explain why the first choice is stronger or more relevant than the last…')}
                disabled={busy}
              />
            </label>
            <div className="actions" style={{ marginTop: 0 }}>
              <button type="submit" className="primary" disabled={busy || !rankingChanged || !rankingText.trim()}>{busy ? ui('Ukládám…', 'Saving…') : response ? ui('Uložit změnu', 'Save change') : ui('Odeslat pořadí', 'Submit ranking')}</button>
            </div>
          </form>
        ) : <div className="error" role="alert" style={{ marginTop: 12 }}>{ui('Tento blok nemá dost položek k seřazení.', 'This block does not have enough items to rank.')}</div>}
        {submitted ? <p className="student-save-success" role="status" aria-live="polite">✓ {ui('Pořadí je odevzdané.', 'Your ranking has been submitted.')}</p> : saved ? <p className="student-save-success" role="status" aria-live="polite">✓ {ui('Pořadí i zdůvodnění jsou uložené.', 'The ranking and explanation are saved.')}</p> : null}
        {queued ? <p className="muted-copy" role="status" aria-live="polite">{ui('Pořadí je bezpečně uložené v tomto zařízení a odešle se po obnovení spojení.', 'The ranking is safely stored on this device and will be sent when the connection is restored.')}</p> : null}
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
        <span className="eyebrow">{isExit ? ui('Tvoje závěrečná odpověď', 'Your final answer') : ui('Tvoje odpověď', 'Your answer')}</span>
        <p className="muted-copy" style={{ marginTop: 8, marginBottom: 0 }}>{ui('Text můžeš průběžně ukládat jako koncept. AI hodnocení se zařadí až ve chvíli, kdy odpověď odevzdáš.', 'You can save the text as a draft while working. AI grading is queued only after you submit the answer.')}</p>
        <form onSubmit={submit} style={{ display: 'grid', gap: 12, marginTop: 10 }}>
          <label>
            {isExit ? ui('Závěrečná odpověď', 'Final answer') : ui('Odpověď', 'Answer')}
            <textarea
              value={text}
              onChange={(event) => { setText(event.target.value); setSaved(false); setSubmitted(false); }}
              maxLength={2000}
              rows={isExit ? 4 : 6}
              placeholder={isExit ? ui('Napiš krátkou závěrečnou odpověď…', 'Write a short final answer…') : ui('Napiš svou odpověď…', 'Write your answer…')}
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
              {busy ? ui('Ukládám…', 'Saving…') : ui('Uložit koncept', 'Save draft')}
            </button>
            <button type="submit" className="primary" disabled={busy || !text.trim() || submitted}>
              {busy ? ui('Odevzdávám…', 'Submitting…') : submitted ? ui('Odevzdáno', 'Submitted') : ui('Odevzdat odpověď', 'Submit answer')}
            </button>
          </div>
        </form>
        {submitted ? (
          <p className="student-save-success" role="status" aria-live="polite">✓ {ui('Odpověď je odevzdaná. Můžeš ji dál upravovat jako koncept, dokud učitel nepřejde dál.', 'Your answer has been submitted. You can continue editing it as a draft until the teacher moves on.')}</p>
        ) : saved ? (
          <p className="student-save-success" role="status" aria-live="polite">✓ {ui('Koncept je uložený. Pro hodnocení odpověď ještě odevzdej.', 'The draft is saved. Submit the answer when you want it to be graded.')}</p>
        ) : null}
        {queued ? <p className="muted-copy" role="status" aria-live="polite">{ui('Odpověď je bezpečně uložená v tomto zařízení a odešle se po obnovení spojení.', 'Your answer is safely stored on this device and will be sent when the connection is restored.')}</p> : null}
        {error ? <div className="error" role="alert" style={{ marginTop: 10 }}>{error}</div> : null}
      </section>
    );
  }

  return null;
}
