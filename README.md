# Syllonaut beta

**Syllonaut — Od nápadu k odučené hodině. S AI.**

Syllonaut je AI navigátor pro interaktivní výuku: učitel popíše hodinu přirozeným jazykem a dostane hotovou interaktivní lekci, kterou může dál upravovat stejným způsobem. Cílem není generovat osnovu nebo prezentaci, ale přímo použitelný scénář výuky s aktivitami pro studenty.

Název spojuje *syllabus* a *astronaut*. Kosmická metafora se v produktu používá střídmě: učitel připravuje výukovou misi, živou hodinu odstartuje a během ní má k dispozici řídicí centrum. Srozumitelnost má vždy přednost před metaforou.

## Co tato verze umí

- generování celé lekce z volného zadání;
- strukturovaný `Lesson` JSON místo generování libovolného kódu;
- interaktivní bloky: úvod, týmová mise, poll, quiz, open text, ranking, reveal, timer a exit ticket;
- AI úprava celé lekce přirozeným jazykem;
- AI úprava jedné vybrané aktivity bez přegenerování zbytku;
- přepnutí učitelský / studentský náhled;
- ukládání lekcí do pracovního prostoru učitele;
- spuštění živé hodiny a studentské připojení přes krátký kód;
- živé řízení postupu a sběr odpovědí;
- demo lekce bez AI;
- Vercel AI Gateway + Supabase; připravuje se řízený přechod na Neon Postgres/Auth.

## Lokální spuštění

```bash
cp .env.example .env.local
npm install
npm run dev
```

Pro lokální AI nastav `AI_GATEWAY_API_KEY`. Model lze změnit přes `AI_MODEL`; výchozí je `openai/gpt-5.6-sol`.

## Architektura

AI generuje validovaný `Lesson` JSON podle Zod schématu. UI jej vykresluje pomocí pevné sady interaktivních komponent. Učitel tak získává pocit vibecodingu, ale model negeneruje libovolný frontendový kód. Díky tomu má být výstup stabilnější, bezpečnější a lépe testovatelný.

### Přechod na Neon

Migrační příprava je v `docs/NEON_MIGRATION.md`. Obsahuje audit Supabase závislostí, cílovou architekturu, dry-run-first nástroje, validaci dat a identity, staging testy, cutover i rollback. Produkce zůstává na Supabase, dokud neprojdou všechny stop podmínky a cutover nebude výslovně schválen.

```bash
npm run neon:preflight
npm run neon:migrate
npm run neon:auth-import
```

Všechny tři příkazy jsou bez dalších přepínačů pouze informativní a nic nezapisují. Databázový staging import je ověřený; Auth import je připravený na izolované Preview větvi se zachováním UUID a bez kopírování hesel či sessions.

## Produktový směr

Syllonaut propojuje tři fáze:

1. **Příprava mise** — učitel popíše, co chce studenty naučit a jak má hodina vypadat.
2. **Start živé výuky** — lekce se odstartuje jako živá session a studenti se připojí přes kód/QR.
3. **Řídicí centrum a vyhodnocení** — učitel vede tempo, vidí odpovědi a po hodině pracuje s výsledky.

Kosmický slovník je vrstva značky, ne nový odborný žargon. V datovém modelu a technické architektuře zůstávají standardní pojmy `lesson`, `session`, `participant` a `response`.

## Značka a doména

- produkt: **Syllonaut**;
- hlavní doména: **syllonaut.com**;
- claim: **Od nápadu k odučené hodině. S AI.**;
- produktová kategorie: **AI navigátor pro interaktivní výuku.**

Autoritativní repository zůstává `vaclavloubek/vibelesson`, dokud nebude případně přejmenováno samostatným krokem.

Podrobný stav, rozhodnutí a roadmapa jsou v `PROJECT.md`.
