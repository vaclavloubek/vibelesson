import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Účet – Syllonaut',
};

export default function AuthLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return children;
}
