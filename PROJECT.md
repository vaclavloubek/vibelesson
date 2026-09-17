# Syllonaut — projektový stav

Aktualizováno: 2026-09-17

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
8. **Průběžné vyhodnocení** — quizy se bodují deterministicky, vybrané otevřené a týmové odpovědi může na pozadí hodnotit AI podle rubriky; učitel má poslední slovo.
9. **Vyhodnocení po hodině** — historický report a návrat k výsledkům z dashboardu.

Syllonaut tedy není jen generátor příprav. Je to nástroj pro **tvorbu + ukládání + vedení + průběžné hodnocení + vyhodnocení interaktivní výuky**.

## 2. Branding a produktový jazyk

Oficiální značka od 2026-09-16: **Syllonaut**.

Claim: **AI navigátor pro interaktivní výuku.**

Hlavní doména: **syllonaut.com**. Doména je zakoupená. Metadata aplikace jsou již připravená pro `https://www.syllonaut.com`, ale samotné definitivní produkční DNS/Vercel připojení se nepovažuje za ověřené, dokud není explicitně zkontrolováno.

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

Technické/doménové názvy zůstávají standardní: lesson, session, participant, response, team, evaluation apod. Datový model se kvůli brandingu nepřejmenovává.

Historie názvů:

- původní pracovní název: `VibeLesson`;
- následný název: `EduPilot`;
- aktuální značka: **Syllonaut**.

Autoritativní repository:

`vaclavloubek/vibelesson`

Starší `vaclavloubek/edupilot` není autoritativní a nesmí se pro další práci používat.

`PROJECT.md` je hlavní zdroj pravdy pro produkt, branding, architekturu, stav a priority. Aktualizuje se pouze na výslovný pokyn uživatele.

## 3. Veřejný web a informační architektura

Aktuální routy:

- `/` — veřejná produktová landing page;
- `/new` — tvorba nové AI lekce;
- `/lessons` — učitelský dashboard / knihovna lekcí + poslední výsledky;
- `/lessons/<id>` — pracovní prostor uložené lekce;
- `/sessions/<id>` — teacher live session / po ukončení také report;
- `/join` a `/join/<code>` — studentský vstup;
- `/student/<id>` — studentský live pohled.

Landing page používá hero **„Z nápadu do živé interaktivní hodiny.“**, CTA **„Připravit hodinu“**, ukázku toku zadání → AI návrh → živá hodina, Mission Control preview, přehled typů aktivit a závěrečné CTA.

CTA vede na `/new`. Uživatel může začít zadáním bez okamžité registrace; účet je potřeba až při skutečném spuštění AI generování.

Landing obsahuje guided scroll cues mezi sekcemi a back-to-top ovládání. Běžné scrollování zůstává zachované a reduced-motion je respektováno.

SEO/social stav:

- `metadataBase` je nastavené na `https://www.syllonaut.com`;
- landing má canonical `/`;
- OpenGraph metadata používají značku Syllonaut, `cs_CZ` a website typ;
- Twitter používá `summary_large_image`;
- robots mají index/follow;
- `app/opengraph-image.tsx` generuje 1200×630 social preview v orbitálním vizuálu Syllonautu.

## 4. Vizuální systém — Orbital Precision

Aktuální design systém: **Orbital Precision**.

- světlý, teplý základ;
- indigo jako hlavní akcent;
- jemná kosmická/orbitální metafora;
- Geist + Geist Mono;
- vlastní SVG `SyllonautMark` založený na trajektorii/orbitě;
- konzistentní focus, hover, touch a reduced-motion stavy;
- teacher Mission Control vizuálně výraznější než studentský pohled;
- studentské UI mobile-first;
- ranking položky mají stabilní barevné identity.

Mobilní fix: `input`, `textarea` a `select` mají na mobilu minimálně 16px font, aby iOS Safari při focusu automaticky nezoomovalo viewport. Manuálně ověřeno.

Teacher live UX od B.7:

- **Skóre** a **AI hodnocení** jsou dva kompaktní rozbalovací moduly přímo v horním live control baru pod progress barem;
- nejsou fixed overlay, nic nepřekrývají a jsou vždy objevitelná bez scrollování;
- toto finální uspořádání bylo uživatelem manuálně schváleno jako vyhovující.

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
- provider připnutý na `openai`;
- structured outputs používají provider-compatible schema + následnou přísnou aplikační validaci.

Production:

- Vercel projekt: `edupilot2` — legacy technický název;
- legacy URL: `https://edupilot2.vercel.app/`;
- cílová hlavní doména: `https://www.syllonaut.com/`;
- autoritativní branch: `main`;
- Vercel plán: Pro.

Supabase:

- project ref: `qsjddlgmabgmtssvntmn`;
- region: `eu-west-1`;
- Postgres 17;
- plán: Free podle posledního ověřeného projektového stavu;
- RLS aktivní;
- organizační label `EduPilot` je legacy technický název a není priorita ho migrovat.

## 6. Zásadní architektonické principy

AI **negeneruje libovolný React/HTML kód**. Generuje validovaný strukturovaný `Lesson` JSON a aplikace jej skládá z připravených komponent.

Důsledky:

- AI rozhoduje o didaktickém návrhu a obsahu;
- aplikace rozhoduje o renderingu a chování bloků;
- Zod chrání strukturu;
- změna jednoho bloku nepřegeneruje automaticky zbytek lekce;
- kosmická metafora je UI/brand vrstva, nikoli datový model.

Live architektura:

- jedna lesson může mít více sessions;
- každá session ukládá `lesson_snapshot`;
- DB/server je zdroj pravdy;
- Realtime je pouze invalidation/wake-up mechanismus;
- Broadcast event je `invalidate` s payloadem `{}`;
- student nemá Supabase Auth účet;
- participant identita je chráněná náhodným tokenem: raw token pouze HttpOnly cookie, v DB pouze SHA-256 hash;
- studentský payload je whitelistovaný a nesmí obsahovat teacher-only metadata.

Hybridní scoring:

- odvozené celkové skóre se **neukládá jako další zdroj pravdy**;
- vždy se dopočítává z `lesson_snapshot`, responses/team_responses a response evaluations;
- učitelský override má přednost před AI návrhem.

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
- `gradingRubric?`

`GradingCriterion`:

- `id`
- `title` — max. 120 znaků;
- `description` — max. 500 znaků;
- `maxPoints` — integer 1–20.

Rubrika má 1–6 kritérií a je volitelná kvůli zpětné kompatibilitě starších uložených lekcí.

Aktuální lesson hranice: 3–16 bloků, max. 60 min na blok, 10–360 min celá lekce.

## 8. AI workflow, generování a kvóty

### 8.1 Generování

`/api/generate` přijímá prompt, cílovou skupinu, délku, velikost týmu a tón.

Úspěšně vygenerovaná lekce se uloží do Supabase a vrací stabilní `lesson_id`.

- `maxDuration = 300` s;
- NDJSON progress stream posílá skutečné fáze generování;
- staré `pending` quota rezervace se uklízejí migracemi `20260916181044_cleanup_stale_ai_quota_reservations.sql` a `20260916181120_fail_existing_stale_ai_requests.sql`.

### 8.2 AI úpravy

- `/api/revise` — celá lekce;
- `/api/revise-block` — jediný blok při zachování jeho id.

Úspěšné změny se zapisují do stejné uložené lekce.

### 8.3 Didaktická pravidla

System prompt vyžaduje zejména:

- hotová a samostatně pochopitelná zadání;
- aktivní práci před dlouhým výkladem;
- realistickou délku bloků;
- `team_task` s jedním jasným společným textovým výstupem;
- validní možnosti u poll/quiz;
- ranking všech položek + povinné zdůvodnění;
- `teacherNote` pouze pro teachera;
- žádné smyšlené studie/citace prezentované jako skutečné;
- bodování jen tam, kde má didaktický smysl;
- bodovaný `open_text`, `exit_ticket` nebo `team_task` může mít strukturovanou `gradingRubric`, kterou lze použít pro AI hodnocení.

### 8.4 Auth, role a kvóty

Běžný účet:

- 5 nových lekcí / kalendářní měsíc;
- 20 AI úprav / kalendářní měsíc.

Admin účet:

- `role = admin`;
- `monthly_lesson_limit = NULL`;
- `monthly_revision_limit = NULL`;
- NULL znamená aplikačně neomezenou AI kvótu.

Platformní admin nemá automatické právo číst obsah ostatních učitelů.

`generation_requests` eviduje AI operaci, stav, vazbu na lesson a cenu.

Reprezentativní ceny 2026-09-16:

- nová 30min lekce: `$0.027862`;
- úprava celé lekce: `$0.030779`;
- úprava bloku: `$0.006154`.

AI grading ukládá vlastní skutečný cost do `response_evaluations.cost_usd`.

Tajné klíče nikdy nepatří do repository ani klientského JS.

## 9. Učitelský účet jako pracovní prostor

Implementováno a produkčně ověřeno:

- automatické ukládání nové AI lekce;
- `/lessons` knihovna;
- stabilní `/lessons/<id>`;
- autosave AI změn;
- rename / duplicate / delete;
- jednokrokové Undo bez další AI kvóty;
- lokální recovery snapshot;
- ochrana před zavřením při ukládání;
- zobrazení kvóty;
- sekce **Poslední výsledky** s až 12 posledními ukončenými sessions a přímým otevřením reportu.

Historické reporty používají `lesson_snapshot`, takže zůstávají smysluplné i po pozdější změně nebo odstranění původní lekce.

Recovery localStorage klíč: `syllonaut_last_lesson_v1`; starý `edupilot_last_lesson_v1` se umí jednorázově přemigrovat.

## 10. Live bezpečnost

- teacher pouze vlastní session;
- `profiles.role=admin` není univerzální content access;
- žádné široké anon SELECT/WRITE politiky;
- student nemění teacher-controlled session state;
- veřejný join je povolen v `lobby` a `live`, po `ended` ne;
- student nesmí dostat `teacherNote`, skryté správné odpovědi, AI rubriky, AI rationale/confidence ani poznámky učitele;
- Realtime neposílá odpovědi/skóre, pouze invalidaci;
- autorizovaný serverový fetch je zdroj pravdy;
- AI grader považuje studentskou odpověď za **nedůvěryhodná data**, nikoli instrukce; prompt injection v odpovědi se má ignorovat;
- AI hodnocení je návrh pro učitele, nikoli neomylný verdikt.

## 11. Milník B — živá hodina

### B.1 — poll / quiz / open_text

Implementováno a manuálně ověřeno.

Response je unikátní na `session × participant × block` a server dovolí zápis pouze pro aktuální blok během `live`.

### B.2 — ranking + exit ticket

Implementováno a manuálně ověřeno.

- ranking: přesná permutace snapshot položek + povinné zdůvodnění;
- exit_ticket: textová odpověď;
- teacher vidí agregované pořadí a jednotlivá zdůvodnění.

### B.3 — týmy a team_task

Implementováno.

- `teams` patří session;
- `participants.team_id` určuje členství;
- `team_responses`: jedna odpověď na `session × team × block`;
- team response až 4000 znaků;
- během live je existující team volba uzamčená, pozdní příchozí bez týmu může udělat první volbu.

### B.3.1 — editor lock + autosave

Implementováno a nasazeno.

- serverový lock per `session × team × block`;
- první editor získá lock;
- ostatní read-only se jménem editora;
- autosave cca 800 ms;
- heartbeat 4 s, TTL 12 s;
- DB trigger odmítá team response write bez platného locku;
- `team_edit_locks` server-only.

### B.4 — synchronizovaný timer + reveal výsledků

Implementováno, nasazeno a manuálně ověřeno.

- timer `idle / running / paused`;
- Start / Pauza / Pokračovat / Reset;
- server je autorita času;
- teacher-controlled reveal poll/quiz;
- reveal je per-block a jednosměrný;
- po reveal se response pro daný blok zamkne;
- quiz studentovi ukáže správnou odpověď a správnost jeho volby.

### B.5 — QR join + connection recovery

Implementováno, nasazeno a manuálně ověřeno.

- QR generovaný lokálně bez externí QR služby;
- QR/join dostupný i během live;
- connection state `Připojeno / Obnovuji spojení… / Připojeno znovu`;
- refetch při online/visibility/reconnect + 15s fallback.

### B.6 — post-session report + historie výsledků

Implementováno, nasazeno a manuálně ověřeno.

Report používá historická data:

- lesson snapshot;
- participants;
- individual responses;
- teams;
- team responses.

Obsahuje účast, čas/délku, poll/quiz, open text/exit ticket, ranking, týmové výstupy a CSV export.

Dashboard `/lessons` obsahuje **Poslední výsledky** s odkazy na reporty.

### B.7 — hybridní scoring + AI grading

**Stav: teacher-side scoring a asynchronní AI grading jsou implementované, nasazené a manuálně ověřené. Veřejné zveřejnění studentům / Presenter Mode / vesmírná vizualizace jsou další tři dohodnuté kroky a zatím nejsou implementované.**

#### B.7.1 Rubrika

- `gradingRubric` je součástí lesson block schématu;
- AI ji může vytvořit pro bodovaný `open_text`, `exit_ticket` a `team_task`;
- AI grading se používá pouze tam, kde má blok explicitně `points > 0` a validní rubriku;
- nebodované otevřené/reflexivní aktivity se automaticky nehodnotí.

#### B.7.2 Response evaluations

`response_evaluations` ukládá mimo jiné:

- vazbu na session/block a individuální nebo team response;
- snapshot odpovědi;
- snapshot rubriky;
- per-criterion scores;
- `ai_score`;
- `teacher_score` override;
- `teacher_confirmed` a volitelnou teacher note;
- rationale;
- confidence;
- status;
- model a `cost_usd`.

Stavy evaluation:

- `pending`
- `grading`
- `graded`
- `needs_review`
- `failed`

#### B.7.3 Queue + background grader

- DB trigger vytvoří/resetuje `pending` evaluation po uložení bodované textové/team odpovědi;
- studentský submit **nečeká na AI**;
- stejná odpověď zbytečně neresetuje hotové hodnocení;
- změněná odpověď zahodí staré AI hodnocení/teacher override a vrátí evaluation do pending;
- teacher tab background pump pravidelně zpracovává čekající evaluations přes teacher-auth grading endpoint;
- atomický claim chrání před dvojím gradingem;
- krátce rozepsané team autosave meziverze se nehodnotí okamžitě;
- zaseknuté grading joby lze po timeoutu znovu převzít.

Původní post-response `after()` + self-request varianta se v produkci ukázala jako nespolehlivá a byla nahrazena tímto teacher-tab pump mechanismem.

#### B.7.4 AI grader

`lib/grading.ts`:

- bere assignment, audience, odpověď a rubriku;
- vrací skóre po kritériích, celkové body, krátké zdůvodnění a confidence;
- confidence pod cca 0,70 vede k `needs_review`;
- studentský text je explicitně nedůvěryhodný obsah, ne instrukce;
- AI výsledek je návrh učiteli.

#### B.7.5 Teacher review

Teacher vidí:

- `Čeká na AI hodnocení`;
- `AI právě hodnotí…`;
- skóre;
- `Ke kontrole`;
- případnou chybu;
- po rozbalení rationale, rubriku a body po kritériích.

Teacher může:

- změnit body v povoleném rozsahu;
- přidat poznámku;
- potvrdit hodnocení.

Efektivní skóre = `teacher_score`, pokud existuje, jinak `ai_score`.

#### B.7.6 Persistent review queue

AI hodnocení není navázané pouze na právě aktivní blok. Teacher má persistentní frontu a může se ke starším AI hodnocením vrátit, zatímco studenti už pracují na dalším úkolu.

#### B.7.7 Teacher-only hybrid scoreboard

Serverový scoreboard se **dopočítává**, nepersistuje jako další zdroj pravdy.

Pravidla:

- pouze bloky s `points > 0`;
- `quiz`: deterministicky plné body za správnou odpověď, jinak 0;
- `open_text` / `exit_ticket`: efektivní AI/teacher skóre;
- `team_task`: stejné efektivní team skóre všem členům týmu;
- teacher override má přednost;
- pending/failed/missing jsou explicitně rozlišeny;
- nepotvrzený AI návrh je označen jako provizorní;
- teacher může rozbalit rozpad bodů podle bloků.

Skóre a AI hodnocení jsou v horním Řídicím centru jako dva kompaktní rozbalovací moduly pod progress barem. Tato podoba byla manuálně ověřena jako vyhovující.

#### B.7.8 Co ještě zbývá — dohodnuté pořadí implementace

**Krok 1 — zveřejnění scoreboardu studentům**

- teacher má explicitní akci **Zveřejnit pořadí / Skrýt pořadí**;
- stav musí být serverově řízený; existující `scoreboard_revealed` v sessions je určený jako groundwork a před implementací se má ověřit/reuse;
- při zveřejnění každý student na svém mobilu uvidí **své body** a **své aktuální pořadí**;
- po skrytí se osobní score/rank z mobilu zase odstraní;
- student nikdy nedostane AI confidence, rubric, rationale, teacher note ani interní review status;
- před zveřejněním má teacher dostat jasnou informaci, pokud některá hodnocení ještě čekají / jsou ke kontrole / nepotvrzená;
- Realtime pouze invaliduje; score se načítá autorizovaným serverovým requestem;
- tento krok implementovat a manuálně ověřit **samostatně před Presenter Mode**.

**Krok 2 — Presenter Mode pro projektor / centrální obrazovku**

- samostatná read-only route, ne teacher UI roztažené přes projektor;
- kandidát `/sessions/<id>/presenter` nebo `/sessions/<id>/scoreboard`;
- synchronizovaná s teacher-controlled reveal/hide;
- veřejný payload pouze sanitizované pořadí: jméno/display name, rank, score/max případně normalizovaný progress;
- žádné responses, správné odpovědi, AI internals, teacher notes nebo tokeny;
- presenter má fungovat jako centrální obrazovka ve třídě.

**Krok 3 — Moon race / vesmírná scoreboard animace**

Dohodnutý koncept:

- Země → Měsíc;
- student = raketa se jménem;
- poloha/progress rakety odpovídá poměru získaných bodů k **aktuálně dostupnému maximu bodů do této chvíle**, ne k budoucím bodům celé lekce;
- na konci hodiny lze použít finální total max;
- top 3 doletí na Měsíc a přistanou postupně **3. → 2. → 1. místo**;
- ostatní rakety mají skončit v poměrné vzdálenosti podle skóre; vizuální „výbuch“ je možné ztvárnit spíš jako elegantní ztrátu tahu / světelný burst, aby styl zůstal v Orbital Precision a nebyl chaotický;
- animace musí respektovat `prefers-reduced-motion` a mít neanimovaný fallback.

Škálování pro reálnou třídu:

- do cca 12 studentů: plná animace všech raket;
- cca 13–24: animace omezené skupiny (např. top 10), zbytek kompaktně vedle;
- 25+: kompaktní leaderboard + animace pouze top 5/10.

Teprve po ověření Kroku 1 se má začít Krok 2; teprve po ověření Presenter Mode Krok 3.

## 12. Studentské UX — aktuální stav

Student:

- se připojí přes kód nebo QR;
- zadá pouze display name;
- nepotřebuje plnohodnotný účet;
- po refreshi si drží participant identitu;
- vidí pouze aktivní blok;
- odpovídá na poll, quiz, open_text, ranking, exit_ticket;
- volí tým;
- pracuje na sdíleném team_task výstupu;
- vidí synchronizovaný timer;
- po reveal poll/quiz vidí výsledky podle B.4;
- při výpadku sítě má recovery stav;
- mobilní input focus na iOS nezoomuje viewport.

**Aktuálně student ještě nevidí hybridní celkové skóre ani leaderboard. To je bezprostřední další krok B.7.**

Mobile-first je závazné pravidlo.

## 13. Databáze — aktivní oblasti

### `profiles`
Role a AI kvóty.

### `lessons`
Vlastní uložené lekce; RLS podle `owner_id`.

### `generation_requests`
AI operace, quota rezervace, stav, cena, lesson vazba.

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
- `scoreboard_revealed` — groundwork pro veřejný scoreboard; veřejné student/presenter UX zatím není implementované
- časové údaje.

### `participants`
Student identity, display name, token hash, team_id.

### `responses`
Individuální response per participant/block/session.

### `teams`
Týmy per session.

### `team_responses`
Jedna sdílená team response per team/block/session.

### `team_edit_locks`
Server-only krátkodobé team edit locky.

### `response_evaluations`
AI/teacher hodnocení bodovaných otevřených a týmových odpovědí, včetně rubric snapshotu, score breakdownu, confidence, teacher override a ceny.

Relevantní B.7 migrace:

- `20260916193740_add_ai_response_evaluations_and_scoreboard.sql`
- `20260916195723_add_hybrid_scoring_core.sql`
- `20260916201324_reconcile_hybrid_scoring_schema.sql`
- `20260916202323_add_response_evaluation_grading_rpcs.sql`
- `20260916202357_fix_response_evaluation_rpc_rowcount.sql`
- `20260916203300_queue_scored_response_evaluations.sql`
- `20260916204500_add_teacher_evaluation_review_action.sql`

## 14. Bezpečnostní a technické položky před širším provozem

Zachovat:

- teacher pouze vlastní lesson/session;
- platformní admin není univerzální content admin;
- student bez účtu nemá široký DB přístup;
- participant token scopeovaný na session/identitu;
- student nemění teacher-controlled session state;
- public/student payloady whitelistovat;
- Realtime pouze invalidation;
- všechny kvóty a citlivé operace serverově;
- secrets nikdy klientsky.

Známé hardening položky:

- znovu projít historické quota `SECURITY DEFINER` RPC funkce a search_path;
- zvážit Supabase leaked-password protection;
- později zvážit kompozitní FK pro session/team/participant konzistenci;
- přímá authenticated práva nad `teams` jsou širší než současné API semantics;
- compatibility/legacy `respond_team` tok znovu projít vůči editor-lock modelu;
- případně uklidit starý `results_revealed` ve prospěch per-block `revealed_block_ids`;
- při veřejném scoreboardu nepřidávat široké anon DB policy: použít stávající participant capability/server endpoint a samostatně bezpečně navržený presenter access model.

## 15. Co ještě není hotové

### Live / scoring

- B.7 krok 1: teacher-controlled public scoreboard + student own score/rank;
- B.7 krok 2: Presenter Mode pro projektor;
- B.7 krok 3: Moon race scoreboard animace;
- zahrnutí hybridního skóre do post-session reportu a CSV;
- případné další vizualizace/statistiky;
- větší filtrování/archivace historie sessions;
- CRDT simultánní team edit pouze pokud bude potřeba.

### Účet / organizace

- koš místo okamžitého delete;
- trvalé verzování a víceúrovňové undo;
- sdílení lekce mezi učiteli;
- public read-only link;
- šablony;
- pinned/favorites;
- pokročilé search/sort;
- profil/výukové preference;
- historie AI spotřeby;
- export všech user dat;
- self-service delete účtu;
- školní/organizační účty a sdílená knihovna.

### Obsah / AI

- PDF/syllabus/file input;
- pokročilá analytika;
- lokalizace do dalších jazyků.

### Branding / infrastruktura

- definitivně ověřit/připojit `syllonaut.com` / `www.syllonaut.com` k produkčnímu Vercelu a DNS;
- redirect/alias strategie legacy Vercel URL;
- favicon lze dále doladit, ale OG/social preview už existuje;
- technické přejmenování Vercel projektu/repa/Supabase labelů není funkční priorita.

## 16. Roadmapa

### Milník A — AI workflow

Stav: **dokončeno**.

- [x] Lesson schema
- [x] AI generování
- [x] whole-lesson revision
- [x] single-block revision
- [x] auth / quota / cost tracking
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

- [x] session snapshot + join
- [x] anonymous student flow
- [x] teacher lobby
- [x] Realtime invalidation + REST fallback
- [x] poll / quiz / open_text
- [x] ranking + rationale
- [x] exit_ticket
- [x] teams + team_task
- [x] shared team response + lock/autosave
- [x] synchronized timer
- [x] teacher-controlled poll/quiz reveal
- [x] QR join
- [x] connection recovery
- [x] post-session report + CSV
- [x] historie výsledků v dashboardu
- [x] B.7 grading rubric
- [x] asynchronous AI grading
- [x] AI confidence + needs_review
- [x] teacher review / override / note
- [x] persistent AI review queue
- [x] teacher-only hybrid scoreboard
- [x] discoverable teacher scoring tools in top live control bar
- [ ] B.7 public reveal/hide + student own score/rank
- [ ] B.7 Presenter Mode
- [ ] B.7 Moon race animation
- [ ] hybrid scoring v post-session reportu/CSV

### Milník C — opakované a týmové používání

- verzování;
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
3. Ruční editace zůstává tam, kde je rychlejší.
4. Učitel před spuštěním vidí studentský pohled.
5. Student se připojuje bez plnohodnotné registrace.
6. Studentské UI je mobile-first a jednodušší než teacher UI.
7. Zadání musí být samostatně pochopitelné.
8. Lokální AI změna nesmí potichu měnit zbytek lekce.
9. AI nesmí vydávat smyšlené studie/citace za reálné.
10. Interaktivita má sloužit didaktickému cíli, ne samoúčelné gamifikaci.
11. Přihlášení nemá blokovat první seznámení s produktem.
12. Práce teachera se nesmí ztratit refreshem.
13. Kvóta musí být srozumitelná a serverově vynucená.
14. Destruktivní akce vyžadují potvrzení.
15. Teacher je autorita nad live stavem.
16. Refresh studentovi zachová participant identitu, pokud je to možné.
17. Historická session používá snapshot skutečně použité lekce.
18. Kosmická metafora nesmí zhoršit srozumitelnost.
19. Instrukce/input/server validace/result používají stejný response kontrakt.
20. Team response preferuje jeden aktivní editor + autosave před CRDT.
21. Realtime je invalidation; server fetch je zdroj pravdy.
22. Historické výsledky musí být znovu dohledatelné.
23. Mobilní focus nesmí rozbíjet layout.
24. AI grading nesmí zdržovat studentský submit.
25. AI grading je návrh; teacher má možnost potvrdit/změnit.
26. Nebodované otevřené aktivity se nemají automaticky hodnotit jen proto, že jsou textové.
27. Teacher scoring nástroje musí být objevitelně dostupné bez překrývání obsahu.
28. Veřejný scoreboard musí odhalovat jen minimum potřebných dat; teacher-only grading metadata zůstávají neveřejná.
29. Prezentační obrazovka je samostatný read-only produktový režim, ne zvětšené Řídicí centrum.
30. Scoreboard animace musí respektovat reduced-motion a fungovat i jako neanimovaný fallback.

## 18. Klíčové soubory

- `PROJECT.md` — zdroj pravdy;
- `app/page.tsx` — veřejná landing page + metadata;
- `app/opengraph-image.tsx` — Syllonaut social preview;
- `app/new/page.tsx` — tvorba nové lekce;
- `app/lessons/page.tsx` — Moje lekce + Poslední výsledky;
- `app/lessons/[id]/page.tsx` — lesson workspace;
- `app/sessions/[id]/page.tsx` — teacher live/report shell;
- `app/student/[id]/page.tsx` — student live page;
- `app/api/generate/route.ts` — generation/progress/persistence;
- `app/api/sessions/[id]/route.ts` — teacher live runtime;
- `app/api/sessions/[id]/report/route.ts` — historical report;
- `app/api/sessions/[id]/scoreboard/route.ts` — teacher-only derived hybrid scoreboard;
- `app/api/sessions/[id]/evaluations/*` — grading/review/queue/process teacher endpoints;
- `components/TeacherSession.tsx` — Řídicí centrum;
- `components/TeacherLiveTools.tsx` — top live Skóre + AI hodnocení;
- `components/TeacherScoreboard.tsx` — teacher-only hybrid scoreboard UI;
- `components/EvaluationReviewQueue.tsx` — persistent review queue;
- `components/EvaluationBackgroundPump.tsx` — spouštění čekajících evaluations z teacher tabu;
- `components/TeacherResponses.tsx` — live odpovědi + grading detail;
- `components/StudentSession.tsx` — student live UI;
- `components/SessionReport.tsx` — historical report + CSV;
- `components/TeamTaskResponseInput.tsx` — team lock/autosave;
- `components/SyllonautMark.tsx` — brand mark;
- `lib/schema.ts` — Lesson/GradingCriterion schema;
- `lib/ai.ts` — generation/revision AI;
- `lib/grading.ts` — AI response grader;
- `lib/live.ts` / `lib/live-server.ts` — live types/utilities;
- `supabase/functions/student-session/index.ts` — public participant flow;
- `supabase/functions/team-edit/index.ts` — team editor lock/autosave;
- `supabase/migrations/*` — DB source history.

## 19. Pravidla další práce

- vždy nejprve načíst aktuální `PROJECT.md` a relevantní soubory;
- pracovat **TEST/OVĚŘENÍ → ÚPRAVA → OVĚŘENÍ**;
- postupovat po malých, ověřitelných krocích;
- nedělat refaktory mimo řešený problém;
- AI nikdy negeneruje/spouští libovolný klientský kód;
- kvóty/oprávnění/security vynucovat serverově;
- secrets nikdy do repo ani klientského JS;
- student mobile-first;
- RLS podle skutečného access modelu;
- platformní admin není universal content admin;
- UI používá Syllonaut; legacy názvy pouze tam, kde technická migrace nemá hodnotu;
- `PROJECT.md` měnit pouze na výslovný pokyn uživatele.

### 19.1 Commit/deployment workflow — závazné

- commitovat po **logických funkčních celcích**, ne po souborech;
- před commitem celek dokončit a ověřit v dostupném rozsahu;
- samostatný commit pouze pro skutečnou rollback hranici/security/DB/infra jednotku;
- před finálním commitem vždy znovu zkontrolovat aktuální `main`, protože na repo mohou pracovat paralelní chaty;
- pokud se `main` posunul, rebase/recreate na nejnovější HEAD, nic nepřepisovat;
- žádný force update pro běžnou práci;
- Vercel build ověřit po logickém celku;
- pomocné TEMP commity nesmí být považovány za finální projektový checkpoint.

## 20. Důležité commity

Základ/brand/live:

- `150aef7a4a35a4e8af3fda4a9b3ab31d0bd68226` — Orbital Precision foundation;
- `cb672c06b6300246b5315406a1cb9989630a529e` — generation progress stream;
- `57c688b622db3377066e5110cf3f42b6c439cec3` — B.4 timer + reveal;
- `6da3053d4322075e85da699da805290b945b3ed8` — B.5 QR + recovery;
- `3076c0694e44929f27e61b21aef1f43003c4ca60` — mobile focus zoom fix;
- `5cc6571d56c4f8545de98dd63f17d39bad3cb8b6` — B.6 report;
- `66b0778dfde3d6e0dc50a0ef05ede69ae0a4c25b` — recent results dashboard;
- `85e2fb0a89affb8bb5b95c472e03b8054b0bd486` — canonical/social metadata;
- `e1a3804ae6e65e926bdf42153f740a535213eef7` + `1ab0ae6fe5c072b3b54784fc3f5099fffe0041ba` — social preview + alignment with Syllonaut mark.

B.7:

- `db4a93d03409a735e0f115c3d9171b3dece2d79c` — grading rubric foundation;
- `24d9b4d919907c24450527916423ccae7e8abc91` — scoring DB reconciliation;
- `b07f15fabf338d96f5277f21f9c8ce92dc751d1f` — AI response grader;
- `c35472fdd2e1cb3edf9a63ddb99fd7c331505873` — queue evaluations from scored responses;
- `9729e3cab0df2bc00613e7ef4c471103a0d19fc0` — grading display teacherovi;
- `7743f43d805b780635f28e70d46661f2e1b5205c` — teacher override;
- `1806a126c6c365e87de1405b64a56a6fc0af4945` — persistent review queue;
- `050db53eefe8826e26f812c81fcf3526cefdf122` — reliable background grading pump;
- `6d5ba295bec20973e21f764f6684abec01f39bab` + `5c57fa05301219565698a28194b1e8d84a309345` — teacher hybrid scoreboard + build fix;
- `42ab05193b4fe55fdb1662de7eee4ff377de88cd` — finální umístění scoring tools v top live control baru.

## 21. Bezprostřední další kroky

Nejbližší práce je **dokončení veřejné části B.7 přesně po malých krocích**:

1. **Public reveal/hide + student own score/rank.** Teacher řídí viditelnost; student vidí pouze své sanitizované skóre/pořadí. Po tomto kroku ruční test a stop.
2. **Presenter Mode.** Samostatná read-only projekční route se sanitizovaným pořadím, řízená stejným reveal state. Po tomto kroku ruční test a stop.
3. **Moon race animation.** Earth → Moon rakety podle relativního skóre; top 3 přistanou 3. → 2. → 1.; škálování podle velikosti třídy + reduced-motion fallback.
4. Poté rozšířit B.6 report/CSV o hybridní scoring.
5. Samostatně ověřit/připojit produkční `syllonaut.com` DNS/Vercel.
6. Před širším veřejným testem cílené security/hardening kolo.
