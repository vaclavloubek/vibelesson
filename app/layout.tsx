import type { Metadata } from 'next';
import Script from 'next/script';
import { Geist, Geist_Mono } from 'next/font/google';
import './globals.css';
import './flow-polish.css';
import './mobile-focus.css';

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
  title: 'Syllonaut — AI navigátor pro interaktivní výuku',
  description: 'Z nápadu do živé interaktivní hodiny. Syllonaut připraví, upraví a pomůže vést výuku se studenty v reálném čase.',
  applicationName: 'Syllonaut',
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="cs">
      <head>
        <link rel="preconnect" href="https://challenges.cloudflare.com" />
      </head>
      <body className={`${geist.variable} ${geistMono.variable}`}>
        <Script
          id="syllonaut-turnstile"
          src="https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit"
          strategy="beforeInteractive"
        />
        {children}
      </body>
    </html>
  );
}
