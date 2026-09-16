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
5. **Publikování / spuštění** — učitel spustí živou session a získá kód/QR.
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
- pro živou výuku plánovaný Supabase Realtime

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

Nově se úspěšně vygenerovaná lekce **automaticky uloží do Supabase ještě před odpovědí prohlížeči**. Uživatel tedy po úspěšném generování vždy dostane už uloženou lekci se stabilním `lesson_id`.

`generation_requests` u úspěšného generování dostává skutečné `lesson_id`.

### 7.2 AI úprava celé lekce

Endpoint `/api/revise` dostane existující lekci a instrukci učitele. AI má zachovat vše, co instrukce nemění.

Pokud jde o uloženou lekci, úspěšná AI úprava se automaticky zapíše do stejného řádku `lessons`, aktualizuje `updated_at` a vrátí uloženou verzi do UI.

### 7.3 AI úprava jedné aktivity

Endpoint `/api/revise-block` upraví pouze jeden vybraný blok a zachová jeho `id`.

To je důležitý produktový princip: učitel musí mít možnost jemně ladit lekci bez zničení již připravené struktury.

Stejně jako u úpravy celé lekce se změna uloží do stejné lekce a aktualizuje `updated_at`.

### 7.4 Učitelský a studentský náhled

UI umí přepínat:

- učitelský náhled;
- studentský režim.

Studentský režim je zatím pouze náhled stejné lekce, nikoli samostatná živá session.

### 7.5 Demo lekce

Aplikace obsahuje demo „Mediální mise“ pro mediální gramotnost. Základ UI je díky tomu testovatelný i bez AI.

Demo zůstává záměrně neserverová ukázka. Lze ji prohlížet bez přihlášení; po přihlášení ji lze AI upravovat, ale sama o sobě se automaticky nezařazuje do knihovny „Moje lekce“.

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

Po úspěšné AI operaci se zobrazená kvóta v UI znovu načte, takže uživatel nemusí refreshovat stránku nebo se znovu přihlásit.

### 7.8 Evidence AI provozu a skutečných nákladů

Tabulka `generation_requests` eviduje:

- uživatele;
- typ operace (`generate_lesson`, `revise_lesson`, `revise_block`);
- stav `pending` / `succeeded` / `failed`;
- čas;
- vazbu na lekci, pokud existuje;
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

### 7.10 Účet jako pracovní prostor — Milník A.1

Přihlášený učitel má nyní skutečný pracovní prostor.

Implementováno:

- automatické uložení každé nové AI lekce;
- stabilní URL lekce `/lessons/<id>`;
- stránka **Moje lekce** na `/lessons`;
- seznam vlastních lekcí řazený podle poslední změny;
- otevření a pokračování v uložené lekci;
- autosave po AI úpravě celé lekce;
- autosave po AI úpravě jednoho bloku;
- stav **Ukládám změny… / ✓ Uloženo**;
- přejmenování lekce;
- duplikace lekce;
- smazání lekce s potvrzením;
- jednoduché jednokrokové **Undo poslední AI změny** bez spotřeby další AI kvóty;
- lokální recovery snapshot poslední uložené lekce;
- ochrana před zavřením stránky během probíhajícího ukládání;
- okamžité obnovení zobrazené AI kvóty po operaci.

Produktové rozhodnutí:

- **běžná AI lekce se ukládá automaticky; nepoužívá se explicitní tlačítko Save**;
- serverová uložená lekce je zdroj pravdy;
- lokální snapshot je pouze pojistka / recovery vrstva;
- demo lekce se automaticky do knihovny neukládá.

Tento tok byl 2026-09-16 ručně end-to-end otestován na produkci: generování → Moje lekce → refresh → AI úprava → Undo → přejmenování → duplikace → smazání kopie. Test proběhl úspěšně.

## 8. Databáze — aktuální stav

### `profiles`

Účel:

- metadata uživatele;
- role;
- lesson quota;
- revision quota.

### `lessons`

Aktuální sloupce:

- `id uuid`
- `owner_id uuid`
- `title text`
- `source_prompt text?`
- `lesson jsonb`
- `created_at timestamptz`
- `updated_at timestamptz`

Tabulka je nyní aktivně používaná běžným UX.

RLS je zapnuté a ověřené pro všechny čtyři operace:

- SELECT — pouze vlastní lekce;
- INSERT — pouze s vlastním `owner_id`;
- UPDATE — pouze vlastní lekce a `owner_id` nelze převést na jiného uživatele;
- DELETE — pouze vlastní lekce.

Všechny politiky používají vazbu `(select auth.uid()) = owner_id` pro roli `authenticated`.

**Důležitý bezpečnostní princip:** platformní role `admin` sama o sobě nedává přístup k cizím lekcím. Admin má v současnosti výjimku pro AI kvóty, nikoli pro obsah ostatních uživatelů.

Serverové operace nad jednotlivou lekcí navíc explicitně filtrují podle `owner_id = userId`; RLS tedy není jedinou obrannou vrstvou.

### `generation_requests`

Interní evidence AI operací, kvót, výsledků, vazby na lekci a ceny.

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

### Živá výuka — nejbližší priorita

Zatím není implementováno:

- tlačítko **Spustit hodinu**;
- vytvoření živé session z uložené lekce;
- veřejná studentská URL;
- krátký session code;
- QR kód;
- anonymní vstup studenta bez účtu;
- lobby / seznam připojených studentů;
- řízení aktuálního bloku učitelem;
- Supabase Realtime synchronizace;
- živé odpovědi;
- poll výsledky v reálném čase;
- týmová jména;
- scoreboard;
- časovač řízený učitelem napříč zařízeními;
- ukončení session;
- výsledky a report po lekci;
- historie proběhlých sessions.

### Účet — pozdější rozšíření

Zatím odloženo, protože to není potřeba pro první funkční výuku:

- koš místo okamžitého smazání;
- trvalé verzování a historie změn;
- víceúrovňové undo;
- sdílení lekce mezi učiteli;
- veřejný read-only odkaz;
- šablony;
- oblíbené / připnuté lekce;
- pokročilé vyhledávání a třídění;
- profil a výukové preference;
- historie AI spotřeby v samostatné obrazovce;
- export vlastních dat;
- self-service smazání účtu;
- organizace / týmy / školní účty;
- sdílené knihovny lekcí.

### Další pozdější funkce

- práce se soubory/sylaby jako zdrojem pro generování;
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

Stav: **100 % základní veřejné alfy / AI workflow hotové**.

### Milník A.1 — účet jako skutečný pracovní prostor

Cíl: přihlášení není jen vstupenkou k AI, ale účet drží uživatelovu práci.

- [x] automaticky uložit vytvořenou AI lekci k uživateli
- [x] knihovna **Moje lekce**
- [x] otevřít / pokračovat v úpravách
- [x] stabilní URL `/lessons/<id>`
- [x] autosave AI úprav
- [x] stav uložení v UI
- [x] přejmenovat
- [x] duplikovat
- [x] smazat s potvrzením
- [x] jednokrokové Undo poslední AI změny
- [x] recovery snapshot poslední uložené lekce
- [x] zachovat RLS tak, aby každý uživatel viděl pouze své lekce
- [x] platformní admin nemá automatický přístup k cizím lekcím
- [x] produkční end-to-end test celého toku

Stav: **MVP Milníku A.1 dokončeno a produkčně ověřeno 2026-09-16**.

### Milník B — živá hodina

Cíl: učitel otevře uloženou lekci, klikne na **Spustit hodinu** a studenti se připojí přes krátký kód nebo QR bez registrace.

Navržené pořadí vývoje:

1. produktově přesně vymezit MVP živé session;
2. navrhnout a vytvořit bezpečný datový model `sessions`, `participants`, `responses`;
3. navrhnout RLS a bezpečný anonymní studentský vstup;
4. vytvořit session z uložené lekce;
5. teacher lobby + studentský join přes kód;
6. Supabase Realtime pro stav session a aktuální blok;
7. učitel ovládá postup mezi bloky;
8. studenti odesílají odpovědi podle typu aktivity;
9. živé výsledky pro poll/quiz/open text podle potřeb MVP;
10. ukončení session a základní souhrn.

Důležitý produktový princip:

- jedna uložená lekce může mít v čase mnoho sessions;
- session nesmí být závislá pouze na aktuálním obsahu `lessons.lesson`;
- při spuštění je potřeba uchovat **snapshot lekce**, která se skutečně odučila, případně později odkaz na konkrétní verzi;
- pokud učitel přípravu po hodině upraví, historická session musí stále reprezentovat původní obsah.

Stav: **0–5 %**; Supabase a uložené lekce existují, session vrstva zatím není implementovaná.

### Milník C — produkt pro opakované a týmové používání

- trvalé verzování lekcí;
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
5. Student se připojuje ideálně bez registrace a s minimem kroků.
6. Mobilní studentské UI má být jednodušší než učitelské UI.
7. Zadání aktivit musí být samostatně pochopitelné — učitel je nemá opakovat.
8. AI nesmí potichu změnit jiné části lekce při lokální úpravě.
9. Generování nesmí produkovat falešné studie, citace a faktická tvrzení prezentovaná jako skutečná.
10. Interaktivita má sloužit didaktickému cíli, ne být samoúčelná gamifikace.
11. Přihlášení nemá překážet prvnímu seznámení s produktem — veřejné demo může zůstat anonymní.
12. Práce přihlášeného učitele se nesmí ztratit při refreshi nebo zavření prohlížeče.
13. Uživatel musí jasně rozumět své AI kvótě a tomu, co se do ní počítá.
14. Destruktivní akce jako smazání lekce nebo účtu vyžadují jednoznačné potvrzení.
15. U živé hodiny má být učitel vždy autorita nad postupem session; student nesmí měnit stav celé hodiny.
16. Studentský vstup do session nesmí vyžadovat plnohodnotný účet.
17. Studentské zařízení musí po refreshi pokud možno obnovit vazbu na stejnou session/participant identitu.
18. Historická session musí zachovat obsah, který byl skutečně použit při výuce.

## 13. Doporučený datový model pro živou výuku

Toto je výchozí návrh před implementací; konkrétní podobu je potřeba ověřit proti MVP toku a RLS.

### `sessions`

Doporučená pole:

- `id uuid`
- `lesson_id uuid`
- `teacher_id uuid`
- `join_code text`
- `status` (`lobby`, `live`, `ended`)
- `active_block_id text?`
- `lesson_snapshot jsonb`
- `created_at`
- `started_at?`
- `ended_at?`

`lesson_snapshot` uchovává podobu lekce při spuštění session.

### `participants`

Doporučená pole:

- `id uuid`
- `session_id uuid`
- `display_name text`
- `team_name text?`
- `participant_token_hash` nebo jiný bezpečný mechanismus pro obnovení anonymní identity
- `joined_at`
- `last_seen_at?`

Student se zatím nepřihlašuje přes Supabase Auth.

### `responses`

Doporučená pole:

- `id uuid`
- `session_id uuid`
- `block_id text`
- `participant_id uuid`
- `payload jsonb`
- `points?`
- `created_at`
- případně `updated_at`, pokud mají být některé odpovědi měnitelné.

### Bezpečnostní hranice pro Milník B

- učitel může vytvářet a ovládat pouze sessions ke svým lekcím;
- učitel může číst účastníky a odpovědi pouze svých sessions;
- student bez účtu nesmí dostat obecný anonymní SELECT/UPDATE přístup k celé tabulce;
- join přes `join_code` musí být řešen úzkým serverovým API/RPC tokem, ne širokou RLS politikou typu „anon může číst sessions“;
- participant musí získat omezenou identitu/token pouze pro svou konkrétní session;
- student nesmí měnit `status`, `active_block_id`, `lesson_snapshot`, `teacher_id` ani jiné teacher-controlled hodnoty;
- veřejný studentský payload nesmí obsahovat `teacherNote`, správné odpovědi ani jiná data určená pouze učiteli, pokud je student nemá v daném okamžiku vidět.

## 14. Repo a důležité soubory

Aktuální repository:

`vaclavloubek/vibelesson`

Hlavní soubory:

- `app/page.tsx` — vstup do tvorby nové lekce;
- `app/lessons/page.tsx` — knihovna **Moje lekce**;
- `app/lessons/[id]/page.tsx` — serverové načtení konkrétní vlastní lekce a předání do workspace;
- `app/layout.tsx` — metadata;
- `app/api/generate/route.ts` — generování + auth + quota + cost tracking + automatické uložení nové lekce;
- `app/api/revise/route.ts` — AI úprava celé lekce + quota + cost tracking + autosave;
- `app/api/revise-block/route.ts` — AI úprava jednoho bloku + quota + cost tracking + autosave;
- `app/api/lessons/[id]/route.ts` — přejmenování, duplikace, smazání a uložení návratu pro Undo;
- `components/LessonWorkspace.tsx` — hlavní klientský pracovní prostor pro novou i uloženou lekci, autosave stav, recovery a Undo;
- `components/LessonPreview.tsx` — teacher/student render lekce;
- `components/AuthControls.tsx` — přihlášení, registrace, odhlášení, zobrazení a refresh kvót;
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
- U delších úkolů průběžně hlásit dokončení dílčích kroků, aby bylo zřejmé, kde práce právě je.
- Nedělat zbytečné refaktory mimo řešený problém.
- AI nikdy nesmí generovat a spouštět libovolný klientský kód.
- Všechny kvóty a oprávnění vynucovat serverově, ne jen přes UI.
- Tajné klíče nikdy neposílat do repository ani do klientského JavaScriptu.
- Po změnách ověřovat teacher i student režim; student mobile-first.
- RLS navrhovat podle skutečného access modelu; nepoužívat široké politiky jen kvůli rychlosti implementace.
- Platformní `profiles.role = admin` nepoužívat jako univerzální právo ke čtení cizího obsahu.
- Budoucí školní role `owner/admin/member` musí být oddělené od platformní role admina.
- `PROJECT.md` aktualizovat pouze na výslovný pokyn uživatele.

## 16. Bezprostřední další krok

Další práce se má zaměřit na **Milník B — první skutečnou živou session**.

Nezačínat scoreboardem ani komplexní analytikou. První vertikální řez má dokázat celý základní tok:

1. učitel otevře svou uloženou lekci;
2. klikne na **Spustit hodinu**;
3. server vytvoří session se snapshotem lekce a unikátním krátkým `join_code`;
4. učitel vidí lobby a studentský odkaz / kód;
5. student otevře veřejnou join stránku bez registrace;
6. zadá kód a zobrazované jméno;
7. objeví se v teacher lobby;
8. učitel zahájí session;
9. teacher a student UI vidí stejný `active_block_id` přes Realtime;
10. učitel přejde na další blok a student se okamžitě synchronizuje;
11. učitel session ukončí.

Teprve po spolehlivém ověření tohoto řezu přidávat odesílání odpovědí, výsledky poll/quiz, týmové body a scoreboard.

Před první databázovou změnou pro Milník B nejdřív produktově potvrdit konkrétní MVP tok, datový model, RLS a mechanismus anonymní participant identity.