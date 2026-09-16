# EduPilot beta

**EduPilot — AI kopilot pro interaktivní výuku.**

EduPilot je aplikace pro učitele: učitel popíše hodinu přirozeným jazykem a dostane hotovou interaktivní lekci, kterou může dál upravovat stejným způsobem. Cílem není generovat osnovu nebo prezentaci, ale přímo použitelný scénář výuky s aktivitami pro studenty.

## Co tato verze umí

- generování celé lekce z volného zadání;
- strukturovaný `Lesson` JSON místo generování libovolného kódu;
- interaktivní bloky: úvod, týmová mise, poll, quiz, open text, ranking, reveal, timer a exit ticket;
- AI úprava celé lekce přirozeným jazykem;
- AI úprava jedné vybrané aktivity bez přegenerování zbytku;
- přepnutí učitelský / studentský náhled;
- demo lekce bez AI;
- připraveno pro Vercel AI Gateway.

## Lokální spuštění

```bash
cp .env.example .env.local
npm install
npm run dev
```

Pro lokální AI nastav `AI_GATEWAY_API_KEY`. Model lze změnit přes `AI_MODEL`; výchozí je `openai/gpt-5.6-sol`.

## Architektura

AI generuje validovaný `Lesson` JSON podle Zod schématu. UI jej vykresluje pomocí pevné sady interaktivních komponent. Učitel tak získává pocit vibecodingu, ale model negeneruje libovolný frontendový kód. Díky tomu má být výstup stabilnější, bezpečnější a lépe testovatelný.

## Produktový směr

EduPilot nemá zůstat jen generátorem příprav. Cílem je propojit tři fáze:

1. **Tvorba** — učitel popíše, co chce studenty naučit a jak má hodina vypadat.
2. **Vedení výuky** — lekce se spustí jako živá session a studenti se připojí přes kód/QR.
3. **Vyhodnocení** — učitel vidí odpovědi, týmové skóre a výsledky aktivit.

## Nejbližší iterace

- nasadit stabilní veřejné preview;
- publikování lekce přes session kód / QR;
- studentské telefony bez registrace;
- Supabase Auth + Postgres + Realtime;
- sběr odpovědí a živý dashboard;
- team scoreboard a řízení tempa učitelem;
- knihovna lekcí, verze a sdílení.

Podrobný stav, rozhodnutí a roadmapa jsou v `PROJECT.md`.
