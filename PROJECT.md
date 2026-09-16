# EduPilot — projektový stav

Aktualizováno: 2026-09-16

## 1. Vize

**EduPilot — AI kopilot pro interaktivní výuku.**

EduPilot má učiteli umožnit vytvořit a vést interaktivní hodinu podobně snadno, jako dnes zadává prompt AI. Učitel nemá ručně skládat jednotlivé slajdy, formuláře a interaktivní nástroje. Popíše téma, cílovou skupinu, délku a styl výuky a EduPilot z toho sestaví prakticky použitelnou lekci.

Dlouhodobý produktový tok:

1. **Tvorba** — učitel popíše hodinu běžným jazykem.
2. **AI návrh** — EduPilot vytvoří strukturovanou lekci z ověřených typů aktivit.
3. **Úpravy** — učitel mění celou lekci nebo jednu aktivitu přirozeným jazykem.
4. **Uložení** — lekce je navázaná na učitelský účet a lze se k ní vracet.
5. **Publikování** — učitel spustí živou session a získá kód/QR.
6. **Výuka** — studenti se připojí z mobilů bez registrace a plní aktivity.
7. **Řízení** — učitel vidí odpovědi, postup, čas a týmové skóre.
8. **Vyhodnocení** — po hodině dostane souhrn výsledků a může lekci upravit pro příště.

EduPilot tedy nemá být pouze generátor příprav, ale nástroj pro **tvorbu + ukládání + vedení + vyhodnocení interaktivní výuky**.

## 2. Zásadní architektonický princip

AI **negeneruje libovolný React/HTML kód**.

Místo toho generuje validovaný strukturovaný `Lesson` JSON. UI jej skládá z předem připravených, otestovaných interaktivních komponent. Učitel má zkušenost podobnou vibecodingu, ale výsledná aplikace zůstává stabilní, bezpečná a předvídatelná.

To znamená:

- AI rozhoduje o didaktickém návrhu a obsahu;
- aplikace rozhoduje o tom, jak se jednotlivé typy aktivit vykreslí a chovají;
- přísná aplikační validace přes Zod brání nekonzistentním výstupům;
- provider-facing AI schema je záměrně jednodušší než finální `LessonSchema`, aby bylo kompatibilní se structured outputs;
- výstup AI je po návratu z provideru normalizován a znovu ověřen přísným `LessonSchema`;
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

Aplikace nesmí být architektonicky omezená jen na vysoké školy.

## 4. Branding a repo

Název: **EduPilot**

Claim: **AI kopilot pro interaktivní výuku.**

Alternativní marketingová věta: **Popište hodinu. EduPilot z ní udělá interaktivní výuku.**

Původní pracovní název projektu byl VibeLesson. UI, metadata, README, package name a AI system prompt už používají EduPilot.

Autoritativní GitHub repository je stále:

`vaclavloubek/vibelesson`

Starší repository `vaclavloubek/edupilot` není autoritativní a nesmí se pro tento projekt používat.

Později lze repository ručně přejmenovat na `vaclavloubek/edupilot`, ale dokud se tak nestane, všechny změny patří do `vaclavloubek/vibelesson`.

`PROJECT.md` je zdroj pravdy pro stav projektu a aktualizuje se pouze na výslovný pokyn uživatele.

## 5. Aktuální technologický stack a deployment

- Next.js 16.3.1
- React 19.2
- TypeScript 5.9
- Zod 4.1
- Vercel AI SDK 7
- Vercel AI Gateway
- Supabase Auth
- Supabase Postgres + RLS
- budoucí živá výuka: Supabase Realtime

AI model:

- výchozí model: `openai/gpt-5.6-sol`;
- routing je připnutý na provider `openai`, aby Gateway neposílala Sol přes dražší Azure variantu;
- structured outputs jsou používané přes provider-compatible schema a následnou přísnou aplikační validaci.

Production:

- Vercel projekt: `edupilot2`
- veřejná URL: `https://edupilot2.vercel.app/`
- autoritativní branch: `main`
- production build je funkční a opakovaně ověřený.

Supabase:

- samostatná organizace: `EduPilot`
- projekt ref: `qsjddlgmabgmtssvntmn`
- region: `eu-west-1`
- plán: Free
- RLS je zapnuté na veřejných tabulkách.

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

## 7. Co je implementováno

### 7.1 Generování lekce

Endpoint `/api/generate` přijímá:

- volný prompt;
- cílovou skupinu;
- požadovanou délku;
- velikost týmu;
- tón.

AI vrací validovaný `Lesson` objekt.

### 7.2 AI úprava celé lekce

Endpoint `/api/revise` dostane existující lekci a instrukci učitele. AI má zachovat vše, co instrukce nemění.

### 7.3 AI úprava jedné aktivity

Endpoint `/api/revise-block` upraví pouze jeden vybraný blok a zachová jeho `id`.

To je důležitý produktový princip: učitel musí mít možnost jemně ladit lekci bez zničení již připravené struktury.

### 7.4 Učitelský a studentský náhled

UI umí přepínat:

- učitelský náhled;
- studentský režim.

Studentský režim je zatím pouze náhled stejné lekce, nikoli samostatná živá session.

### 7.5 Demo lekce

Aplikace obsahuje demo „Mediální mise“ pro mediální gramotnost. Základ UI je díky tomu testovatelný i bez AI.

### 7.6 Přihlášení a registrace

Je implementovaný Supabase Auth přes aktuální SSR pattern pro Next.js:

- `@supabase/ssr`;
- browser/server klient;
- `proxy.ts` pro obnovu session;
- registrace e-mailem a heslem;
- potvrzení e-mailu;
- přihlášení a odhlášení;
- zobrazení přihlášeného e-mailu a kvót v UI.

Veřejná demo lekce zůstává dostupná bez přihlášení. AI endpointy jsou dostupné pouze přihlášeným uživatelům; anonymní přímé POST volání vrací 401.

### 7.7 Role a kvóty

Tabulka `profiles` obsahuje roli a měsíční limity.

Běžný účet:

- **5 nových lekcí za kalendářní měsíc**;
- **20 AI úprav za kalendářní měsíc** dohromady pro úpravu celé lekce i jednotlivých bloků.

Admin účet:

- `role = admin`;
- `monthly_lesson_limit = NULL`;
- `monthly_revision_limit = NULL`;
- `NULL` znamená aplikačně neomezenou kvótu.

Aktuální hlavní účet uživatele je nastaven jako admin. Globální Vercel budget však platí i pro admina jako bezpečnostní strop.

Kvóty jsou vynucené serverově přes databázovou rezervaci, ne pouze v UI. Paralelní požadavky tedy nemají jednoduše obejít limit. Neúspěšný AI request se označí jako `failed` a do měsíční kvóty se nepočítá.

### 7.8 Evidence AI provozu a skutečných nákladů

Tabulka `generation_requests` eviduje:

- uživatele;
- typ operace (`generate_lesson`, `revise_lesson`, `revise_block`);
- stav `pending` / `succeeded` / `failed`;
- čas;
- skutečnou cenu z `providerMetadata.gateway.cost` v USD.

Naměřené reprezentativní ceny dne 2026-09-16:

- nová 30min lekce: **$0.027862**;
- úprava celé lekce: **$0.030779**;
- úprava jednoho bloku: **$0.006154**.

Tři úspěšné testovací operace dohromady stály přibližně **$0.0648**. Předchozí requesty blokované free-tierem měly v AI Gateway cenu $0.0000.

Tyto hodnoty jsou měření několika konkrétních requestů, ne garantovaná cena každé budoucí operace.

### 7.9 AI Gateway a nákladová ochrana

AI Gateway je odemčený placenými kredity. Karta je přidaná a byl proveden první top-up.

Používá se samostatný API key `edupilot production`, uložený ve Vercel environment variable:

`AI_GATEWAY_API_KEY`

Tajnou hodnotu klíče nikdy neukládat do repository ani do dokumentace.

Nákladové pojistky:

- API key má nastavený spend budget **$10**;
- byl nastaven i team budget **$10**;
- uživatelské kvóty 5 lekcí + 20 úprav;
- skutečné ceny se zapisují do Supabase.

Před širším veřejným provozem znovu ověřit reset period budgetů ve Vercelu a zda mají platit oba limity, nebo pouze projekt/API-key limit.

## 8. Databáze — aktuální základ

V Supabase už existuje databázový základ pro účty a budoucí knihovnu lekcí.

### `profiles`

Účel:

- metadata uživatele;
- role;
- lesson quota;
- revision quota.

### `lessons`

Tabulka je vytvořená jako základ pro lekce navázané na uživatele.

**Důležité:** aplikace do ní zatím v běžném UX automaticky neukládá vygenerované ani upravené lekce. Databázová tabulka tedy existuje, ale produktová funkce „Moje lekce“ ještě není implementovaná.

### `generation_requests`

Interní evidence AI operací, kvót, výsledků a ceny.

### Quota RPC

Existují RPC pro atomickou rezervaci a dokončení AI requestů a pro čtení stavu kvóty.

Známá technická poznámka: Supabase advisor upozorňuje na `SECURITY DEFINER` quota RPC. Funkce jsou omezené na `auth.uid()`, ale před širším veřejným provozem je vhodné rezervace/dokončení AI spotřeby přesunout do čistě serverové obsluhy se Supabase secret/service credential a klientovi ponechat jen bezpečné read-only quota API.

## 9. AI didaktická pravidla

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

## 10. Co zatím NENÍ hotové

Nejbližší chybějící produktové funkce:

- automatické uložení / ruční uložení vytvořené lekce k uživatelskému účtu;
- obrazovka **Moje lekce**;
- otevření a pokračování v dříve uložené lekci;
- přejmenování, duplikace a smazání lekce;
- historie/verzování lekcí;
- sdílení lekce mezi učiteli;
- profil a nastavení uživatele;
- self-service smazání účtu / export dat;
- případné organizace/týmy/školní účty.

Živá výuka zatím není implementovaná:

- veřejná studentská URL;
- QR kód / session code;
- současné připojení více studentů;
- živé odpovědi;
- živé hlasování;
- scoreboard;
- časovač řízený učitelem napříč telefony;
- řízení aktuálního bloku učitelem;
- výsledky a report po lekci.

Další pozdější funkce:

- práce se soubory/sylaby jako zdrojem pro generování;
- šablony;
- analytika využití;
- export výsledků;
- moderace nebo schvalování AI obsahu před publikováním.

## 11. Roadmapa

### Milník A — veřejná alfa

Cíl: učitel si otevře EduPilot na normální URL, přihlásí se a může bezpečně generovat a upravovat lekce.

- [x] Next.js základ
- [x] Lesson schema
- [x] demo lekce
- [x] AI generování
- [x] úprava celé lekce
- [x] úprava jednoho bloku
- [x] teacher/student preview
- [x] rebrand na EduPilot
- [x] Vercel projekt z GitHub repo
- [x] production build
- [x] desktop + mobil smoke ověření
- [x] Supabase Auth
- [x] ochrana všech AI endpointů
- [x] uživatelské kvóty
- [x] admin neomezený limit
- [x] AI Gateway placené kredity
- [x] $10 spend ochrana
- [x] evidence skutečné ceny všech tří AI operací

Stav: **funkční veřejná alfa / základní AI workflow hotové**.

Dočasný public-alpha GitHub Actions smoke workflow byl po dokončení testů odstraněn.

### Milník A.1 — účet jako skutečný pracovní prostor

Cíl: přihlášení není jen vstupenkou k AI, ale účet drží uživatelovu práci.

Priorita:

1. uložit vytvořenou lekci k uživateli;
2. knihovna **Moje lekce**;
3. otevřít / pokračovat v úpravách;
4. přejmenovat;
5. duplikovat;
6. smazat;
7. rozhodnout autosave vs explicitní Save;
8. později verzování a sdílení.

Stav: **databázový základ existuje, produktová vrstva zatím není zapojená**.

### Milník B — živá hodina

Cíl: učitel klikne na „Spustit hodinu“ a studenti se připojí přes kód nebo QR.

Plán:

- datový model sessions, participants, responses;
- anonymní vstup studenta pomocí session code;
- učitel ovládá aktuální blok;
- Supabase Realtime synchronizace;
- sběr odpovědí;
- poll výsledky v reálném čase;
- týmová jména;
- scoreboard;
- ukončení session.

Stav: **0–5 %**; Supabase základ existuje, session vrstva ne.

### Milník C — produkt pro opakované a týmové používání

- verzování lekcí;
- historie sessions;
- export výsledků;
- sdílení lekce s jiným učitelem;
- šablony;
- tvorba z přiloženého sylabu/PDF;
- možnost změnit styl celé výuky jedním pokynem;
- analytika využití;
- případně školní/organizační účty, týmová knihovna a správa členů.

## 12. Produktová UX pravidla

1. Učitel nemá potřebovat technické znalosti.
2. Přirozený jazyk je primární způsob tvorby a úprav.
3. Ruční editace musí být možná tam, kde je rychlejší než prompt.
4. Učitel musí vždy před spuštěním vidět, co studenti uvidí.
5. Student se ideálně připojuje bez registrace.
6. Mobilní studentské UI má být jednodušší než učitelské UI.
7. Zadání aktivit musí být samostatně pochopitelné — učitel je nemá opakovat.
8. AI nesmí potichu změnit jiné části lekce při lokální úpravě.
9. Generování nesmí produkovat falešné studie, citace a faktická tvrzení prezentovaná jako skutečná.
10. Interaktivita má sloužit didaktickému cíli, ne být samoúčelná gamifikace.
11. Přihlášení nemá překážet prvnímu seznámení s produktem — veřejné demo může zůstat anonymní.
12. Práce přihlášeného učitele se nesmí ztratit při refreshi nebo zavření prohlížeče, jakmile zavedeme ukládání lekcí.
13. Uživatel musí jasně rozumět své AI kvótě a tomu, co se do ní počítá.
14. Destruktivní akce jako smazání lekce nebo účtu vyžadují jednoznačné potvrzení.

## 13. Doporučený datový model pro živou výuku

Budoucí návrh navazuje na již existující `profiles` a `lessons`.

### `sessions`

- `id`
- `lesson_id`
- `teacher_id`
- `join_code`
- `status` (`draft`, `live`, `ended`)
- `active_block_id`
- `started_at`
- `ended_at`

### `participants`

- `id`
- `session_id`
- `display_name`
- `team_name?`
- `joined_at`

### `responses`

- `id`
- `session_id`
- `block_id`
- `participant_id`
- `payload jsonb`
- `points?`
- `created_at`

Před implementací živých sessions je potřeba navrhnout RLS a bezpečný anonymní studentský vstup bez plnohodnotného účtu.

## 14. Repo a důležité soubory

Aktuální repository:

`vaclavloubek/vibelesson`

Hlavní soubory:

- `app/page.tsx` — hlavní builder UI;
- `app/layout.tsx` — metadata;
- `app/api/generate/route.ts` — generování lekce + auth + lesson quota + cost tracking;
- `app/api/revise/route.ts` — úprava lekce + auth + revision quota + cost tracking;
- `app/api/revise-block/route.ts` — úprava jednoho bloku + auth + revision quota + cost tracking;
- `components/LessonPreview.tsx` — teacher/student render lekce;
- `components/AuthControls.tsx` — přihlášení, registrace, odhlášení, zobrazení kvót;
- `lib/schema.ts` — přísný Zod datový model lekce;
- `lib/ai.ts` — AI pravidla, provider-facing schema, OpenAI routing a cost metadata;
- `lib/auth.ts` — serverové získání autentizovaného uživatele;
- `lib/supabase/client.ts` — browser Supabase klient;
- `lib/supabase/server.ts` — server Supabase klient;
- `lib/demo.ts` — demo mediální lekce;
- `proxy.ts` — Supabase session refresh pro Next.js;
- `PROJECT.md` — tento zdroj pravdy.

## 15. Pravidla další práce

- Před změnami vždy načíst aktuální `PROJECT.md` a relevantní soubory z `vaclavloubek/vibelesson`.
- Postupovat po malých ověřitelných krocích: **TEST / OVĚŘENÍ → ÚPRAVA → OVĚŘENÍ**.
- Nedělat zbytečné refaktory mimo řešený problém.
- AI nikdy nesmí generovat a spouštět libovolný klientský kód.
- Všechny kvóty a oprávnění vynucovat serverově, ne jen přes UI.
- Tajné klíče nikdy neposílat do repository ani do klientského JavaScriptu.
- Po změnách ověřovat teacher i student režim; student mobile-first.
- `PROJECT.md` aktualizovat pouze na výslovný pokyn uživatele.

## 16. Bezprostřední další krok

Další práce se má zaměřit na **možnosti uživatelského účtu a ukládání práce**.

Nejdřív produktově rozhodnout:

- jak vypadá knihovna „Moje lekce“;
- zda se nová lekce ukládá automaticky po úspěšném generování, nebo až explicitním tlačítkem;
- zda úpravy autosavovat;
- jak řešit koncept / publikovanou verzi;
- přejmenování, duplikaci a mazání;
- verzování / undo historii;
- sdílení mezi učiteli;
- profil a preference;
- zobrazení kvót a historie spotřeby;
- export a smazání účtu;
- zda a kdy přidat školní/organizační účty.

Teprve po schválení produktového modelu implementovat první MVP řez: **uložení lekce + Moje lekce + otevření uložené lekce**, s RLS tak, aby běžný uživatel viděl pouze své lekce a admin neměl nechtěně plošný přístup k cizímu obsahu.