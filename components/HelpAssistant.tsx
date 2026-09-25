'use client';

import { useCallback, useEffect, useId, useRef, useState, type FormEvent, type KeyboardEvent } from 'react';
import { useUiLocale } from '@/components/LocaleProvider';
import { startSyllonautGuide } from '@/lib/onboarding-guide';
import { SYLLONAUT_GUIDE_STEPS } from '@/lib/onboarding-guide-steps';
import { PROVIDER_CONTACT } from '@/lib/provider-contact';
import {
  HELP_ACTION_LABELS,
  HELP_HISTORY_MAX_MESSAGES,
  HELP_INPUT_MAX_CHARS,
  isHelpTokenLine,
  parseHelpActionToken,
  type HelpAction,
  type HelpPage,
} from '@/lib/help/actions';
import { onHelpPanelOpenRequest, setHelpPanelAvailable } from '@/lib/help/panel-store';
import styles from './HelpAssistant.module.css';

type Props = {
  userId: string | null;
  page: HelpPage;
};

type ChatMessage = {
  id: number;
  role: 'user' | 'assistant' | 'notice';
  text: string;
  actions: HelpAction[];
  requestId?: string;
  feedback?: 'up' | 'down';
  streaming?: boolean;
};

const SUGGESTIONS: Record<HelpPage, { cs: string[]; en: string[] }> = {
  lessons: {
    cs: ['Jak otevřít hodinu pro studenty?', 'Kolik mi zbývá AI lekcí?', 'Jak sdílet lekci s kolegou?'],
    en: ['How do I open a lesson for students?', 'How many AI lessons do I have left?', 'How do I share a lesson with a colleague?'],
  },
  new: {
    cs: ['Jaké podklady můžu nahrát?', 'V jakém jazyce se lekce vytvoří?', 'Co čerpá AI limit?'],
    en: ['Which source materials can I upload?', 'In which language will the lesson be created?', 'What uses the AI allowance?'],
  },
  lesson: {
    cs: ['Jak změnit jen jednu aktivitu?', 'Jaký je rozdíl mezi úpravou s AI a ručně?', 'Jak vytisknout pracovní list?'],
    en: ['How do I change just one activity?', 'What is the difference between editing with AI and manually?', 'How do I print a worksheet?'],
  },
  live: {
    cs: ['Jak se připojí studenti?', 'Jak vytvořit týmy?', 'Jak dostat hodinu na projektor?'],
    en: ['How do students join?', 'How do I create teams?', 'How do I show the lesson on a projector?'],
  },
  evaluation: {
    cs: ['Proč se nezapočítaly body od AI?', 'Co znamená upozornění na možné využití AI?', 'Co uvidí studenti?'],
    en: ['Why were the AI points not counted?', 'What does the notice of possible AI use mean?', 'What will students see?'],
  },
  subscription: {
    cs: ['Kdy se obnoví limit?', 'Jak změnit tarif?', 'Jak odebrat staré zařízení?'],
    en: ['When does the allowance renew?', 'How do I change my plan?', 'How do I remove an old device?'],
  },
};

// Visible text of a raw answer: token lines removed, and a trailing partial
// line that may still become a token is held back while streaming.
function splitAnswer(raw: string, streaming: boolean) {
  const lines = raw.split('\n');
  const tail = streaming ? lines.pop() ?? '' : null;
  const actions: HelpAction[] = [];
  const visible: string[] = [];
  for (const line of lines) {
    if (isHelpTokenLine(line)) {
      const action = parseHelpActionToken(line);
      if (action && actions.length < 2 && !actions.some((item) => item.token === action.token)) actions.push(action);
      continue;
    }
    visible.push(line);
  }
  if (tail !== null && !tail.trimStart().startsWith('[')) visible.push(tail);
  return { text: visible.join('\n').trim(), actions };
}

function guideTargetPresent(action: HelpAction) {
  if (action.kind !== 'guide') return true;
  const step = SYLLONAUT_GUIDE_STEPS[action.chapter]?.[action.step];
  return Boolean(step && document.querySelector(`[data-tour="${step.target}"]`));
}

const FOCUSABLE = 'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])';

export default function HelpAssistant({ userId, page }: Props) {
  const locale = useUiLocale();
  const english = locale === 'en';
  const ui = (cs: string, en: string) => (english ? en : cs);
  const [entitled, setEntitled] = useState(false);
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [remaining, setRemaining] = useState<number | null | undefined>(undefined);
  const [liveAnnouncement, setLiveAnnouncement] = useState('');
  const nextId = useRef(1);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const returnFocusRef = useRef<HTMLElement | null>(null);
  const dialogRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLTextAreaElement | null>(null);
  const listRef = useRef<HTMLDivElement | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const titleId = useId();
  const contactHref = `mailto:${PROVIDER_CONTACT.email}?subject=${encodeURIComponent(ui('Nápověda Syllonautu', 'Syllonaut Help'))}`;
  const descriptionId = useId();

  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    fetch('/api/entitlements', { cache: 'no-store' })
      .then((response) => (response.ok ? response.json() : null))
      .then((payload: { helpAssistantEnabled?: boolean } | null) => {
        if (!cancelled) setEntitled(payload?.helpAssistantEnabled === true);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [userId]);

  useEffect(() => {
    setHelpPanelAvailable(entitled);
    return () => setHelpPanelAvailable(false);
  }, [entitled]);

  const openPanel = useCallback(() => {
    returnFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : triggerRef.current;
    setOpen(true);
  }, []);

  const closePanel = useCallback(() => {
    setOpen(false);
    const target = returnFocusRef.current;
    const fallback = triggerRef.current;
    window.setTimeout(() => {
      if (target && target.isConnected && target.offsetParent !== null) target.focus();
      else fallback?.focus();
    }, 0);
  }, []);

  useEffect(() => {
    if (!entitled) return;
    return onHelpPanelOpenRequest(openPanel);
  }, [entitled, openPanel]);

  useEffect(() => {
    if (!open) return;
    inputRef.current?.focus();
    fetch('/api/help/chat', { cache: 'no-store' })
      .then((response) => (response.ok ? response.json() : null))
      .then((payload: { unlimited?: boolean; remaining?: number | null } | null) => {
        if (payload) setRemaining(payload.unlimited ? null : payload.remaining ?? 0);
      })
      .catch(() => undefined);
  }, [open]);

  useEffect(() => () => abortRef.current?.abort(), []);

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight });
  }, [messages]);

  function onDialogKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === 'Escape') {
      event.stopPropagation();
      closePanel();
      return;
    }
    if (event.key !== 'Tab' || !dialogRef.current) return;
    const focusable = Array.from(dialogRef.current.querySelectorAll<HTMLElement>(FOCUSABLE));
    if (!focusable.length) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }

  function updateMessage(id: number, patch: Partial<ChatMessage>) {
    setMessages((current) => current.map((message) => (message.id === id ? { ...message, ...patch } : message)));
  }

  async function ask(question: string) {
    const message = question.trim().slice(0, HELP_INPUT_MAX_CHARS);
    if (!message || busy) return;
    const history = messages
      .filter((item) => (item.role === 'user' || item.role === 'assistant') && item.text && !item.streaming)
      .slice(-HELP_HISTORY_MAX_MESSAGES)
      .map((item) => ({ role: item.role as 'user' | 'assistant', content: item.text }));
    const userMessage: ChatMessage = { id: nextId.current++, role: 'user', text: message, actions: [] };
    const answerId = nextId.current++;
    setMessages((current) => [...current, userMessage, { id: answerId, role: 'assistant', text: '', actions: [], streaming: true }]);
    setInput('');
    setBusy(true);
    setLiveAnnouncement(ui('Nápověda píše odpověď…', 'Help is writing an answer…'));

    const controller = new AbortController();
    abortRef.current = controller;
    try {
      const response = await fetch('/api/help/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ locale, page, message, history }),
        signal: controller.signal,
      });
      if (!response.ok || !response.body) {
        const payload = await response.json().catch(() => null) as { message?: string; remaining?: number; actions?: string[] } | null;
        const text = payload?.message ?? ui('Nápověda teď neodpovídá. Zkuste to prosím za chvíli.', 'Help is not responding right now. Please try again shortly.');
        const actions = (payload?.actions ?? []).map(parseHelpActionToken).filter((item): item is HelpAction => item !== null);
        if (typeof payload?.remaining === 'number') setRemaining(payload.remaining);
        updateMessage(answerId, { role: 'notice', text, actions, streaming: false });
        setLiveAnnouncement(text);
        return;
      }
      const requestId = response.headers.get('X-Help-Request-Id') ?? undefined;
      const remainingHeader = response.headers.get('X-Help-Remaining');
      if (remainingHeader) setRemaining(remainingHeader === 'unlimited' ? null : Number(remainingHeader));

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let raw = '';
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        raw += decoder.decode(value, { stream: true });
        updateMessage(answerId, { text: splitAnswer(raw, true).text });
      }
      raw += decoder.decode();
      const final = splitAnswer(raw, false);
      const text = final.text || ui('Odpověď se nepodařilo dokončit. Zkuste to prosím znovu.', 'The answer could not be completed. Please try again.');
      updateMessage(answerId, {
        role: final.text ? 'assistant' : 'notice',
        text,
        actions: final.actions,
        requestId: final.text ? requestId : undefined,
        streaming: false,
      });
      setLiveAnnouncement(text);
    } catch {
      if (controller.signal.aborted) return;
      const text = ui('Spojení s Nápovědou se přerušilo. Zkuste to prosím znovu.', 'The connection to Help was interrupted. Please try again.');
      updateMessage(answerId, { role: 'notice', text, streaming: false });
      setLiveAnnouncement(text);
    } finally {
      if (abortRef.current === controller) abortRef.current = null;
      setBusy(false);
    }
  }

  async function rate(message: ChatMessage, feedback: 'up' | 'down') {
    if (!message.requestId || message.feedback) return;
    updateMessage(message.id, { feedback });
    const response = await fetch('/api/help/feedback', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ requestId: message.requestId, feedback }),
    }).catch(() => null);
    if (!response?.ok) updateMessage(message.id, { feedback: undefined });
  }

  function runAction(action: HelpAction) {
    if (action.kind === 'guide') {
      if (!userId) return;
      setOpen(false);
      startSyllonautGuide(userId, action.chapter, action.step);
      return;
    }
    if (action.link === 'contact') {
      window.location.href = contactHref;
      return;
    }
    window.location.assign(`/${locale}/${action.link}`);
  }

  function onSubmit(event: FormEvent) {
    event.preventDefault();
    void ask(input);
  }

  if (!userId || !entitled) return null;

  const remainingText = remaining === undefined || remaining === null
    ? null
    : ui(`Zbývá zpráv: ${remaining}`, `Messages left: ${remaining}`);

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        className={`secondary ${styles.trigger}`}
        onClick={() => (open ? closePanel() : openPanel())}
        aria-haspopup="dialog"
        aria-expanded={open}
      >
        {ui('Nápověda', 'Help')}
      </button>

      {open ? (
        <div className={styles.backdrop} onMouseDown={(event) => { if (event.target === event.currentTarget) closePanel(); }}>
          <div
            ref={dialogRef}
            className={styles.panel}
            role="dialog"
            aria-modal="true"
            aria-labelledby={titleId}
            aria-describedby={descriptionId}
            onKeyDown={onDialogKeyDown}
          >
            <div className={styles.head}>
              <div>
                <h2 id={titleId} className={styles.title}>{ui('Nápověda Syllonautu', 'Syllonaut Help')}</h2>
                <p id={descriptionId} className={styles.badge}>
                  {ui('Odpovídá AI, může se mýlit. Nic v účtu nemění.', 'Answers come from AI and may be wrong. It changes nothing in your account.')}
                </p>
                {remainingText ? <p className={styles.remaining}>{remainingText}</p> : null}
              </div>
              <button type="button" className={styles.close} onClick={closePanel} aria-label={ui('Zavřít nápovědu', 'Close help')}>×</button>
            </div>

            <div ref={listRef} className={styles.messages}>
              {messages.length === 0 ? (
                <div className={styles.suggestions}>
                  <p>{ui('Na co se chcete zeptat?', 'What would you like to ask?')}</p>
                  {SUGGESTIONS[page][english ? 'en' : 'cs'].map((question) => (
                    <button key={question} type="button" className={styles.suggestion} onClick={() => void ask(question)} disabled={busy}>
                      {question}
                    </button>
                  ))}
                </div>
              ) : null}
              {messages.map((message) => {
                const visibleActions = message.actions.filter(guideTargetPresent);
                return (
                  <div key={message.id} className={styles[message.role]}>
                    {message.role === 'user' ? <span className={styles.srOnly}>{ui('Vy:', 'You:')} </span> : null}
                    {message.role === 'assistant' ? <span className={styles.srOnly}>{ui('Nápověda:', 'Help:')} </span> : null}
                    <p className={styles.text}>{message.text || (message.streaming ? '…' : '')}</p>
                    {visibleActions.length ? (
                      <div className={styles.actions}>
                        {visibleActions.map((action) => (
                          <button key={action.token} type="button" className={styles.action} onClick={() => runAction(action)}>
                            {HELP_ACTION_LABELS[action.token.slice(2, -2)]?.[english ? 'en' : 'cs'] ?? action.token}
                          </button>
                        ))}
                      </div>
                    ) : null}
                    {message.role === 'assistant' && message.requestId && !message.streaming ? (
                      <div className={styles.feedback}>
                        {message.feedback ? (
                          <span>{ui('Děkujeme za hodnocení.', 'Thank you for the feedback.')}</span>
                        ) : (
                          <>
                            <button type="button" onClick={() => void rate(message, 'up')} aria-label={ui('Odpověď pomohla', 'The answer helped')}>👍</button>
                            <button type="button" onClick={() => void rate(message, 'down')} aria-label={ui('Odpověď nepomohla', 'The answer did not help')}>👎</button>
                          </>
                        )}
                      </div>
                    ) : null}
                  </div>
                );
              })}
            </div>

            <div className={styles.srOnly} role="status" aria-live="polite">{liveAnnouncement}</div>

            <form className={styles.form} onSubmit={onSubmit}>
              <label className={styles.srOnly} htmlFor={`${titleId}-input`}>{ui('Váš dotaz', 'Your question')}</label>
              <textarea
                ref={inputRef}
                id={`${titleId}-input`}
                value={input}
                onChange={(event) => setInput(event.target.value.slice(0, HELP_INPUT_MAX_CHARS))}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
                    event.preventDefault();
                    void ask(input);
                  }
                }}
                maxLength={HELP_INPUT_MAX_CHARS}
                rows={2}
                placeholder={ui('Zeptejte se na ovládání, tarify nebo limity…', 'Ask about using the app, plans or allowances…')}
                disabled={busy}
              />
              <div className={styles.formRow}>
                <span className={styles.counter}>{input.length}/{HELP_INPUT_MAX_CHARS}</span>
                <button type="submit" className="primary" disabled={busy || !input.trim()}>
                  {busy ? ui('Odpovídám…', 'Answering…') : ui('Odeslat', 'Send')}
                </button>
              </div>
              <p className={styles.footer}>
                {ui('Nepište sem jména ani odpovědi studentů.', 'Do not enter student names or answers.')}{' '}
                <a href={contactHref}>{ui('Napsat autorovi', 'Write to the author')}</a>
              </p>
            </form>
          </div>
        </div>
      ) : null}
    </>
  );
}
