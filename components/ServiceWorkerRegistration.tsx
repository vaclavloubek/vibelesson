'use client';

import { useEffect } from 'react';

export default function ServiceWorkerRegistration() {
  useEffect(() => {
    if (process.env.NODE_ENV !== 'production' || !('serviceWorker' in navigator)) return;
    void navigator.serviceWorker.register('/sw.js', { scope: '/' }).catch((error) => {
      console.error('Syllonaut service worker registration failed', error);
    });
  }, []);

  return null;
}
