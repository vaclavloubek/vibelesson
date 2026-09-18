import type { Metadata } from 'next';
import { headers } from 'next/headers';
import Script from 'next/script';
import { Geist, Geist_Mono } from 'next/font/google';
import './globals.css';
import './flow-polish.css';
import './mobile-focus.css';
import './accessibility.css';
import CookieConsent from '@/components/CookieConsent';
import LiveServiceWorker from '@/components/LiveServiceWorker';
import LocaleProvider from '@/components/LocaleProvider';
import { LOCALE_REQUEST_HEADER, normalizeUiLocale } from '@/lib/i18n';

const geist = Geist({
  subsets: ['latin'],
  variable: '--font-geist-sans',
  display: 'swap',
});

const geistMono = Geist_Mono({
  subsets: ['latin'],
  variable: '--font-geist-mono',
  display: 'swap',
});

export const metadata: Metadata = {
  metadataBase: new URL('https://www.syllonaut.com'),
  title: 'Syllonaut',
  description: 'AI-powered interactive lesson creation and live teaching.',
  applicationName: 'Syllonaut',
};

export default async function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const requestHeaders = await headers();
  const locale = normalizeUiLocale(requestHeaders.get(LOCALE_REQUEST_HEADER)) ?? 'cs';

  return (
    <html lang={locale}>
      <head>
        <link rel="preconnect" href="https://challenges.cloudflare.com" />
      </head>
      <body className={`${geist.variable} ${geistMono.variable}`}>
        <LocaleProvider locale={locale}>
          <Script
            id="syllonaut-turnstile"
            src="https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit"
            strategy="beforeInteractive"
          />
          <a className="skip-link" href="#main-content">{locale === 'en' ? 'Skip to main content' : 'Přeskočit na hlavní obsah'}</a>
          <div id="main-content" tabIndex={-1}>{children}</div>
          <CookieConsent />
          <LiveServiceWorker />
        </LocaleProvider>
      </body>
    </html>
  );
}
