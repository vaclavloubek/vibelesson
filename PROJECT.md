# EduPilot — projektový stav

Aktualizováno: 2026-09-16

## 1. Vize

**EduPilot — AI kopilot pro interaktivní výuku.**

EduPilot má učiteli umožnit vytvořit a vést interaktivní hodinu podobně snadno, jako dnes zadává prompt AI. Učitel nemá skládat jednotlivé slajdy a formuláře ručně. Popíše téma, cílovou skupinu, délku a styl výuky a EduPilot z toho sestaví prakticky použitelnou lekci.

Dlouhodobý produktový tok:

1. **Tvorba** — učitel popíše hodinu běžným jazykem.
2. **AI návrh** — EduPilot vytvoří strukturovanou lekci z ověřených typů aktivit.
3. **Úpravy** — učitel mění celou lekci nebo jednu aktivitu přirozeným jazykem.
4. **Publikování** — učitel spustí živou session a získá kód/QR.
5. **Výuka** — studenti se připojí z mobilů bez registrace a plní aktivity.
6. **Řízení** — učitel vidí odpovědi, postup, čas a týmové skóre.
7. **Vyhodnocení** — po hodině dostane souhrn výsledků a může lekci uložit nebo upravit pro příště.

EduPilot tedy nemá být pouze generátor příprav, ale nástroj pro **tvorbu + vedení + vyhodnocení interaktivní výuky**.

## 2. Produktový princip

Zásadní architektonické rozhodnutí: AI **negeneruje libovolný React/HTML kód**.

Místo toho generuje validovaný strukturovaný `Lesson` JSON. UI jej skládá z předem připravených, otestovaných interaktivních komponent. Učitel má zkušenost podobnou vibecodingu, ale výsledná aplikace zůstává stabilní, bezpečná a předvídatelná.

To znamená:

- AI rozhoduje o didaktickém návrhu a obsahu;
- aplikace rozhoduje o tom, jak se jednotlivé typy aktivit vykreslí a chovají;
- validace přes Zod brání nekonzistentním výstupům;
- úprava jedné aktivity nepřegeneruje automaticky zbytek lekce.

## 3. Cílový uživatel

Primárně učitel, který chce aktivní a interaktivní výuku, ale nechce ručně stavět Mentimeter, Genially, Forms a prezentaci zvlášť.

První testovací use case:

- vysokoškolská výuka;
- semináře 60–180 minut;
- týmová práce;
- kvízy, hlasování, otevřené odpovědi, ranking, postupné odhalování informací;
- humor a praktické scénáře;
- studentské telefony jako hlavní interakční zařízení.

Aplikace však nesmí být architektonicky omezená jen na vysoké školy.

## 4. Branding

Název: **EduPilot**

Pracovní claim: **AI kopilot pro interaktivní výuku.**

Alternativní marketingová věta: **Popište hodinu. EduPilot z ní udělá interaktivní výuku.**

Původní pracovní název projektu byl VibeLesson. V UI, metadatech, README, package name a AI system promptu je už změněn na EduPilot.

### Zbývající technický rename

GitHub repository se stále fyzicky jmenuje:

`vaclavloubek/vibelesson`

Je vhodné jej později ručně přejmenovat na `vaclavloubek/edupilot`. Připojený GitHub nástroj v této relaci neumí měnit název repository.

## 5. Aktuální technologický stack

- Next.js 16.3.1
- React 19.2
- TypeScript 5.9
- Zod 4.1
- Vercel AI SDK 7
- Vercel AI Gateway
- výchozí model `openai/gpt-5.6-sol`

Plánovaná serverová vrstva pro živou výuku:

- Supabase Auth
- Supabase Postgres
- Supabase Realtime

Deployment:

- cílově Vercel;
- stabilní veřejné preview ještě není ověřeně nasazeno;
- předchozí přímé deploymenty vytvořily dočasná ID, která následně Vercel nedokázal dohledat;
- správný další krok je založit/importovat Vercel projekt přímo z GitHub repository a teprve poté opravovat případné build chyby.

## 6. Datový model lekce

Aktuální `LessonSchema` obsahuje:

- `title`
- `subtitle?`
- `audience`
- `totalMinutes`
- `groupSize`
- `learningObjectives[]`
- `blocks[]`

Aktuální typy bloků:

- `intro`
- `team_task`
- `poll`
- `quiz`
- `open_text`
- `ranking`
- `reveal`
- `timer`
- `exit_ticket`

Blok může obsahovat:

- `id`
- `type`
- `title`
- `durationMinutes`
- `instructions`
- `options?`
- `items?`
- `correctAnswer?`
- `revealText?`
- `teacherNote?`
- `points?`

Současná hranice je 3–16 bloků na lekci, maximálně 60 minut na jeden blok a 10–360 minut na celou lekci.

## 7. Co je už implementováno

### Generování lekce

Endpoint `/api/generate` přijímá:

- volný prompt;
- cílovou skupinu;
- požadovanou délku;
- velikost týmu;
- tón.

AI vrací validovaný `Lesson` objekt.

### AI úprava celé lekce

Endpoint `/api/revise` dostane existující lekci a instrukci typu:

- „Udělej druhé cvičení absurdnější.“
- „Zkrať úvod.“
- „Přidej více týmové soutěže.“
- „Omez výklad.“

AI má zachovat vše, co instrukce nemění.

### AI úprava jedné aktivity

Endpoint `/api/revise-block` upraví pouze jeden vybraný blok a zachová jeho `id`.

To je důležitý produktový princip: učitel má mít možnost jemně ladit lekci bez zničení již připravené struktury.

### Učitelský a studentský náhled

Aktuální UI umí přepínat:

- učitelský náhled;
- studentský režim.

Studentský režim je zatím pouze náhled stejné lekce, nikoli samostatná živá session.

### Demo lekce

Aplikace obsahuje demo „Mediální mise“ pro mediální gramotnost. Díky tomu lze základ UI testovat i bez připojené AI.

## 8. AI didaktická pravidla

System prompt aktuálně vyžaduje zejména:

- hotová a přímo čitelná zadání studentům;
- aktivní práci studentů před dlouhým výkladem;
- humor jen podle věku a tónu, ne infantilně;
- realistickou délku bloků;
- konkrétní týmové výstupy;
- korektně vyplněné možnosti u poll/quiz;
- teacher notes skryté před studentem;
- bodování jen tam, kde dává smysl;
- nevymýšlet reálné studie, citace nebo data;
- pokud je potřeba scénář, použít zjevně fiktivní situaci;
- celkovou délku co nejblíže požadavku učitele.

## 9. Co zatím NENÍ hotové

- stabilní ověřený Vercel deployment;
- přihlášení učitele;
- ukládání lekcí;
- databáze;
- veřejná studentská URL;
- QR kód / session code;
- současné připojení více studentů;
- živé odpovědi;
- živé hlasování;
- scoreboard;
- časovač řízený učitelem napříč telefony;
- řízení aktuálního bloku učitelem;
- výsledky a report po lekci;
- historie/verzování lekcí;
- sdílení lekcí mezi učiteli;
- práce se soubory/sylaby jako zdrojem pro generování;
- moderace nebo schvalování AI obsahu před publikováním.

## 10. Nejbližší roadmapa

### Milník A — veřejná alfa

Cíl: učitel si otevře EduPilot na normální URL a může testovat tvorbu lekce.

- [x] Next.js základ
- [x] Lesson schema
- [x] demo lekce
- [x] AI generování
- [x] úprava celé lekce
- [x] úprava jednoho bloku
- [x] teacher/student preview
- [x] rebrand na EduPilot v aplikaci
- [ ] Vercel projekt z GitHub repo
- [ ] úspěšný production/preview build
- [ ] ověření desktop + mobil
- [ ] AI Gateway autentizace v deploymentu

Odhad stavu: **cca 75 %**.

### Milník B — živá hodina

Cíl: učitel klikne na „Spustit hodinu“ a studenti se připojí přes kód nebo QR.

- Supabase projekt;
- datový model sessions, participants, responses;
- anonymní vstup studenta pomocí session code;
- učitel ovládá aktuální blok;
- Realtime synchronizace;
- sběr odpovědí;
- poll výsledky v reálném čase;
- týmová jména;
- scoreboard;
- ukončení session.

Odhad stavu: **0–5 %**.

### Milník C — produkt pro opakované používání

- učitelské účty;
- knihovna vlastních lekcí;
- duplikace a verzování;
- historie sessions;
- export výsledků;
- sdílení lekce s jiným učitelem;
- šablony;
- tvorba z přiloženého sylabu/PDF;
- možnost změnit styl celé výuky jedním pokynem;
- analytika využití.

## 11. Produktová UX pravidla

1. Učitel by neměl potřebovat technické znalosti.
2. Přirozený jazyk je primární způsob tvorby a úprav.
3. Ruční editace musí být možná tam, kde je rychlejší než prompt.
4. Učitel musí vždy před spuštěním vidět, co studenti uvidí.
5. Student se ideálně připojuje bez registrace.
6. Mobilní studentské UI má být jednodušší než učitelské UI.
7. Zadání aktivit musí být samostatně pochopitelné — učitel je nemá opakovat.
8. AI nesmí potichu změnit jiné části lekce při lokální úpravě.
9. Generování nesmí produkovat falešné studie, citace a faktická tvrzení prezentovaná jako skutečná.
10. Interaktivita má sloužit didaktickému cíli, ne být samoúčelná gamifikace.

## 12. Doporučený datový model pro živou výuku

Návrh pro Supabase, ještě není implementovaný:

### teachers

- `id`
- `email`
- `display_name`
- timestamps

### lessons

- `id`
- `teacher_id`
- `title`
- `lesson_json`
- `version`
- timestamps

### sessions

- `id`
- `lesson_id`
- `teacher_id`
- `join_code`
- `status` (`draft`, `live`, `ended`)
- `active_block_id`
- `started_at`
- `ended_at`

### participants

- `id`
- `session_id`
- `display_name`
- `team_name?`
- `joined_at`

### responses

- `id`
- `session_id`
- `block_id`
- `participant_id`
- `payload jsonb`
- `points?`
- `created_at`

Před implementací je potřeba ověřit RLS a rozhodnout, jak bezpečně umožnit anonymní studentský vstup bez plnohodnotného účtu.

## 13. Repo a důležité soubory

Aktuální repository:

`vaclavloubek/vibelesson`

Hlavní soubory:

- `app/page.tsx` — hlavní builder UI;
- `app/layout.tsx` — metadata;
- `app/api/generate/route.ts` — generování lekce;
- `app/api/revise/route.ts` — úprava lekce;
- `app/api/revise-block/route.ts` — úprava jednoho bloku;
- `components/LessonPreview.tsx` — teacher/student render lekce;
- `lib/schema.ts` — Zod datový model;
- `lib/ai.ts` — AI pravidla a generování;
- `lib/demo.ts` — demo mediální lekce;
- `README.md` — rychlý technický přehled;
- `PROJECT.md` — tento dokument;
- `CONTINUATION_PROMPT.md` — prompt pro pokračování projektu v novém chatu.

## 14. Pravidla dalšího vývoje

- Postupovat po malých ověřitelných krocích.
- Nejdřív TEST/OVĚŘENÍ, potom další větší funkce.
- Nepropojovat hned vše do Supabase, dokud není stabilní frontend preview.
- U změn existující funkcionality vždy ověřit kompatibilitu se studentským mobilním režimem.
- Nepřidávat funkce jen proto, že je umí konkurence; každá má řešit konkrétní problém učitele nebo studenta.
- Před větší změnou schématu zkontrolovat dopad na generování, render, uložené lekce a budoucí sessions.
