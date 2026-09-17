import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Živá hodina – student – Syllonaut',
};

export default function StudentLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return children;
}
