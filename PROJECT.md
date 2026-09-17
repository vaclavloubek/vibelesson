# Syllonaut — projektový stav

Aktualizováno: 2026-09-17

## 1. Vize

**Syllonaut — AI navigátor pro interaktivní výuku.**

Syllonaut umožňuje učiteli vytvořit, upravit, uložit, vést a následně vyhodnotit interaktivní hodinu bez skládání několika oddělených nástrojů. Učitel popíše téma, cílovou skupinu, délku a styl výuky nebo přidá vlastní podklady; AI sestaví strukturovanou lekci a učitel ji může dál měnit přirozeným jazykem.

Cílový produktový tok:

1. **Příprava** — učitel popíše hodinu a případně nahraje vlastní podklady.
2. **AI návrh** — Syllonaut vytvoří validovanou lekci z podporovaných typů aktivit.
3. **Úpravy** — učitel mění celou lekci nebo jedinou aktivitu přirozeným jazykem.
4. **Uložení** — lekce se automaticky ukládá k učitelskému účtu.
5. **Start** — učitel vytvoří živou session.
6. **Výuka** — studenti se připojí z mobilu přes kód nebo QR bez plnohodnotné registrace.
7. **Řízení** — učitel ovládá postup, timer, zveřejnění výsledků, týmy, odpovědi a průběžné skóre.
8. **Průběžné vyhodnocení** — quizy se bodují deterministicky, vybrané otevřené a týmové odpovědi může na pozadí hodnotit AI podle rubriky; učitel má poslední slovo.
9. **Zveřejnění výsledků** — teacher může zveřejnit osobní skóre studentům a samostatný Presenter Mode pro projekci.
10. **Vyhodnocení po hodině** — historický report a návrat k výsledkům z dashboardu.

Syllonaut tedy není jen generátor příprav. Je to nástroj pro **tvorbu + práci s podklady + ukládání + vedení + průběžné hodnocení + prezentaci skóre + vyhodnocení interaktivní výuky**.

## 2. Branding a produktový jazyk

Oficiální značka od 2026-09-16: **Syllonaut**.

Claim: **AI navigátor pro interaktivní výuku.**

Hlavní doména: **syllonaut.com**. Doména je zakoupená. Metadata aplikace jsou připravená pro `https://www.syllonaut.com`; definitivní produkční DNS/Vercel připojení je potřeba před širším veřejným spuštěním explicitně ověřit.

Název vychází ze spojení **syllabus + astronaut**. Kosmická metafora má být jemná, profesionální a funkční; srozumitelnost má vždy přednost před slovní hříčkou.

Aktuální produktový slovník:

- tvorba nové lekce: **Připrav výukovou misi** / **Připravit hodinu**;
- spuštění živé výuky: **Odstartovat hodinu**;
- teacher live UI: **Řídicí centrum**;
- lobby před začátkem: **Startovní zóna**;
- probíhající session: **Mise probíhá**;
- ukončená session: **Mise dokončena**;
- knihovna vlastních lekcí: **Palubní deník / Moje lekce**;
- post-session report: **Výsledky mise**;
- projekční scoreboard: **Prezentační režim**.

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
- `/sessions/<id>/presenter` — samostatný read-only projekční scoreboard pro učitele;
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
- akce **Zveřejnit pořadí / Skrýt pořadí** je přímo v hlavním live ovládání a zůstává dostupná i po ukončení session;
- odkaz **Prezentační režim** otevírá samostatný projekční pohled;
- toto uspořádání bylo manuálně ověřeno.

Presenter Mode používá tmavý projekční layout s vizualizací **Země → Měsíc**. Rakety reprezentují studenty a jejich poloha vždy odpovídá skutečnému relativnímu skóre; po ukončení session proběhne let od Země na bodovou pozici s akcelerací a zpomalením, top 3 mají jemné finální zvýraznění. Reduced-motion má statický fallback.

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

- aplikační model: `openai/gpt-5.6-sol`;
- běžné generování bez nahraných podkladů je přes Gateway omezené na OpenAI;
- generování s uživatelskými podklady používá Gateway routing pouze přes `bedrock` / `azure`, seřazený podle ceny a s `zeroDataRetention: true`;
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
- učitelský override má přednost před AI návrhem;
- teacher scoreboard a Presenter Mode používají centralizovaný serverový výpočet;
- studentský veřejný score payload je minimální capability-scoped výstup, nikoli široký DB přístup.

Podklady k lekci:

- originální nahrané soubory se trvale neukládají;
- text se z PDF/PPTX/DOCX/TXT/MD extrahuje v prohlížeči;
- na server se odesílá pouze extrahovaný text v omezeném rozsahu;
- obsah podkladů je pro AI **nedůvěryhodný obsah**, nikoli instrukce; prompt-like pokyny uvnitř souborů se mají ignorovat.

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

## 8. AI workflow, generování, podklady a kvóty

### 8.1 Generování

`/api/generate` přijímá prompt, cílovou skupinu, délku, velikost týmu, tón a případně extrahované texty podkladů + režim práce s nimi.

Úspěšně vygenerovaná lekce se uloží do Supabase a vrací stabilní `lesson_id`.

- `maxDuration = 300` s;
- NDJSON progress stream posílá skutečné fáze generování;
- staré `pending` quota rezervace se uklízejí migracemi `20260916181044_cleanup_stale_ai_quota_reservations.sql` a `20260916181120_fail_existing_stale_ai_requests.sql`.

Při nové lekci už nejsou parametry cílovka / délka / velikost týmu / tón předvyplněné aktivními hodnotami. UI ukazuje pouze příklady v placeholderu a uživatel musí hodnoty skutečně zadat. Volný popis může být prázdný, pokud jsou k dispozici použitelné podklady.

### 8.2 Podklady k lekci

Implementováno a manuálně ověřeno:

- podporované formáty: **PDF, PPTX, DOCX, TXT, MD**;
- nejvýše 5 souborů;
- dohromady max. 10 MB;
- originální soubory zůstávají v zařízení uživatele;
- browser extrahuje text a server dostává pouze extrahovaný text;
- podklady ani extrahovaný text se v Syllonautu trvale neukládají;
- naskenované PDF bez textové vrstvy zatím nemá OCR podporu.

Režimy práce s podklady:

- `primary` — **Vycházet z podkladů** jako z hlavního obsahového zdroje;
- `strict` — **Držet se podkladů** a nevnášet nové faktické informace;
- `inspiration` — **Použít jako inspiraci** a rozumně obsah doplnit.

Bezpečnost/privacy:

- podklady jsou v promptu explicitně označené jako nedůvěryhodný obsah;
- model nesmí následovat instrukce / změny role / systémové pokyny nalezené uvnitř dokumentů;
- requesty s podklady jsou přes Vercel AI Gateway omezené na ZDR routing `bedrock` / `azure` s `zeroDataRetention: true`.

### 8.3 AI úpravy

- `/api/revise` — celá lekce;
- `/api/revise-block` — jediný blok při zachování jeho id.

Úspěšné změny se zapisují do stejné uložené lekce.

### 8.4 Didaktická pravidla

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

### 8.5 Auth, role a kvóty

Běžný účet:

- `role = user`;
- 5 nových lekcí / kalendářní měsíc;
- 20 AI úprav / kalendářní měsíc.

Admin účet:

- `role = admin`;
- `monthly_lesson_limit = NULL`;
- `monthly_revision_limit = NULL`;
- NULL znamená aplikačně neomezenou AI kvótu.

Aktuální databázový onboarding nového účtu je už připravený na free-only start:

- trigger `on_auth_user_created` volá `private.handle_new_user()`;
- ten založí `public.profiles(id)`;
- DB defaulty nastaví `role='user'`, `monthly_lesson_limit=5`, `monthly_revision_limit=20`;
- není potřeba ani žádoucí duplikovat tarif/limity do klientské registrační logiky.

Pro první veřejnou registraci se **nebude vybírat tarif**. Každý nový běžný účet automaticky začíná ve stávající free variantě s limity 5/20. Placené tarify se řeší až v samostatném budoucím kroku.

Aktuální `AuthControls` už umí základní e-mail/heslo sign-in a `signUp`, ale produkční registrační UX, potvrzovací/recovery flow a vlastní e-mailová infrastruktura zatím nejsou dokončené.

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
- veřejný studentský scoreboard vrací pouze vlastní `score`, `maxPoints`, `rank`;
- Presenter payload obsahuje pouze sanitizované pořadí potřebné pro projekci;
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

Hybridní celkové skóre zatím není součástí B.6 reportu/CSV; to zůstává samostatný další krok.

### B.7 — hybridní scoring + AI grading + veřejné pořadí

**Stav: celý dohodnutý B.7 blok je implementovaný, nasazený a manuálně ověřený — teacher scoring, asynchronní AI grading, public reveal/hide, student own score/rank, Presenter Mode i Moon race.**

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

Původní post-response `after()` + self-request varianta se v produkci ukázala jako nespolehlivá a byla nahrazena teacher-tab pump mechanismem.

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

#### B.7.7 Hybrid scoreboard

Serverový scoreboard se **dopočítává**, nepersistuje jako další zdroj pravdy.

Pravidla:

- pouze bodovatelné bloky;
- `quiz`: deterministicky plné body za správnou odpověď, jinak 0;
- `open_text` / `exit_ticket`: efektivní AI/teacher skóre;
- `team_task`: stejné efektivní team skóre všem členům týmu;
- teacher override má přednost;
- pending/failed/missing jsou explicitně rozlišeny;
- nepotvrzený AI návrh je označen jako provizorní;
- maximum je **aktuálně dostupné maximum bodů**, ne budoucí body dosud neprošlé části lekce;
- teacher může rozbalit rozpad bodů podle bloků.

Výpočet je centralizovaný v `lib/scoreboard-server.ts` a používá ho teacher scoreboard i Presenter Mode.

#### B.7.8 Public reveal/hide + student own score/rank

Implementováno, nasazeno a manuálně ověřeno.

- teacher má explicitní akci **Zveřejnit pořadí / Skrýt pořadí**;
- akce funguje během `live` i po `ended`;
- serverový stav je `sessions.scoreboard_revealed` a přežívá refresh/reconnect;
- před reveal teacher vidí upozornění na pending / `needs_review` / nepotvrzené AI návrhy, ale může reveal provést;
- student po reveal vidí pouze své body, aktuální maximum a své pořadí;
- hide studentovi score/rank odstraní;
- po skončení lze stejným mechanismem zveřejnit finální výsledky;
- studentský payload je whitelistovaný a neobsahuje confidence, rubriku, rationale, teacher note, review status, skryté správné odpovědi ani data jiných studentů;
- nebyla přidána široká anon RLS politika.

Veřejné studentské skóre používá úzkou serverovou/RPC cestu s participant capability. Realtime pouze invaliduje; server/API zůstává zdroj pravdy.

#### B.7.9 Presenter Mode

Implementováno, nasazeno a manuálně ověřeno.

- route `/sessions/<id>/presenter`;
- samostatný read-only projekční režim, nikoli zvětšené Řídicí centrum;
- přístup má přihlášený vlastník session;
- synchronizuje se s teacher reveal/hide přes Realtime invalidaci + server fetch a má polling fallback;
- API vrací pouze whitelistovaná data nutná pro projekci: stav, název, max a po reveal `rank + displayName + score`;
- nevrací responses, správné odpovědi, AI internals, teacher notes ani tokeny.

#### B.7.10 Moon race

Implementováno, nasazeno a manuálně ověřeno.

- vizualizace Země → Měsíc;
- student = barevná raketa se jménem a body;
- poloha rakety je vždy odvozena od `score / aktuálně dostupné maximum`;
- po ukončení session se rakety animovaně rozletí od Země na své **skutečné bodové pozice**;
- let má zrychlení po startu a zpomalení před cílovou pozicí;
- top 3 dostanou jemný světelný finální efekt, ale vizualizace nikdy neposune raketu dál, než odpovídá skutečným bodům;
- do 12 studentů se zobrazují všechny rakety;
- 13–24: top 10 v hlavní dráze + kompaktní zbytek;
- 25+: top 5 v animaci + top 10 leaderboard;
- `prefers-reduced-motion` má neanimovaný fallback.

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
- po teacher reveal scoreboardu vidí **pouze své skóre / maximum / pořadí**;
- stejné finální skóre může vidět i po ukončení hodiny, pokud ho teacher zveřejní;
- po hide pořadí tato informace zmizí;
- při výpadku sítě má recovery stav;
- mobilní input focus na iOS nezoomuje viewport.

Student nikdy nedostává celý třídní leaderboard ani teacher-only grading metadata.

Mobile-first je závazné pravidlo.

## 13. Databáze — aktivní oblasti

### `profiles`
Role a AI kvóty.

Aktuální defaulty:

- `role = 'user'`;
- `monthly_lesson_limit = 5`;
- `monthly_revision_limit = 20`.

Nový auth user automaticky dostane profile řádek přes `on_auth_user_created → private.handle_new_user()`.

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
- `scoreboard_revealed` — aktivní serverový stav viditelnosti student/presenter scoreboardu
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
- `20260917033355_add_student_public_scoreboard_rpc.sql`

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
- secrets nikdy klientsky;
- nové účty a free limity zakládat DB/server autoritou, ne klientským tarifním stavem.

Aktuální public scoreboard access model:

- žádná široká anon read policy;
- student používá svůj participant token/cookie a úzký public-score server/RPC kontrakt;
- Presenter je teacher-owner-auth read-only režim;
- teacher-only scoring detail zůstává oddělený.

Známé hardening položky:

- znovu projít historické quota `SECURITY DEFINER` RPC funkce a search_path;
- před veřejnou registrací vyřešit produkční auth SMTP, potvrzování e-mailů, recovery flow a redirect URL;
- zvážit/aktivovat Supabase leaked-password protection;
- před otevřenou registrací vyhodnotit CAPTCHA a Auth rate limits;
- později zvážit kompozitní FK pro session/team/participant konzistenci;
- přímá authenticated práva nad `teams` jsou širší než současné API semantics;
- compatibility/legacy `respond_team` tok znovu projít vůči editor-lock modelu;
- případně uklidit starý `results_revealed` ve prospěch per-block `revealed_block_ids`.

## 15. Co ještě není hotové

### Registrace / auth / infrastruktura — nejbližší priorita

- produkčně připravená registrace učitele;
- vlastní SMTP pro Supabase Auth;
- branded transakční e-mail pro potvrzení registrace;
- forgot/reset password flow;
- auth confirmation/callback + bezpečné redirects;
- produkční Site URL / Redirect URL konfigurace pro `syllonaut.com`;
- SPF / DKIM / DMARC pro odesílací doménu;
- Auth rate limits / CAPTCHA / anti-abuse review;
- end-to-end test registrace s běžnou externí adresou;
- žádný tarifní výběr v první verzi: nový účet automaticky používá existující free 5/20 limity.

### Live / scoring

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
- školní/organizační účty a sdílená knihovna;
- placené tarify a billing až po samostatném produktovém rozhodnutí.

### Obsah / AI

- OCR pro naskenované PDF;
- případně další formáty podkladů;
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
- [x] volitelné source materials PDF/PPTX/DOCX/TXT/MD
- [x] browser-side text extraction + ephemeral source handling
- [x] primary / strict / inspiration režimy podkladů
- [x] prompt-injection ochrana podkladů
- [x] ZDR routing pro generování s podklady
- [x] explicitní povinné setup parametry místo předvyplněných hodnot

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

### Milník A.2 — veřejná registrace a e-mailová infrastruktura

Stav: **další priorita**.

- [ ] audit současného Supabase Auth flow a konfigurace
- [ ] produkční signup UX
- [ ] automatické free 5/20 limity bez plan pickeru — DB groundwork už existuje, ověřit E2E
- [ ] custom SMTP
- [ ] branded confirmation e-mail
- [ ] bezpečný auth confirm/callback flow
- [ ] forgot/reset password + update password
- [ ] Site URL / redirect allowlist pro produkční doménu
- [ ] SPF / DKIM / DMARC + vypnutý link tracking u auth e-mailů
- [ ] rate limit / CAPTCHA / leaked-password review
- [ ] end-to-end test registrace, potvrzení, login/logout, recovery a quota

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
- [x] B.7 public reveal/hide + student own score/rank
- [x] B.7 Presenter Mode
- [x] B.7 Moon race animation
- [ ] hybrid scoring v post-session reportu/CSV

### Milník C — opakované a týmové používání

- verzování;
- rozšířená historie sessions;
- sdílení mezi učiteli;
- šablony;
- další source-material možnosti / OCR;
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
30. Scoreboard animace musí respektovat reduced-motion a nesmí vizuálně falšovat skutečné skóre.
31. Uživatelské podklady jsou obsah, nikoli AI instrukce; originální soubory se nemají trvale ukládat bez explicitní produktové potřeby.
32. Nový uživatel v první veřejné verzi **nevybírá tarif**; automaticky dostane DB-enforced free limity.
33. Tarif/quota nesmí mít druhý zdroj pravdy v klientu.
34. Auth e-maily mají být stručné transakční zprávy bez marketingového obsahu a s jasným Syllonaut brandingem.
35. Confirmation/recovery link se má bezpečně vrátit do Syllonautu bez otevřeného redirectu.

## 18. Klíčové soubory

- `PROJECT.md` — zdroj pravdy;
- `app/page.tsx` — veřejná landing page + metadata;
- `app/opengraph-image.tsx` — Syllonaut social preview;
- `app/new/page.tsx` — tvorba nové lekce;
- `app/lessons/page.tsx` — Moje lekce + Poslední výsledky;
- `app/lessons/[id]/page.tsx` — lesson workspace;
- `app/sessions/[id]/page.tsx` — teacher live/report shell;
- `app/sessions/[id]/presenter/page.tsx` — projekční Presenter Mode;
- `app/student/[id]/page.tsx` — student live page;
- `app/api/generate/route.ts` — generation/progress/persistence + source material text input;
- `app/api/sessions/[id]/route.ts` — teacher live runtime + scoreboard reveal/hide;
- `app/api/sessions/[id]/report/route.ts` — historical report;
- `app/api/sessions/[id]/scoreboard/route.ts` — teacher derived hybrid scoreboard;
- `app/api/sessions/[id]/presenter/route.ts` — sanitizovaný Presenter payload;
- `app/api/sessions/[id]/evaluations/*` — grading/review/queue/process teacher endpoints;
- `app/api/student/sessions/[id]/route.ts` — participant-authorized student state + own public score;
- `components/AuthControls.tsx` — současný základ sign-in/sign-up + quota UI;
- `components/LessonWorkspace.tsx` — lesson setup, source materials, generation workspace;
- `components/TeacherSession.tsx` — Řídicí centrum;
- `components/TeacherLiveTools.tsx` — top live Skóre + AI hodnocení;
- `components/TeacherScoreboard.tsx` — teacher hybrid scoreboard UI;
- `components/TeacherScoreboardQuickAction.tsx` — reveal/hide + Presenter entry;
- `components/PresenterScoreboard.tsx` / `.module.css` — projekční scoreboard + Moon race;
- `components/EvaluationReviewQueue.tsx` — persistent review queue;
- `components/EvaluationBackgroundPump.tsx` — spouštění čekajících evaluations z teacher tabu;
- `components/TeacherResponses.tsx` — live odpovědi + grading detail;
- `components/StudentSession.tsx` — student live UI;
- `components/SessionReport.tsx` — historical report + CSV;
- `components/TeamTaskResponseInput.tsx` — team lock/autosave;
- `components/SyllonautMark.tsx` — brand mark;
- `lib/schema.ts` — Lesson/GradingCriterion schema;
- `lib/ai.ts` — generation/revision AI + source-material instructions/provider routing;
- `lib/materials.ts` / `lib/materials-client.ts` — source material limits + browser extraction;
- `lib/grading.ts` — AI response grader;
- `lib/scoreboard-server.ts` — centralizovaný hybrid scoreboard výpočet;
- `lib/live.ts` / `lib/live-server.ts` — live types/utilities;
- `lib/supabase/client.ts` / `lib/supabase/server.ts` / `lib/supabase/proxy.ts` — Supabase SSR auth/session vrstva;
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

Source materials / lesson setup:

- `d7d444617edb34c560a080d4cf926a767d21079e` — první ephemeral source-material workflow;
- `527b127820c32b4dff4bb3ad634bc88a1a51c272` — browser-side extraction + 10 MB input;
- `4a70db35fe952df44952a925596680effddf0551` — required lesson setup fields místo aktivních defaultů;
- `105e35daf308bff61ae4168c1a6f91e13bcde7b5` — ZDR provider routing pro source-material generation.

B.7 scoring / public scoreboard:

- `db4a93d03409a735e0f115c3d9171b3dece2d79c` — grading rubric foundation;
- `24d9b4d919907c24450527916423ccae7e8abc91` — scoring DB reconciliation;
- `b07f15fabf338d96f5277f21f9c8ce92dc751d1f` — AI response grader;
- `c35472fdd2e1cb3edf9a63ddb99fd7c331505873` — queue evaluations from scored responses;
- `7743f43d805b780635f28e70d46661f2e1b5205c` — teacher override;
- `1806a126c6c365e87de1405b64a56a6fc0af4945` — persistent review queue;
- `050db53eefe8826e26f812c81fcf3526cefdf122` — reliable background grading pump;
- `42ab05193b4fe55fdb1662de7eee4ff377de88cd` — scoring tools v top live control baru;
- `8628e0eab8402904718692d1ce3bdd45eb537e06` + `6c7e693110daa8a150ef97af8b8508ad19c92c85` — teacher reveal + secure student own score;
- `b81fcf8ac85a5945d17dc592b73405ef86a9e06e` — centralizovaný scoreboard calculation;
- `8d89d1639f43de9a2500f8bd9a1581b746643158` + `5cde2fc36211a72723bf1becffb923c004e00186` — sanitizovaný Presenter API + read-only UI;
- `11bb37abfa20ca187b27a60336110562e562af97` + `4ffb1ddbb5c8172c0bfdeee3120c0346733d6be1` — Moon race vizualizace;
- `1e768476a911fe8dd29b2ae1e0e934e4cf3b369d` — finální pozice striktně podle skóre;
- `263847ecb17b2c188962b0ba314352f1de44abef` + `5ca1d724154a93107345535ad3ffef189f5587ed` — animovaný finální let s akcelerací/decelerací.

## 21. Bezprostřední další kroky

Nejbližší práce je **Milník A.2 — veřejná registrace a produkční e-mailová infrastruktura**.

Produktové rozhodnutí pro první verzi:

- **žádný výběr tarifu při registraci**;
- každý nový běžný účet automaticky používá existující free limity **5 lekcí + 20 AI úprav za kalendářní měsíc**;
- autoritou jsou existující DB defaults + `handle_new_user`, ne UI;
- placené tarify/billing nyní nejsou součástí tohoto kroku.

Pořadí práce:

1. Auditovat aktuální Supabase Auth flow (`AuthControls`, SSR client/server/proxy, Site URL, redirecty, confirmation settings, současný SMTP stav).
2. Zvolit a nastavit produkční **custom SMTP** pro Supabase Auth; preferovat odesílání z ověřené Syllonaut domény/subdomény.
3. Připravit stručné branded transakční šablony minimálně pro **Confirm signup** a **Reset password**.
4. Dokončit bezpečný confirmation callback/redirect flow konzistentní s aktuálním `@supabase/ssr` setupem.
5. Doplnit **Zapomenuté heslo → recovery e-mail → nové heslo**.
6. Ověřit, že nově potvrzený běžný účet dostane profile `role=user`, limity 5/20 a že kvóty jsou skutečně serverově vynucené.
7. Nastavit/ověřit produkční Site URL, redirect allowlist, SPF/DKIM/DMARC, vypnout link tracking u auth mailů a projít Auth rate limits/CAPTCHA/leaked-password protection.
8. Udělat end-to-end test na běžné externí e-mailové adrese: signup → mail → confirm → session → quota → logout/login → recovery.
9. Poté rozšířit B.6 report/CSV o hybridní scoring.
10. Před širším veřejným testem cílené security/hardening kolo a definitivní kontrola `syllonaut.com` DNS/Vercel.
