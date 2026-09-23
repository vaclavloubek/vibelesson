'use client';

import { useEffect, useState } from 'react';
import { useUiLocale } from '@/components/LocaleProvider';

export default function CopyableJoinLink({ url, fallback }: { url: string; fallback: string }) {
  const english = useUiLocale() === 'en';
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!copied) return;
    const timer = window.setTimeout(() => setCopied(false), 2200);
    return () => window.clearTimeout(timer);
  }, [copied]);

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  }

  const label = copied
    ? (english ? 'Link copied' : 'Odkaz zkopírován')
    : (english ? 'Copy link to clipboard' : 'Kopírovat odkaz do schránky');

  return (
    <div className="copyable-join-link">
      <p className="muted-copy" style={{ wordBreak: 'break-all', margin: 0 }}>{url || fallback}</p>
      {url ? (
        <button
          type="button"
          className={copied ? 'copy-link-icon-button copied' : 'copy-link-icon-button'}
          onClick={() => void copyLink()}
          aria-label={label}
          title={label}
        >
          {copied ? (
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path d="M5 12.5l4.5 4.5L19 7.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          ) : (
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <rect x="8.5" y="8.5" width="11" height="11" rx="2.2" stroke="currentColor" strokeWidth="1.8" />
              <path d="M15.5 5.5v-.3a1.7 1.7 0 0 0-1.7-1.7H6.2a1.7 1.7 0 0 0-1.7 1.7v7.6a1.7 1.7 0 0 0 1.7 1.7h.3" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
            </svg>
          )}
        </button>
      ) : null}
      <span className="sr-only" aria-live="polite">{copied ? label : ''}</span>
    </div>
  );
}
