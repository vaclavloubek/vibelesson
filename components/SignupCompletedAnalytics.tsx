'use client';

import { useEffect, useRef } from 'react';
import { trackEvent } from '@/lib/analytics';

export default function SignupCompletedAnalytics() {
  const trackedRef = useRef(false);

  useEffect(() => {
    if (trackedRef.current) return;
    trackedRef.current = true;

    const key = 'syllonaut_signup_completed_analytics_v1';
    try {
      if (window.sessionStorage.getItem(key) === '1') return;
      trackEvent('signup_completed');
      window.sessionStorage.setItem(key, '1');
    } catch {
      trackEvent('signup_completed');
    }
  }, []);

  return null;
}
