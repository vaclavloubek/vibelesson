'use client';

export default function PrintPageButton({ children }: { children: React.ReactNode }) {
  return <button type="button" onClick={() => window.print()}>{children}</button>;
}
