'use client';

import { useEffect } from 'react';

export default function LiveServiceWorker() {
  useEffect(() => {
    if (!('serviceWorker' in navigator)) return;
    void navigator.serviceWorker.register('/sw.js', { scope: '/' }).catch((error) => {
      console.error('Live service worker registration failed', error);
    });
  }, []);

  return null;
}
