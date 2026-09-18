'use client';

import { createContext, useContext } from 'react';
import type { UiLocale } from '@/lib/i18n';

const LocaleContext = createContext<UiLocale>('en');

export default function LocaleProvider({
  locale,
  children,
}: {
  locale: UiLocale;
  children: React.ReactNode;
}) {
  return <LocaleContext.Provider value={locale}>{children}</LocaleContext.Provider>;
}

export function useUiLocale() {
  return useContext(LocaleContext);
}
