import type { Metadata } from 'next';
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
  title: 'Syllonaut — AI navigátor pro interaktivní výuku',
  description: 'Z nápadu do živé interaktivní hodiny. Syllonaut připraví, upraví a pomůže vést výuku se studenty v reálném čase.',
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="cs"><body className={`${geist.variable} ${geistMono.variable}`}>{children}</body></html>;
}
