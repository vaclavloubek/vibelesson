import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'VibeLesson',
  description: 'AI nástroj pro tvorbu interaktivní výuky.',
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="cs"><body>{children}</body></html>;
}
