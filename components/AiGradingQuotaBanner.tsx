'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useUiLocale } from '@/components/LocaleProvider';
import type { AiQuotaSnapshot } from '@/lib/ai-quota';
import {
  GRADING_QUEUE_EVENT,
  gradingQuotaBannerText,
  lowGradingNoticeText,
  shouldShowGradingQuotaBanner,
  shouldShowLowGradingNotice,
  type GradingQueueEventDetail,
  type GradingQuotaState,
  type ManualGradingReason,
} from '@/lib/ai-grading-quota-communication';
import styles from './AiGradingQuotaBanner.module.css';

function toGradingQuotaState(row: AiQuotaSnapshot | null): GradingQuotaState | null {
  if (!row) return null;
  return {
    gradingEnabled: row.grading_enabled,
    gradingUnlimited: row.grading_unlimited,
    gradingUsed: row.grading_used,
    gradingLimit: row.grading_limit,
    gradingRemaining: row.grading_remaining,
    windowEnd: row.quota_window_end,
    scope: row.quota_scope === 'organization' ? 'organization' : 'individual',
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
export default function AiGradingQuotaBanner({ sessionId }: { sessionId: string }) {
  const english = useUiLocale() === 'en';
  const bannerKey = `syllonaut:grading-quota-banner:${sessionId}`;
  const noticeKey = `syllonaut:grading-quota-low-notice:${sessionId}`;
  const [quota, setQuota] = useState<GradingQuotaState | null>(null);
  const [manualReasons, setManualReasons] = useState<Array<ManualGradingReason | null>>([]);
  const [bannerDismissed, setBannerDismissed] = useState(true);
  const [noticeDismissed, setNoticeDismissed] = useState(true);
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
      const previous = signatureRef.current;
      signatureRef.current = detail.signature;
      // The first announcement matches the quota loaded on mount.
      if (previous !== null && previous !== detail.signature) void loadQuota();
    }
    window.addEventListener(GRADING_QUEUE_EVENT, handleQueue);
    return () => window.removeEventListener(GRADING_QUEUE_EVENT, handleQueue);
  }, [sessionId, loadQuota]);

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
      <section className={styles.banner} role="status" aria-live="polite">
        <p>{text}</p>
        <button
          type="button"
          className={styles.close}
          aria-label={english ? 'Close notice' : 'Zavřít upozornění'}
          onClick={() => {
            writeDismissed(bannerKey);
            setBannerDismissed(true);
          }}
        >
          ×
        </button>
      </section>
    );
  }

  if (showNotice && quota?.gradingRemaining) {
    return (
      <p className={styles.notice} role="status">
        <span>{lowGradingNoticeText(quota.gradingRemaining, english)}</span>
        <button
          type="button"
          className={styles.close}
          aria-label={english ? 'Close notice' : 'Zavřít upozornění'}
          onClick={() => {
            writeDismissed(noticeKey);
            setNoticeDismissed(true);
          }}
        >
          ×
        </button>
      </p>
    );
  }

  return null;
}
