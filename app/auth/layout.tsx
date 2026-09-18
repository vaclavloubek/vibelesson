import type { Metadata } from 'next';
import { headers } from 'next/headers';
import { LOCALE_REQUEST_HEADER, normalizeUiLocale } from '@/lib/i18n';

export async function generateMetadata(): Promise<Metadata> {
  const requestHeaders = await headers();
  const locale = normalizeUiLocale(requestHeaders.get(LOCALE_REQUEST_HEADER)) ?? 'cs';
  return {
    title: locale === 'en' ? 'Account – Syllonaut' : 'Účet – Syllonaut',
  };
}

export default function AuthLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return children;
}
