'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useUiLocale } from '@/components/LocaleProvider';
import type { AiQuotaSnapshot } from '@/lib/ai-quota';
import { localizedApiError } from '@/lib/i18n';
import {
  AI_GRADING_TOPUP_ANCHOR,
  canRequestAiForPendingQuota,
  creditAvailableBannerText,
  GRADING_QUEUE_EVENT,
  gradingQuotaBannerText,
  lowGradingNoticeText,
  requestAiForPendingButtonText,
  shouldShowGradingQuotaBanner,
  shouldShowLowGradingNotice,
  topupLinkText,
  totalGradingRemaining,
  type GradingQueueEventDetail,
  type GradingQuotaState,
  type ManualGradingReason,
} from '@/lib/ai-grading-quota-communication';
import styles from './AiGradingQuotaBanner.module.css';

type QuotaInfo = GradingQuotaState & { planCode: string | null };

function toGradingQuotaState(row: AiQuotaSnapshot | null): QuotaInfo | null {
  if (!row) return null;
  return {
    gradingEnabled: row.grading_enabled,
    gradingUnlimited: row.grading_unlimited,
    gradingUsed: row.grading_used,
    gradingLimit: row.grading_limit,
    gradingRemaining: row.grading_remaining,
    windowEnd: row.quota_window_end,
    scope: row.quota_scope === 'organization' ? 'organization' : 'individual',
    creditRemaining: Math.max(0, row.grading_credit_remaining ?? 0),
    planCode: row.plan_code ?? null,
  };
}

function readDismissed(key: string) {
  try {
    return window.sessionStorage.getItem(key) === '1';
  } catch {
    return false;
  }
}

function writeDismissed(key: string) {
  try {
    window.sessionStorage.setItem(key, '1');
  } catch {
    // Without storage the banner simply stays closed until the page reloads.
  }
}

// Informational only: AI grading suggestions ran out, live teaching and
// manual grading keep working. Refreshes the quota when the grading queue changes.
// With top-ups on (phase 2), an individual Teacher Pro also gets a link to buy
// more and, once suggestions are available again, a button that asks AI for
// the responses still waiting because of the quota.
export default function AiGradingQuotaBanner({
  sessionId,
  topupsEnabled = false,
}: {
  sessionId: string;
  topupsEnabled?: boolean;
}) {
  const locale = useUiLocale();
  const english = locale === 'en';
  const bannerKey = `syllonaut:grading-quota-banner:${sessionId}`;
  const noticeKey = `syllonaut:grading-quota-low-notice:${sessionId}`;
  const [quota, setQuota] = useState<QuotaInfo | null>(null);
  const [manualReasons, setManualReasons] = useState<Array<ManualGradingReason | null>>([]);
  const [pendingQuotaCount, setPendingQuotaCount] = useState(0);
  const [bannerDismissed, setBannerDismissed] = useState(true);
  const [noticeDismissed, setNoticeDismissed] = useState(true);
  const [requesting, setRequesting] = useState(false);
  const [requestMessage, setRequestMessage] = useState('');
  const signatureRef = useRef<string | null>(null);
  const requestRef = useRef(0);

  const loadQuota = useCallback(async () => {
    const request = requestRef.current + 1;
    requestRef.current = request;
    try {
      const response = await fetch('/api/ai-quota', { cache: 'no-store' });
      const row = response.ok ? (await response.json()) as AiQuotaSnapshot | null : null;
      if (requestRef.current === request && response.ok) setQuota(toGradingQuotaState(row));
    } catch {
      // Keep the last known state; the next queue change retries.
    }
  }, []);

  useEffect(() => {
    setBannerDismissed(readDismissed(bannerKey));
    setNoticeDismissed(readDismissed(noticeKey));
    void loadQuota();
  }, [bannerKey, noticeKey, loadQuota]);

  useEffect(() => {
    function handleQueue(event: Event) {
      const detail = (event as CustomEvent<GradingQueueEventDetail>).detail;
      if (!detail || detail.sessionId !== sessionId) return;
      setManualReasons(detail.manualReasons);
      setPendingQuotaCount(detail.pendingQuotaCount ?? 0);
      const previous = signatureRef.current;
      signatureRef.current = detail.signature;
      // The first announcement matches the quota loaded on mount.
      if (previous !== null && previous !== detail.signature) void loadQuota();
    }
    window.addEventListener(GRADING_QUEUE_EVENT, handleQueue);
    return () => window.removeEventListener(GRADING_QUEUE_EVENT, handleQueue);
  }, [sessionId, loadQuota]);

  const topupsForAccount = topupsEnabled && quota?.planCode === 'teacher_pro' && quota.scope === 'individual';
  const canRequest = topupsForAccount && canRequestAiForPendingQuota(quota, pendingQuotaCount);

  async function requestSuggestions() {
    if (requesting) return;
    setRequesting(true);
    setRequestMessage('');
    try {
      const response = await fetch(`/api/sessions/${sessionId}/evaluations/request-ai-suggestions`, { method: 'POST', cache: 'no-store' });
      const data = await response.json() as { requeued?: number; error?: string };
      if (!response.ok) throw new Error(localizedApiError(data.error, locale, 'Návrhy od AI se nepodařilo vyžádat.', 'AI suggestions could not be requested.'));
      const requeued = data.requeued ?? 0;
      setRequestMessage(english
        ? `AI is preparing suggestions for ${requeued} ${requeued === 1 ? 'response' : 'responses'}. Responses beyond your remaining suggestions go back to manual grading.`
        : `AI připravuje návrhy pro ${requeued} ${requeued === 1 ? 'odpověď' : requeued >= 2 && requeued <= 4 ? 'odpovědi' : 'odpovědí'}. Odpovědi nad zůstatek se vrátí k ručnímu hodnocení.`);
      void loadQuota();
    } catch (error) {
      setRequestMessage(error instanceof Error ? error.message : (english ? 'AI suggestions could not be requested.' : 'Návrhy od AI se nepodařilo vyžádat.'));
    } finally {
      setRequesting(false);
    }
  }

  function closeButton(key: string, onClose: () => void) {
    return (
      <button
        type="button"
        className={styles.close}
        aria-label={english ? 'Close notice' : 'Zavřít upozornění'}
        onClick={() => {
          writeDismissed(key);
          onClose();
        }}
      >
        ×
      </button>
    );
  }

  if (canRequest && quota) {
    // Not dismissible while there is something to act on.
    return (
      <div className={styles.wrap}>
        <section className={styles.banner} role="status" aria-live="polite">
          <div className={styles.content}>
            <p>{creditAvailableBannerText(totalGradingRemaining(quota) ?? 0, pendingQuotaCount, english)}</p>
            <div className={styles.actions}>
              <button type="button" className={styles.primary} onClick={() => { void requestSuggestions(); }} disabled={requesting}>
                {requesting ? (english ? 'Asking AI…' : 'Žádám AI…') : requestAiForPendingButtonText(pendingQuotaCount, english)}
              </button>
            </div>
            {requestMessage ? <p className={styles.result}>{requestMessage}</p> : null}
          </div>
        </section>
      </div>
    );
  }

  const showBanner = !bannerDismissed && shouldShowGradingQuotaBanner(quota, manualReasons);
  const showNotice = !showBanner
    && !noticeDismissed
    && !manualReasons.includes('quota')
    && shouldShowLowGradingNotice(quota);

  if (showBanner) {
    const text = gradingQuotaBannerText(quota ?? {
      gradingUsed: 0,
      gradingLimit: null,
      windowEnd: null,
      scope: 'individual',
    }, english);
    return (
      <div className={styles.wrap}>
        <section className={styles.banner} role="status" aria-live="polite">
          <div className={styles.content}>
            <p>{text}</p>
            {topupsForAccount ? (
              <div className={styles.actions}>
                <a
                  href={`/${locale}/subscription#${AI_GRADING_TOPUP_ANCHOR}`}
                  target="_blank"
                  rel="noopener"
                  className={styles.link}
                >
                  {topupLinkText(english)}
                  <span className={styles.srOnly}>{english ? ' (opens in a new tab)' : ' (otevře se v nové záložce)'}</span>
                </a>
              </div>
            ) : null}
            {requestMessage ? <p className={styles.result}>{requestMessage}</p> : null}
          </div>
          {closeButton(bannerKey, () => setBannerDismissed(true))}
        </section>
      </div>
    );
  }

  const remaining = totalGradingRemaining(quota);
  if (showNotice && remaining) {
    return (
      <div className={styles.wrapNotice}>
        <p className={styles.notice} role="status">
          <span>{lowGradingNoticeText(remaining, english)}</span>
          {closeButton(noticeKey, () => setNoticeDismissed(true))}
        </p>
      </div>
    );
  }

  return null;
}
