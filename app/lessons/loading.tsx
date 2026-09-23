export default function LessonsLoading() {
  return (
    <main className="shell lessons-shell" aria-busy="true">
      <section className="lessons-empty panel" role="status">
        <span className="eyebrow">Palubní deník · Logbook</span>
        <h1>Načítám lekce…</h1>
        <p>Loading lessons…</p>
      </section>
    </main>
  );
}
