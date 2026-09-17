import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Řídicí centrum – Syllonaut',
};

export default function SessionsLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return children;
}
