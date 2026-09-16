# VibeLesson beta

AI aplikace pro učitele: učitel popíše hodinu přirozeným jazykem a dostane hotovou interaktivní lekci, kterou může dál upravovat stejně přirozeně.

## Co tato verze umí

- generování celé lekce z volného zadání;
- strukturovaný Lesson JSON místo generování libovolného kódu;
- bezpečné interaktivní bloky: týmová mise, poll, quiz, open text, ranking, reveal, timer, exit ticket;
- „vibe edit“ celé lekce;
- „vibe edit“ jedné vybrané aktivity bez přegenerování zbytku;
- přepnutí učitelský / studentský náhled;
- demo lekce bez AI;
- připraveno pro Vercel AI Gateway.

## Lokální spuštění

```bash
cp .env.example .env.local
npm install
npm run dev
```

Pro lokální AI nastav `AI_GATEWAY_API_KEY`. Na Vercelu může AI Gateway používat Vercel OIDC.

## Architektura

AI generuje validovaný Lesson JSON podle Zod schématu. UI jej vykresluje pomocí pevné sady interaktivních komponent. Učitel tak získává pocit vibecodingu bez rizika, že model pokaždé vyrobí nový a rozbitelný frontend.

## Další iterace

- publikování lekce přes session kód / QR;
- studentské telefony bez registrace;
- Supabase Auth + Postgres + Realtime;
- sběr odpovědí a živý dashboard;
- team scoreboard a řízení tempa učitelem;
- knihovna lekcí, verze a sdílení.
