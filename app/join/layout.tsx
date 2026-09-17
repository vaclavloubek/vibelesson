import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Připojit se k hodině – Syllonaut',
};

export default function JoinLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return children;
}
