import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Moje lekce – Syllonaut',
};

export default function LessonsLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return children;
}
