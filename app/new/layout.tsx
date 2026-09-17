import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Nová lekce – Syllonaut',
};

export default function NewLessonLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return children;
}
