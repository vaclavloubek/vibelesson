'use client';

import { useSyncExternalStore } from 'react';

// Lets the account menu (phone entry) know whether the Help panel is available
// on this page and open it, without prop drilling through every header.
const OPEN_EVENT = 'syllonaut:help-open';

let available = false;
const listeners = new Set<() => void>();

export function setHelpPanelAvailable(next: boolean) {
  if (available === next) return;
  available = next;
  for (const listener of listeners) listener();
}

export function useHelpPanelAvailable() {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => available,
    () => false,
  );
}

export function openHelpPanel() {
  window.dispatchEvent(new Event(OPEN_EVENT));
}

export function onHelpPanelOpenRequest(handler: () => void) {
  window.addEventListener(OPEN_EVENT, handler);
  return () => window.removeEventListener(OPEN_EVENT, handler);
}
