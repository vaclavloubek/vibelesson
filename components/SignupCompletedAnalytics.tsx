'use client';

import { useEffect, useRef } from 'react';
import { trackEvent } from '@/lib/analytics';

export default function SignupCompletedAnalytics() {
  const trackedRef = useRef(false);

  useEffect(() => {
    if (trackedRef.current) return;
    trackedRef.current = true;
    trackEvent('signup_completed');

    const url = new URL(window.location.href);
    if (url.searchParams.get('signup') === 'completed') {
      url.searchParams.delete('signup');
      const next = `${url.pathname}${url.search}${url.hash}`;
      window.history.replaceState(window.history.state, '', next);
    }
  }, []);

  return null;
}
