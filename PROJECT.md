# Syllonaut — projektový stav

Aktualizováno: 2026-09-16

## 1. Vize

**Syllonaut — AI navigátor pro interaktivní výuku.**

Syllonaut umožňuje učiteli vytvořit, upravit, uložit, vést a následně vyhodnotit interaktivní hodinu bez skládání několika oddělených nástrojů. Učitel popíše téma, cílovou skupinu, délku a styl výuky, AI sestaví strukturovanou lekci a učitel ji může dál měnit přirozeným jazykem.

Cílový produktový tok:

1. **Příprava** — učitel popíše hodinu běžným jazykem.
2. **AI návrh** — Syllonaut vytvoří validovanou lekci z podporovaných typů aktivit.
3. **Úpravy** — učitel mění celou lekci nebo jedinou aktivitu přirozeným jazykem.
4. **Uložení** — lekce se automaticky ukládá k učitelskému účtu.
5. **Start** — učitel vytvoří živou session.
6. **Výuka** — studenti se připojí z mobilu přes kód nebo QR bez plnohodnotné registrace.
7. **Řízení** — učitel ovládá postup, timer, zveřejnění výsledků, týmy a odpovědi.
8. **Vyhodnocení** — po ukončení session dostane historický report a může se k němu vracet z dashboardu.

Syllonaut tedy není jen generátor příprav. Je to nástroj pro **tvorbu + ukládání + vedení + vyhodnocení interaktivní výuky**.

## 2. Branding a produktový jazyk

Oficiální značka od 2026-09-16: **Syllonaut**.

Claim: **AI navigátor pro interaktivní výuku.**

Hlavní doména: **syllonaut.com** — zakoupena 2026-09-16, k produkčnímu Vercel projektu zatím není považována za definitivně připojenou.

Název vychází ze spojení **syllabus + astronaut**. Kosmická metafora má být jemná, profesionální a funkční; srozumitelnost má vždy přednost před slovní hříčkou.

Aktuální produktový slovník:

- tvorba nové lekce: **Připrav výukovou misi** / **Připravit hodinu**;
- spuštění živé výuky: **Odstartovat hodinu**;
- teacher live UI: **Řídicí centrum**;
- lobby před začátkem: **Startovní zóna**;
- probíhající session: **Mise probíhá**;
- ukončená session: **Mise dokončena**;
- knihovna vlastních lekcí: **Palubní deník / Moje lekce**;
- post-session report: **Výsledky mise**.

Technické a doménové pojmy zůstávají standardní: lesson, session, participant, response, team apod. Datový model se kvůli brandingu nepřejmenovává.

Historie názvů:

- původní pracovní název: `VibeLesson`;
- následný pracovní/veřejný název: `EduPilot`;
- aktuální značka: **Syllonaut**.

Autoritativní repository:

`vaclavloubek/vibelesson`

Starší `vaclavloubek/edupilot` není autoritativní a nesmí se pro další práci používat.

`PROJECT.md` je hlavní zdroj pravdy pro produkt, branding, architekturu, stav a priority. Aktualizuje se pouze na výslovný pokyn uživatele.

## 3. Veřejný web a informační architektura

Veřejná homepage je nyní samostatná landing page na `/`.

Aktuální routy:

- `/` — veřejná produktová landing page;
- `/new` — tvorba nové AI lekce;
- `/lessons` — učitelský dashboard / knihovna lekcí + poslední výsledky;
- `/lessons/<id>` — pracovní prostor uložené lekce;
- `/sessions/<id>` — teacher live session / po ukončení také report;
- `/join` a `/join/<code>` — studentský vstup;
- `/student/<id>` — studentský live pohled.

Landing page používá hero **„Z nápadu do živé interaktivní hodiny.“**, CTA **„Připravit hodinu“**, ukázku toku zadání → AI návrh → živá hodina, vysvětlení hlavních schopností, Mission Control preview, přehled typů aktivit a závěrečné CTA.

CTA vede na `/new`. Uživatel může začít zadáním bez okamžité registrace; účet je potřeba až ve chvíli, kdy skutečně spouští AI generování.

Landing obsahuje řízené scroll cues mezi hlavními sekcemi a samostatné back-to-top ovládání. Běžné scrollování zůstává zachované a reduced-motion je respektováno.

## 4. Vizuální systém — Orbital Precision

Aktuální design systém byl sjednocen do směru **Orbital Precision**:

- světlý, teplý základ;
- indigo jako hlavní akcent;
- jemná kosmická/orbitální metafora;
- fonty **Geist** + **Geist Mono**;
- vlastní SVG `SyllonautMark` založený na trajektorii/orbitě;
- konzistentní focus, hover, touch a reduced-motion stavy;
- teacher Mission Control je vizuálně výraznější než studentský pohled;
- studentské UI zůstává mobile-first;
- ranking položky mají stabilní barevné identity, aby šly sledovat i po změně pořadí.

Metadata aplikace používají značku Syllonaut a claim „AI navigátor pro interaktivní výuku“.

Mobilní fix 2026-09-16: `input`, `textarea` a `select` mají na mobilu minimálně 16px font, aby iOS Safari při focusu automaticky nezvětšovalo viewport. Uživatel manuálně ověřil, že oprava funguje.

## 5. Technologický stack a deployment

- Next.js 16.3.1
- React 19.2
- TypeScript 5.9
- Zod 4.1
- Vercel AI SDK 7
- Vercel AI Gateway
- Supabase Auth
- Supabase Postgres + RLS
- Supabase Realtime

AI model:

- `openai/gpt-5.6-sol`;
- routing připnutý na provider `openai`;
- structured outputs používají provider-compatible schema a následnou přísnou aplikační validaci.

Production:

- Vercel projekt: `edupilot2` — legacy technický název;
- veřejná legacy URL: `https://edupilot2.vercel.app/`;
- budoucí hlavní doména: `https://syllonaut.com/`;
- autoritativní branch: `main`;
- Vercel plán: **Pro** od 2026-09-16.

Supabase:

- projekt ref: `qsjddlgmabgmtssvntmn`;
- region: `eu-west-1`;
- plán: Free;
- RLS aktivní na veřejných tabulkách;
- organizační label `EduPilot` je legacy technický název a není produktová priorita ho migrovat.

## 6. Zásadní architektonický princip

AI **negeneruje libovolný React/HTML kód**.

Generuje validovaný strukturovaný `Lesson` JSON. UI jej skládá z předem připravených komponent.

Důsledky:

- AI rozhoduje o didaktickém návrhu a obsahu;
- aplikace rozhoduje o renderingu a chování bloků;
- Zod validace chrání strukturu;
- provider-facing AI schema je jednodušší než finální `LessonSchema`;
- výstup se po návratu z provideru normalizuje a znovu validuje;
- změna jednoho bloku nepřegeneruje automaticky zbytek lekce;
- kosmická metafora je pouze UI/brand vrstva.

## 7. Datový model lekce

`LessonSchema` obsahuje:

- `title`
- `subtitle?`
- `audience`
- `totalMinutes`
- `groupSize`
- `learningObjectives[]`
- `blocks[]`

Podporované bloky:

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

Aktuální hranice: 3–16 bloků, max. 60 min na blok, 10–360 min celá lekce.

## 8. AI workflow, generování a kvóty

### 8.1 Generování

`/api/generate` přijímá prompt, cílovou skupinu, délku, velikost týmu a tón.

Úspěšně vygenerovaná lekce se před odpovědí klientovi uloží do Supabase a vrací stabilní `lesson_id`.

Od 2026-09-16:

- generation route má `maxDuration = 300` sekund, protože delší lekce mohou legitimně přesáhnout jednu minutu;
- endpoint streamuje skutečné fáze generování do workspace přes NDJSON progress stream;
- UI tedy nemusí předstírat procenta, ale může zobrazovat reálné fáze postupu;
- existují migrace `20260916181044_cleanup_stale_ai_quota_reservations.sql` a `20260916181120_fail_existing_stale_ai_requests.sql`, aby staré `pending` rezervace dlouhodobě neblokovaly kvótu.

### 8.2 AI úpravy

- `/api/revise` — úprava celé lekce;
- `/api/revise-block` — úprava jediného bloku při zachování jeho `id`.

Oba toky zapisují úspěšné změny zpět do stejné uložené lekce.

### 8.3 Didaktická pravidla

System prompt vyžaduje zejména:

- hotová a samostatně pochopitelná zadání studentům;
- aktivní práci před dlouhým výkladem;
- realistickou délku bloků;
- `team_task` s jedním jasným společným textovým výstupem;
- validní možnosti u poll/quiz;
- ranking všech položek + povinné krátké zdůvodnění;
- `teacherNote` pouze pro teachera;
- žádné smyšlené studie/citace prezentované jako skutečné;
- bodování jen tam, kde dává smysl.

### 8.4 Auth, role a kvóty

Supabase Auth přes SSR pattern (`@supabase/ssr`).

Běžný účet:

- 5 nových lekcí / kalendářní měsíc;
- 20 AI úprav / kalendářní měsíc.

Admin účet:

- `role = admin`;
- `monthly_lesson_limit = NULL`;
- `monthly_revision_limit = NULL`;
- `NULL` znamená aplikačně neomezenou AI kvótu.

Platformní admin nemá automaticky právo číst obsah ostatních učitelů.

`generation_requests` eviduje operaci, stav, vazbu na lekci a skutečnou cenu z Gateway metadata.

Reprezentativní ceny 2026-09-16:

- nová 30min lekce: `$0.027862`;
- úprava celé lekce: `$0.030779`;
- úprava bloku: `$0.006154`.

Nákladové pojistky:

- API key budget `$10`;
- team budget `$10`;
- uživatelské kvóty;
- cost tracking v Supabase.

Tajné klíče nikdy nepatří do repository ani klientského JS.

## 9. Učitelský účet jako pracovní prostor

Implementováno a produkčně ověřeno:

- automatické ukládání nové AI lekce;
- `/lessons` knihovna vlastních lekcí;
- stabilní URL `/lessons/<id>`;
- autosave AI změn;
- stav ukládání;
- rename / duplicate / delete;
- jednokrokové Undo poslední AI změny bez další AI kvóty;
- lokální recovery snapshot;
- ochrana před zavřením během ukládání;
- zobrazení kvóty;
- dashboard sekce **Poslední výsledky** s odkazy na posledních 12 ukončených sessions.

Historické session reporty jsou dostupné nezávisle na aktuální podobě původní lekce, protože používají `lesson_snapshot`.

Recovery localStorage klíč: `syllonaut_last_lesson_v1`; starý `edupilot_last_lesson_v1` se umí jednorázově přemigrovat.

## 10. Live architektura a bezpečnost

Základní principy:

- jedna lesson může mít více sessions;
- každá session ukládá `lesson_snapshot`;
- student nemá Supabase Auth účet;
- žádné široké anon RLS politiky;
- teacher čte/ovládá pouze vlastní sessions;
- `profiles.role=admin` neznamená přístup k cizím sessions;
- student nesmí dostat `teacherNote`, skrytou správnou odpověď ani teacher-only metadata;
- Realtime je pouze invalidation/wake-up vrstva;
- DB/server je zdroj pravdy;
- payload Broadcast eventu `invalidate` je prázdný `{}`;
- participant token je náhodný 32byte token;
- v DB se ukládá pouze SHA-256 hash;
- raw token je v `HttpOnly Secure SameSite=Lax` cookie;
- studentský server payload je whitelistovaný;
- REST refetch probíhá při mount/reconnect a existuje 15s polling fallback.

Veřejný join je povolen v `lobby` a `live`, po `ended` se nový student nepřipojí.

## 11. Milník B — živá hodina

### B.1 — poll / quiz / open_text

Implementováno a manuálně ověřeno.

Response je unikátní na `session × participant × block` a ukládá se upsertem.

- poll: `{ choice }`;
- quiz: `{ choice }`;
- open_text: `{ text }`, 1–2000 znaků.

Server dovolí zápis pouze pro aktuálně aktivní blok během `live`.

### B.2 — ranking + exit ticket

Implementováno a manuálně ověřeno.

- ranking: `{ ranking, text }`;
- ranking musí obsahovat všechny snapshot položky právě jednou;
- zdůvodnění je povinné;
- exit_ticket: `{ text }`.

Teacher vidí agregované pořadí podle průměrné pozice a jednotlivá zdůvodnění.

### B.3 — týmy a team_task

Implementováno.

- `teams` patří session;
- `participants.team_id` určuje členství;
- `team_responses` obsahuje jednu odpověď na `session × team × block`;
- team response má až 4000 znaků;
- teacher parser používá stejný 4000znakový kontrakt — původní 2000/4000 mismatch byl opraven hotfixem `4168cea89027872664b5a16d4ebab00eeb4be097`.

Student si v lobby může tým měnit. Po startu je existující volba zamknutá; pozdní příchozí bez týmu může při live udělat první volbu.

### B.3.1 — editor lock + autosave

Implementováno a nasazeno.

- serverový lock per `session × team × block`;
- první editor získá lock;
- ostatní vidí read-only stav a jméno editora;
- autosave cca 800 ms po poslední změně;
- heartbeat 4 s;
- TTL locku 12 s;
- blur dokončí save a až potom lock uvolní;
- DB trigger odmítá team response write bez platného locku;
- `team_edit_locks` je server-only;
- `claim_team_edit_lock` používá service role;
- `team-edit` Edge Function ověřuje participant token.

Pokročilá CRDT-like koeditace není součástí MVP a má se řešit jen pokud vznikne skutečná produktová potřeba.

### B.4 — synchronizovaný timer + reveal výsledků

Implementováno, nasazeno a uživatelem manuálně ověřeno.

Commit: `57c688b622db3377066e5110cf3f42b6c439cec3`.

Timer:

- serverově řízené stavy `idle / running / paused`;
- Start / Pauza / Pokračovat / Reset;
- klient odpočítává lokálně z posledního serverového zbývajícího času;
- refresh/reconnect se dosynchronizuje na serverový stav;
- timer není založen na nezávislém lokálním startu každého zařízení.

Reveal:

- teacher-controlled reveal pro `poll` a `quiz`;
- po zveřejnění se response pro daný blok uzamkne;
- poll studentům ukáže agregované výsledky;
- quiz navíc správnou odpověď a správnost jejich vlastní volby;
- zveřejnění se trvale eviduje per `block_id` (`revealed_block_ids`), takže návrat na dříve odhalený quiz editaci znovu neotevře.

Relevantní migrace:

- `20260916175426_add_live_timer_and_result_reveal.sql`;
- `20260916175723_persist_revealed_live_blocks.sql`.

### B.5 — QR join + connection recovery

Implementováno, nasazeno a uživatelem manuálně ověřeno.

Commit: `6da3053d4322075e85da699da805290b945b3ed8`.

- QR se generuje přímo v aplikaci bez externí QR služby;
- teacher vidí QR v lobby;
- join kód/QR zůstává dostupný i během live pro pozdní příchody;
- lze zkopírovat studentský odkaz;
- student vidí stav `Připojeno / Obnovuji spojení… / Připojeno znovu`;
- krátký síťový výpadek nesmaže aktuální aktivitu;
- recovery probíhá při `online`, návratu ke kartě, Realtime reconnectu a přes 15s polling;
- při neúspěšném prvním načtení existuje ruční retry.

### B.6 — post-session report + historie výsledků

Implementováno, nasazeno a uživatelem manuálně ověřeno.

Hlavní commit: `5cc6571d56c4f8545de98dd63f17d39bad3cb8b6`.

Report se skládá ze skutečných historických dat, ne z nové duplicitní reportovací tabulky:

- `lesson_snapshot`;
- `participants`;
- `responses`;
- `teams`;
- `team_responses`.

Report je dostupný až po `ended` a pouze teacherovi vlastnícímu session.

Obsahuje:

- počet účastníků;
- čas začátku/konce a délku session;
- souhrn interaktivních bloků;
- poll/quiz výsledky;
- správnost quiz odpovědí;
- open text / exit ticket odpovědi;
- ranking agregaci + individuální zdůvodnění;
- týmové výstupy a posledního editora;
- CSV export odpovědí.

UX hotfix `c220c4e78e2083ecbbc8238c8344dcc379042f86` zajistil, že report po ukončení session není schovaný pod viewportem, ale automaticky se zobrazí.

Dashboard `/lessons` obsahuje sekci **Poslední výsledky** s až 12 posledními ukončenými sessions a odkazy **Otevřít výsledky**. Commit: `66b0778dfde3d6e0dc50a0ef05ede69ae0a4c25b`.

## 12. Studentské UX — aktuální stav

Student:

- se připojí přes kód nebo QR;
- zadá pouze zobrazované jméno;
- nepotřebuje plnohodnotný účet;
- po refreshi si drží participant identitu;
- vidí pouze aktuální aktivní blok;
- odpovídá na poll, quiz, open_text, ranking, exit_ticket;
- volí tým;
- pracuje na sdíleném team_task výstupu;
- vidí synchronizovaný timer;
- po reveal vidí výsledky podle pravidel B.4;
- při výpadku sítě má recovery stav a automatický návrat;
- mobilní input focus už na iOS nezoomuje viewport.

Mobile-first je závazné UX pravidlo.

## 13. Databáze — aktivní oblasti

### `profiles`
Role a AI kvóty.

### `lessons`
Vlastní uložené lekce; RLS podle `owner_id`.

### `generation_requests`
AI operace, quota rezervace, stav, cena a vazba na lesson.

### `sessions`
Obsahuje mj.:

- `lesson_id`
- `teacher_id`
- `join_code`
- `status`
- `active_block_id`
- `lesson_snapshot`
- `realtime_key`
- `revealed_block_ids`
- timer state
- časové údaje.

### `participants`
Studentská identita, display name, token hash, team_id.

### `responses`
Individuální response per participant/block/session.

### `teams`
Týmy per session.

### `team_responses`
Jedna sdílená team response per team/block/session.

### `team_edit_locks`
Server-only krátkodobé týmové edit locky.

## 14. Bezpečnostní principy

- teacher pouze vlastní lesson/session;
- platformní admin není univerzální content admin;
- student bez účtu nemá široký přímý DB přístup;
- participant token je scopeovaný na konkrétní identitu/session;
- student nemění teacher-controlled session state;
- student payload neobsahuje teacher-only data;
- Realtime neposílá odpovědi ani výsledky, pouze invalidaci;
- `lesson_snapshot` chrání historický obsah;
- všechny AI kvóty a citlivé operace se vynucují serverově;
- secrets nikdy klientsky.

Známé bezpečnostní/technické položky před širším veřejným provozem:

- znovu projít historické quota `SECURITY DEFINER` RPC funkce a zvážit další server-only hardening;
- zvážit zapnutí Supabase leaked-password protection;
- DB lze později hardenovat kompozitními FK tak, aby session/team/participant konzistence byla vynucená i na referenční úrovni;
- přímá authenticated práva nad `teams` jsou širší než současné API semantics, byť běžné UI je nevyužívá;
- legacy/compatibility `respond_team` tok je vhodné před širším provozem znovu projít vůči editor-lock modelu;
- starý sloupec `results_revealed` z první B.4 migrace může být později uklizen, protože aktuální logika používá per-block `revealed_block_ids`.

## 15. Co ještě NENÍ hotové

### Live / výsledky

- plnohodnotný scoreboard / bodování napříč aktivitami;
- případné pokročilejší vizualizace výsledků;
- případné filtrování/archivace větší historie sessions nad rámec současných posledních 12 výsledků;
- případné další exportní formáty nad rámec CSV;
- CRDT-like simultánní team edit pouze pokud bude produktově potřeba.

### Účet

- koš místo okamžitého smazání;
- trvalé verzování;
- víceúrovňové undo;
- sdílení lekce mezi učiteli;
- public read-only link;
- šablony;
- oblíbené/připnuté lekce;
- pokročilé vyhledávání a třídění;
- profil a výukové preference;
- samostatná historie AI spotřeby;
- export všech uživatelských dat;
- self-service smazání účtu;
- školní/organizační účty a sdílená knihovna.

### Obsah / AI

- práce s PDF, sylaby a dalšími soubory jako vstupem;
- pokročilá analytika využití;
- případná moderace/schvalování AI obsahu;
- plnohodnotná lokalizace pro další jazyky.

### Branding / infrastruktura

- definitivně připojit `syllonaut.com` k produkčnímu Vercel projektu a DNS;
- rozhodnout o redirect/alias strategii staré Vercel URL;
- dokončit finální favicon/OG/social preview podle současného orbitálního brandu;
- případné technické přejmenování Vercel projektu, GitHub repo a Supabase labelů není funkční priorita.

## 16. Roadmapa

### Milník A — AI workflow

Stav: **dokončeno**.

- [x] Lesson schema
- [x] AI generování
- [x] whole-lesson revision
- [x] single-block revision
- [x] teacher/student preview
- [x] auth
- [x] quota enforcement
- [x] cost tracking
- [x] 300s generation window
- [x] skutečný generation progress stream
- [x] stale pending quota cleanup

### Milník A.1 — účet jako pracovní prostor

Stav: **MVP dokončeno a produkčně ověřeno**.

- [x] autosave lekcí
- [x] Moje lekce
- [x] stabilní URL
- [x] rename / duplicate / delete
- [x] jednokrokové Undo
- [x] recovery snapshot
- [x] RLS izolace
- [x] poslední výsledky sessions na dashboardu

### Milník B — živá hodina

Stav: **B.1–B.6 implementované; B.4, B.5 a B.6 manuálně ověřené v produkci**.

- [x] session snapshot
- [x] join code
- [x] anonymous student flow
- [x] teacher lobby
- [x] Realtime invalidation + REST fallback
- [x] teacher navigation bloků
- [x] poll / quiz / open_text
- [x] ranking + rationale
- [x] exit_ticket
- [x] teams + team_task
- [x] shared team response
- [x] server editor lock + autosave
- [x] synchronized timer
- [x] teacher-controlled reveal
- [x] QR join
- [x] connection recovery
- [x] post-session report
- [x] CSV export
- [x] návrat k posledním výsledkům z dashboardu
- [ ] scoreboard / bodování napříč aktivitami

### Milník C — opakované a týmové používání

- verzování lekcí;
- rozšířená historie sessions;
- sdílení mezi učiteli;
- šablony;
- PDF/syllabus input;
- analytika;
- školní/organizační účty;
- týmová knihovna a správa členů.

## 17. Produktová UX pravidla

1. Učitel nemá potřebovat technické znalosti.
2. Přirozený jazyk je primární způsob tvorby a úprav.
3. Ruční editace musí zůstat dostupná tam, kde je rychlejší.
4. Učitel musí před spuštěním vidět, co studenti uvidí.
5. Student se připojuje bez plnohodnotné registrace a s minimem kroků.
6. Studentské UI je mobile-first a jednodušší než teacher UI.
7. Zadání aktivit musí být samostatně pochopitelné.
8. AI při lokální změně nesmí potichu měnit zbytek lekce.
9. AI nesmí vytvářet falešné studie/citace prezentované jako reálné.
10. Interaktivita má sloužit didaktickému cíli, ne samoúčelné gamifikaci.
11. Přihlášení nemá blokovat první seznámení s produktem.
12. Práce přihlášeného teachera se nesmí ztratit při refreshi.
13. Kvóta musí být srozumitelná a serverově vynucená.
14. Destruktivní akce vyžadují potvrzení.
15. Teacher je autorita nad stavem live session.
16. Refresh studentovi pokud možno zachová participant identitu.
17. Historická session zachovává skutečně použitý obsah přes snapshot.
18. Kosmická metafora nesmí zhoršit srozumitelnost.
19. Instrukce, input, serverová validace a výsledky musí používat stejný response kontrakt.
20. Sdílená týmová odpověď preferuje model jednoho aktivního editora + autosave před CRDT.
21. Realtime je invalidation mechanismus; autorizovaný serverový fetch je zdroj pravdy.
22. Post-session výsledky musí být znovu dohledatelné i po opuštění session obrazovky.
23. Mobilní focus nesmí kvůli browser zoomu rozbíjet layout studentské aktivity.

## 18. Repo a důležité soubory

Repository: `vaclavloubek/vibelesson`.

Klíčové soubory:

- `app/page.tsx` — veřejná landing page;
- `components/LandingPage.tsx` — obsah a produktový flow landing page;
- `components/LandingBackToTop.tsx` — návrat nahoru na landing page;
- `app/new/page.tsx` — vstup do tvorby nové lekce;
- `app/lessons/page.tsx` — Moje lekce + Poslední výsledky;
- `app/lessons/[id]/page.tsx` — uložená lekce;
- `app/sessions/[id]/page.tsx` — teacher live/session report page;
- `app/student/[id]/page.tsx` — student live page;
- `app/api/generate/route.ts` — auth, quota, AI generation, progress stream, persistence;
- `app/api/revise/route.ts`;
- `app/api/revise-block/route.ts`;
- `app/api/sessions/[id]/route.ts` — teacher session runtime state;
- `app/api/sessions/[id]/report/route.ts` — post-session report;
- `components/LessonWorkspace.tsx` — lesson builder/workspace;
- `components/TeacherSession.tsx` — Řídicí centrum;
- `components/StudentSession.tsx` — studentský live view;
- `components/TeacherResponses.tsx` — průběžné live výsledky;
- `components/SessionReport.tsx` — historický výsledkový report + CSV;
- `components/JoinQrCode.tsx` — QR join;
- `components/LiveTimer.tsx` — synchronizovaný timer;
- `components/TeamTaskResponseInput.tsx` — team autosave + lock UX;
- `components/SyllonautMark.tsx` — orbitální brand mark;
- `lib/schema.ts` — Lesson Zod model;
- `lib/ai.ts` — AI schema, prompt, model routing, generation stages;
- `lib/live.ts` / `lib/live-server.ts` — live typy a server utilities;
- `lib/session-report.ts` — report types;
- `supabase/functions/student-session/index.ts` — anonymous student flow;
- `supabase/functions/team-edit/index.ts` — lock/autosave team edit;
- `supabase/migrations/*` — live, B.4 a quota cleanup migrace;
- `PROJECT.md` — zdroj pravdy.

## 19. Pravidla další práce

- před změnami načíst aktuální `PROJECT.md` a relevantní soubory;
- pracovat **TEST / OVĚŘENÍ → ÚPRAVA → OVĚŘENÍ**;
- u delších úkolů průběžně hlásit dokončené dílčí kroky;
- nedělat zbytečné refaktory mimo řešený problém;
- AI nesmí generovat/spouštět libovolný klientský kód;
- kvóty, oprávnění a bezpečnostní pravidla vynucovat serverově;
- secrets nikdy do repo ani klientského JS;
- po změnách ověřovat teacher i student režim;
- student mobile-first;
- RLS navrhovat podle skutečného access modelu;
- `profiles.role = admin` nepoužívat jako univerzální obsahové oprávnění;
- budoucí školní role oddělit od platformní admin role;
- UI používat značku Syllonaut; legacy názvy měnit jen když to přináší reálný přínos;
- `PROJECT.md` měnit pouze na výslovný pokyn uživatele.

### 19.1 Commit/deployment workflow — závazné

- commitovat po **logických funkčních celcích**, ne po jednotlivých souborech;
- jeden celek může zahrnovat více komponent/API/migrací, pokud tvoří jednu funkci;
- před commitem celek dokončit a ověřit v dostupném rozsahu;
- samostatný commit jen pro skutečnou rollback hranici (např. izolovaná DB migrace, security hotfix, nezávislá infra změna);
- nepoužívat commit jako průběžné ukládání každého souboru;
- Vercel build ověřit jednou za logický celek;
- při paralelních chatech před finálním commitem vždy zkontrolovat aktuální `main`;
- nikdy nepřepisovat paralelní práci přes `force`, pokud to není výslovně a bezpečně odůvodněné.

Důvod: jemné commity 2026-09-16 vyčerpaly Hobby build/deployment rate limit; projekt přešel na Vercel Pro, ale logické commitování zůstává závazným pravidlem.

## 20. Důležité implementační body a commity 2026-09-16

- `150aef7a4a35a4e8af3fda4a9b3ab31d0bd68226` — Orbital Precision design system foundation;
- `190d728bdfbb97db2c79186cd8a4086fdd5e9121` — AI generation maxDuration 300 s;
- `cb672c06b6300246b5315406a1cb9989630a529e` — skutečný generation progress stream;
- `aeb6b46e96a1c183701ddf3e3291424db57b549b` — landing page jako veřejná homepage;
- `57c688b622db3377066e5110cf3f42b6c439cec3` — B.4 timer + result reveal;
- `4168cea89027872664b5a16d4ebab00eeb4be097` — 4000znaková team response validace;
- `6da3053d4322075e85da699da805290b945b3ed8` — B.5 QR + recovery;
- `3076c0694e44929f27e61b21aef1f43003c4ca60` — mobile focus zoom fix;
- `5cc6571d56c4f8545de98dd63f17d39bad3cb8b6` — B.6 post-session report;
- `c220c4e78e2083ecbbc8238c8344dcc379042f86` — report okamžitě do viewportu;
- `66b0778dfde3d6e0dc50a0ef05ede69ae0a4c25b` — návrat k posledním výsledkům z dashboardu.

## 21. Bezprostřední další kroky

1. **Rozhodnout další produktovou prioritu po B.6.** Live MVP nyní pokrývá join, odpovědi, týmy, lock/autosave, timer, reveal, recovery, report i historii posledních výsledků.
2. Nejbližší větší otevřená live funkce je **scoreboard / bodování napříč aktivitami**; před implementací je potřeba produktově určit význam bodů u individuálních a týmových aktivit a zda má být scoreboard volitelný.
3. **Připojit `syllonaut.com` k Vercelu** a nastavit DNS/redirect strategii.
4. Před širším veřejným testováním udělat cílené security/hardening kolo: quota RPC, leaked-password protection, compatibility team response flow a případné kompozitní FK.
5. Poté řešit opakované/týmové používání: verzování, rozšířenou historii sessions, sdílení a organizační účty.
