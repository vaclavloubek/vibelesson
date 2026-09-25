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
- Vercel AI Gateway, Neon Postgres + Neon Auth + Data API a Cloudflare Live Control Worker (Durable Object) pro živou hodinu, s pollingem jako zálohou.

## Lokální spuštění

```bash
cp .env.example .env.local
npm install
npm run dev
```

Lokální vývoj i Vercel Preview pracují s Neon větví `preview`: má schéma a katalog tarifů, ale žádná produkční data. Připojovací řetězec, Auth URL a Data API URL této větve vezmi z Neon Console a doplň je do `.env.local`. Na produkční větev se lokálně nepřipojuj. Turnstile používá testovací klíče Cloudflare z `.env.example`; testovací účet si vytvoř registrací (ověřovací kód přijde e-mailem od Neon Auth).

Pro lokální AI nastav `AI_GATEWAY_API_KEY`. Model lze změnit přes `AI_MODEL`; výchozí je `openai/gpt-5.6-sol`.

## Architektura

AI generuje validovaný `Lesson` JSON podle Zod schématu. UI jej vykresluje pomocí pevné sady interaktivních komponent. Učitel tak získává pocit vibecodingu, ale model negeneruje libovolný frontendový kód. Díky tomu má být výstup stabilnější, bezpečnější a lépe testovatelný.

### Databáze: Neon

Produkce běží od 2026-09-23 na Neonu (Postgres, Neon Auth a Data API; cutover #284). Server vybírá backend proměnnou `DATABASE_BACKEND=neon`; změny schématu jdou jako soubory v `neon/migrations/`. Původní Supabase projekt zůstává beze změny dat a jen pro čtení jako záloha. Prostý návrat na Supabase není povolen, protože Neon už přijal produkční zápisy (split-brain); postup, audit závislostí a průběh přechodu jsou v `docs/NEON_MIGRATION.md`.

```bash
npm run neon:preflight
npm run neon:migrate
npm run neon:auth-import
```

Nástroje sloužily k přechodu. Bez dalších přepínačů jsou pouze informativní a nic nezapisují.

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
