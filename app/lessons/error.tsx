'use client';

import { useEffect } from 'react';

export default function LessonsError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('lessons route failed', { digest: error.digest, name: error.name });
  }, [error]);

  return (
    <main className="shell lessons-shell">
      <section className="lessons-empty panel" role="alert">
        <span className="eyebrow">Spojení se nezdařilo · Connection failed</span>
        <h1>Lekce zůstávají bezpečně uložené</h1>
        <p>Požadavek vypršel. Zkus načtení znovu. Your data is safe; please retry.</p>
        <button type="button" className="primary" onClick={reset}>Načíst znovu · Retry</button>
      </section>
    </main>
  );
}
