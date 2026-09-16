# Syllonaut — projektový stav

Aktualizováno: 2026-09-16

## 1. Vize

**Syllonaut — AI navigátor pro interaktivní výuku.**

Syllonaut má učiteli umožnit vytvořit, uložit a vést interaktivní hodinu podobně snadno, jako dnes zadává prompt AI. Učitel nemá ručně skládat jednotlivé slajdy, formuláře a interaktivní nástroje. Popíše téma, cílovou skupinu, délku a styl výuky a Syllonaut z toho sestaví prakticky použitelnou lekci.

Dlouhodobý produktový tok:

1. **Příprava** — učitel popíše hodinu běžným jazykem.
2. **AI návrh** — Syllonaut vytvoří strukturovanou lekci z ověřených typů aktivit.
3. **Úpravy** — učitel mění celou lekci nebo jednu aktivitu přirozeným jazykem.
4. **Uložení** — lekce je navázaná na učitelský účet a lze se k ní vracet.
5. **Start** — učitel odstartuje živou session a získá krátký kód pro studenty.
6. **Výuka** — studenti se připojí z mobilů bez registrace a plní aktivity.
7. **Řízení** — učitel ovládá tempo, vidí odpovědi, týmy a průběh hodiny.
8. **Vyhodnocení** — po hodině má dostat souhrn výsledků a může lekci upravit pro příště.

Syllonaut tedy není pouze generátor příprav, ale nástroj pro **tvorbu + ukládání + vedení + vyhodnocení interaktivní výuky**.

## 2. Branding

Název produktu: **Syllonaut**

Claim: **AI navigátor pro interaktivní výuku.**

Hlavní doména: **syllonaut.com** — zakoupena 2026-09-16. Připojení domény k produkčnímu Vercel projektu je samostatný infrastrukturní krok a zatím není v tomto dokumentu považováno za dokončené.

Název spojuje asociaci **syllabus + astronaut**. Kosmická metafora má být rozpoznatelná, ale střídmá a profesionální. Srozumitelnost má vždy přednost před slovní hříčkou.

Aktuální produktový slovník:

- tvorba nové lekce: **Připrav výukovou misi**;
- spuštění živé výuky: **Odstartovat hodinu**;
- teacher live UI: **Řídicí centrum**;
- lobby před začátkem: **Startovní zóna**;
- probíhající session: **Mise probíhá**;
- ukončená session: **Mise dokončena**;
- knihovna vlastních lekcí může pracovat s motivem **Palubního deníku**.

Standardní odborné a technické pojmy zůstávají tam, kde jsou přesnější: lekce, session, student, tým, odpověď, participant, response apod. Datový model se kvůli brandingu nepřejmenovává.

Historie názvů:

- původní pracovní název: `VibeLesson`;
- následný pracovní/veřejný název: `EduPilot`;
- od 2026-09-16 je oficiální produktová značka **Syllonaut**.

Autoritativní GitHub repository zůstává:

`vaclavloubek/vibelesson`

Starší repository `vaclavloubek/edupilot` není autoritativní a nesmí se pro tento projekt používat. Případné přejmenování aktuálního repozitáře na název se Syllonautem je možné řešit později jako samostatný technický krok.

`PROJECT.md` je zdroj pravdy pro stav projektu a aktualizuje se pouze na výslovný pokyn uživatele.

## 3. Zásadní architektonický princip

AI **negeneruje libovolný React/HTML kód**.

Místo toho generuje validovaný strukturovaný `Lesson` JSON. UI jej skládá z předem připravených, otestovaných interaktivních komponent. Učitel má zkušenost podobnou vibecodingu, ale výsledná aplikace zůstává stabilní, bezpečná a předvídatelná.

To znamená:

- AI rozhoduje o didaktickém návrhu a obsahu;
- aplikace rozhoduje o tom, jak se jednotlivé typy aktivit vykreslí a chovají;
- přísná aplikační validace přes Zod brání nekonzistentním výstupům;
- provider-facing AI schema je záměrně jednodušší než finální `LessonSchema`, aby bylo kompatibilní se structured outputs;
- výstup AI je po návratu z provideru normalizován a znovu ověřen přísným `LessonSchema`;
- úprava jedné aktivity nepřegeneruje automaticky zbytek lekce;
- kosmická metafora je UI/brand vrstva, nikoli změna doménového modelu.

## 4. Cílový uživatel

Primárně učitel, který chce aktivní a interaktivní výuku, ale nechce ručně stavět Mentimeter, Genially, Forms a prezentaci zvlášť.

První testovací use case:

- vysokoškolská výuka;
- semináře 60–180 minut;
- týmová práce;
- kvízy, hlasování, otevřené odpovědi, ranking, postupné odhalování informací;
- humor a praktické scénáře;
- studentské telefony jako hlavní interakční zařízení.

Aplikace nesmí být architektonicky omezená jen na vysoké školy.

## 5. Aktuální technologický stack a deployment

- Next.js 16.3.1
- React 19.2
- TypeScript 5.9
- Zod 4.1
- Vercel AI SDK 7
- Vercel AI Gateway
- Supabase Auth
- Supabase Postgres + RLS
- Supabase Realtime pro živou výuku

AI model:

- výchozí model: `openai/gpt-5.6-sol`;
- routing je připnutý na provider `openai`, aby Gateway neposílala Sol přes dražší Azure variantu;
- structured outputs jsou používané přes provider-compatible schema a následnou přísnou aplikační validaci.

Production:

- Vercel projekt: `edupilot2` — **legacy technický název**, nikoli aktuální značka;
- dosavadní veřejná Vercel URL: `https://edupilot2.vercel.app/`;
- hlavní budoucí veřejná doména: `https://syllonaut.com/`;
- autoritativní branch: `main`;
- production build byl před rebrandingem funkční a opakovaně ověřený; po každé změně je nutné ověřit aktuální deployment.

Supabase:

- organizace je technicky stále pojmenovaná `EduPilot` — **legacy interní název**; není důvod ji kvůli brandingu migrovat;
- projekt ref: `qsjddlgmabgmtssvntmn`;
- region: `eu-west-1`;
- plán: Free;
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

## 7. AI workflow

### 7.1 Generování lekce

Endpoint `/api/generate` přijímá:

- volný prompt;
- cílovou skupinu;
- požadovanou délku;
- velikost týmu;
- tón.

AI vrací validovaný `Lesson` objekt. Úspěšně vygenerovaná lekce se automaticky uloží do Supabase ještě před odpovědí prohlížeči, takže uživatel dostane stabilní `lesson_id`.

### 7.2 AI úprava celé lekce

Endpoint `/api/revise` dostane existující lekci a instrukci učitele. AI zachovává vše, co instrukce nemění. Uložená lekce se po úspěšné úpravě automaticky aktualizuje ve stejném řádku.

### 7.3 AI úprava jedné aktivity

Endpoint `/api/revise-block` upraví pouze jeden vybraný blok a zachová jeho `id`. To je zásadní produktový princip: učitel musí mít možnost jemně ladit lekci bez zničení již připravené struktury.

### 7.4 Didaktická pravidla AI

System prompt aktuálně vyžaduje zejména:

- hotová a přímo čitelná zadání studentům;
- aktivní práci studentů před dlouhým výkladem;
- humor jen podle věku a tónu, ne infantilně;
- realistickou délku bloků;
- konkrétní týmové výstupy;
- korektně vyplněné možnosti u poll/quiz;
- u rankingu seřazení všech položek + krátké zdůvodnění;
- teacher notes skryté před studentem;
- bodování jen tam, kde dává smysl;
- nevymýšlet reálné studie, citace nebo data;
- pokud je potřeba scénář, použít zjevně fiktivní situaci;
- celkovou délku co nejblíže požadavku učitele.

System prompt již používá značku **Syllonaut**.

## 8. Účet jako pracovní prostor

Přihlášený učitel má skutečný pracovní prostor.

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

Rebranding 2026-09-16 změnil localStorage recovery klíč na `syllonaut_last_lesson_v1`. Aplikace umí jednorázově načíst a přemigrovat starý `edupilot_last_lesson_v1`, aby testerům nezmizel poslední recovery snapshot.

Produktové rozhodnutí:

- **běžná AI lekce se ukládá automaticky; nepoužívá se explicitní tlačítko Save**;
- serverová uložená lekce je zdroj pravdy;
- lokální snapshot je pouze pojistka / recovery vrstva;
- demo lekce se automaticky do knihovny neukládá.

## 9. Přihlášení, role, kvóty a AI náklady

Je implementovaný Supabase Auth přes aktuální SSR pattern pro Next.js:

- `@supabase/ssr`;
- browser/server klient;
- `proxy.ts` pro obnovu session;
- registrace e-mailem a heslem;
- potvrzení e-mailu;
- přihlášení a odhlášení;
- zobrazení přihlášeného e-mailu a kvót v UI.

Veřejná demo lekce zůstává dostupná bez přihlášení. AI endpointy jsou dostupné pouze přihlášeným uživatelům; anonymní přímé POST volání vrací 401.

Běžný účet:

- **5 nových lekcí za kalendářní měsíc**;
- **20 AI úprav za kalendářní měsíc** dohromady pro úpravu celé lekce i jednotlivých bloků.

Admin účet:

- `role = admin`;
- `monthly_lesson_limit = NULL`;
- `monthly_revision_limit = NULL`;
- `NULL` znamená aplikačně neomezenou kvótu.

Platformní admin má výjimku pro AI kvóty, nikoli automatický přístup k obsahu ostatních uživatelů.

Kvóty jsou vynucené serverově přes databázovou rezervaci. Neúspěšný AI request se označí jako `failed` a do měsíční kvóty se nepočítá.

Tabulka `generation_requests` eviduje:

- uživatele;
- typ operace (`generate_lesson`, `revise_lesson`, `revise_block`);
- stav `pending` / `succeeded` / `failed`;
- čas;
- vazbu na lekci;
- skutečnou cenu z `providerMetadata.gateway.cost` v USD.

Naměřené reprezentativní ceny dne 2026-09-16:

- nová 30min lekce: **$0.027862**;
- úprava celé lekce: **$0.030779**;
- úprava jednoho bloku: **$0.006154**.

Používá se environment variable `AI_GATEWAY_API_KEY`. API key může být ve Vercelu stále interně pojmenovaný `edupilot production`; jde pouze o legacy administrativní label, nikoli o produktový brand. Tajnou hodnotu klíče nikdy neukládat do repository ani do dokumentace.

Nákladové pojistky:

- API key spend budget **$10**;
- team budget **$10**;
- uživatelské kvóty 5 lekcí + 20 úprav;
- skutečné ceny se zapisují do Supabase.

## 10. Živá výuka — aktuální stav

Základní live workflow je již implementované.

### 10.1 Vytvoření session

- z uložené lekce lze přes **Odstartovat hodinu** vytvořit novou session;
- session ukládá `lesson_snapshot`, takže historický průběh není závislý na pozdějších úpravách původní lekce;
- session dostává unikátní sedmimístný `join_code` bez snadno zaměnitelných znaků;
- jedna uložená lekce může mít v čase více sessions.

### 10.2 Teacher lobby / Startovní zóna

- učitel vidí kód a studentský odkaz;
- vidí připojené studenty;
- pokud lekce obsahuje týmový úkol, může před startem vytvořit 2–12 týmů;
- studenti si ve startovní zóně volí tým;
- učitel může týmy před startem resetovat;
- učitel hodinu odstartuje až po splnění potřebných podmínek.

### 10.3 Řídicí centrum

Po startu učitel:

- vidí aktuální blok a pořadí bloků;
- přechází na předchozí / další blok;
- vidí připojené studenty a týmy;
- vidí individuální odpovědi;
- vidí společné týmové odpovědi;
- může session ukončit.

Stav session se synchronizuje přes Supabase Realtime invalidaci; periodický refresh slouží jako fallback.

### 10.4 Studentský vstup

- veřejná cesta `/join` přijímá krátký kód;
- `/join/<code>` přijímá zobrazované jméno;
- student nepotřebuje plnohodnotný účet;
- student dostává omezenou session identitu/token;
- student v lobby čeká na start učitele;
- po startu vidí stejný aktivní blok jako teacher UI;
- studentský payload nesmí obsahovat data určená jen učiteli, například `teacherNote` nebo skryté správné odpovědi.

### 10.5 Individuální odpovědi

Je implementovaný sběr odpovědí podle podporovaného typu aktivity. Odpověď je vázaná na konkrétní session, participant a block.

### 10.6 Týmové úkoly

Pro `team_task` je implementovaný společný textový výstup týmu:

- všichni členové vidí poslední uloženou týmovou odpověď;
- v jednu chvíli ji upravuje pouze jeden člen;
- serverový lock brání přepisování změn více členy současně;
- lock má heartbeat a expiraci;
- editor ukládá změny automaticky s debounce přibližně 800 ms;
- po ztrátě locku se klient vrací k poslední serverově uložené verzi;
- Realtime + polling pomáhají ostatním členům dostat aktuální stav.

Nejde zatím o CRDT/Google-Docs spolupráci po znacích; je to bezpečný model jednoho editora nad jedním sdíleným týmovým výstupem.

## 11. Databáze a bezpečnost

Aktivně používané tabulky / datové oblasti:

### `profiles`

- metadata uživatele;
- role;
- lesson quota;
- revision quota.

### `lessons`

- `id uuid`
- `owner_id uuid`
- `title text`
- `source_prompt text?`
- `lesson jsonb`
- `created_at timestamptz`
- `updated_at timestamptz`

RLS umožňuje uživateli pracovat pouze s vlastními lekcemi. Serverové operace nad jednotlivou lekcí navíc explicitně filtrují podle `owner_id = userId`.

### `generation_requests`

Evidence AI operací, kvót, výsledků, vazby na lekci a ceny.

### `sessions`

Obsahuje zejména:

- `lesson_id`
- `teacher_id`
- `join_code`
- `status` (`lobby`, `live`, `ended`)
- `active_block_id`
- `lesson_snapshot`
- `realtime_key`
- časové údaje.

### `participants`

Obsahuje session identitu studenta, zobrazované jméno, bezpečný hash tokenu, případně `team_id` a časové údaje.

### `responses`

Jedna individuální odpověď na participant + block v konkrétní session.

### `teams`

Týmy patří vždy ke konkrétní session.

### `team_responses`

Sdílená týmová odpověď na konkrétní block.

### Team edit locks

Samostatná serverová vrstva zajišťuje, že společnou týmovou odpověď v jednu chvíli nepřepisují dva členové současně.

Bezpečnostní principy:

- učitel může vytvářet a ovládat pouze sessions ke svým lekcím;
- učitel může číst účastníky a odpovědi pouze svých sessions;
- student bez účtu nemá široký anonymní SELECT/UPDATE přístup k tabulkám;
- studentské akce procházejí úzkými serverovými API/RPC toky;
- participant token je omezený na konkrétní studentskou identitu/session;
- student nesmí měnit teacher-controlled stav session;
- veřejný studentský payload nesmí obsahovat skryté teacher-only informace;
- platformní `profiles.role = admin` nepoužívat jako univerzální právo ke čtení cizího obsahu.

Známá technická poznámka z předchozího auditu: quota RPC používají `SECURITY DEFINER`. Funkce jsou omezené na `auth.uid()`, ale před širším veřejným provozem je vhodné znovu posoudit, zda rezervaci/dokončení AI spotřeby nepřesunout do čistě serverové obsluhy se secret/service credential a klientovi ponechat pouze bezpečné read-only quota API.

## 12. Co zatím NENÍ hotové

### Live výuka — další rozšíření

- QR kód pro rychlé studentské připojení;
- plnohodnotný scoreboard / agregace bodů napříč aktivitami;
- teacher-controlled sdílený časovač synchronizovaný napříč zařízeními;
- výsledkový report po session;
- historie proběhlých sessions v samostatném UI;
- export výsledků;
- případné další vizualizace poll/quiz výsledků;
- pokročilejší real-time koeditace týmové odpovědi, pokud se ukáže produktově potřebná.

### Účet — pozdější rozšíření

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

- práce se soubory/sylaby/PDF jako zdrojem pro generování;
- analytika využití;
- moderace nebo schvalování AI obsahu před publikováním;
- pokročilejší mezinárodní lokalizace produktu.

### Branding / infrastruktura

- připojit `syllonaut.com` k produkčnímu Vercel projektu a nastavit DNS;
- rozhodnout o přesměrování/aliasu staré Vercel URL;
- navrhnout finální logo, favicon a OG/social preview;
- případně později přejmenovat Vercel projekt, Supabase organizační labely a GitHub repo; nejde o funkční prioritu.

## 13. Roadmapa

### Milník A — AI workflow

Stav: **dokončeno**.

- [x] Next.js základ
- [x] Lesson schema
- [x] demo lekce
- [x] AI generování
- [x] úprava celé lekce
- [x] úprava jednoho bloku
- [x] teacher/student preview
- [x] Supabase Auth
- [x] ochrana AI endpointů
- [x] uživatelské kvóty
- [x] admin neomezený limit
- [x] AI Gateway placené kredity
- [x] spend ochrana
- [x] evidence skutečné ceny AI operací

### Milník A.1 — účet jako pracovní prostor

Stav: **MVP dokončeno a produkčně ověřeno 2026-09-16**.

- [x] automatické ukládání AI lekcí
- [x] knihovna **Moje lekce**
- [x] stabilní URL
- [x] autosave úprav
- [x] rename / duplicate / delete
- [x] jednokrokové Undo
- [x] recovery snapshot
- [x] RLS izolace uživatelského obsahu

### Milník B — živá hodina

Stav: **základní end-to-end live workflow implementované; pokračuje produktové dopracování**.

- [x] vytvoření session ze snapshotu uložené lekce
- [x] krátký join code
- [x] anonymní studentský vstup bez plnohodnotného účtu
- [x] teacher lobby / Startovní zóna
- [x] seznam připojených studentů
- [x] Supabase Realtime synchronizace stavu
- [x] teacher ovládání aktuálního bloku
- [x] studentské odpovědi
- [x] teacher přehled odpovědí
- [x] týmy pro `team_task`
- [x] společná týmová odpověď
- [x] serverové edit locky a autosave týmové odpovědi
- [x] ukončení session
- [ ] QR kód
- [ ] scoreboard
- [ ] sdílený synchronizovaný timer
- [ ] post-session report
- [ ] historie sessions UI

### Milník C — opakované a týmové používání

- trvalé verzování lekcí;
- historie sessions;
- export výsledků;
- sdílení lekce s jiným učitelem;
- šablony;
- tvorba z přiloženého sylabu/PDF;
- možnost změnit styl celé výuky jedním pokynem;
- analytika využití;
- školní/organizační účty, týmová knihovna a správa členů.

## 14. Produktová UX pravidla

1. Učitel nemá potřebovat technické znalosti.
2. Přirozený jazyk je primární způsob tvorby a úprav.
3. Ruční editace musí být možná tam, kde je rychlejší než prompt.
4. Učitel musí vždy před spuštěním vidět, co studenti uvidí.
5. Student se připojuje bez plnohodnotné registrace a s minimem kroků.
6. Mobilní studentské UI má být jednodušší než učitelské UI.
7. Zadání aktivit musí být samostatně pochopitelné — učitel je nemá opakovat.
8. AI nesmí potichu změnit jiné části lekce při lokální úpravě.
9. Generování nesmí produkovat falešné studie, citace a faktická tvrzení prezentovaná jako skutečná.
10. Interaktivita má sloužit didaktickému cíli, ne být samoúčelná gamifikace.
11. Přihlášení nemá překážet prvnímu seznámení s produktem — veřejné demo může zůstat anonymní.
12. Práce přihlášeného učitele se nesmí ztratit při refreshi nebo zavření prohlížeče.
13. Uživatel musí jasně rozumět své AI kvótě a tomu, co se do ní počítá.
14. Destruktivní akce vyžadují jednoznačné potvrzení.
15. U živé hodiny je učitel autorita nad postupem session; student nesmí měnit stav celé hodiny.
16. Studentské zařízení musí po refreshi pokud možno obnovit vazbu na stejnou session/participant identitu.
17. Historická session musí zachovat obsah, který byl skutečně použit při výuce.
18. Kosmická metafora nesmí zhoršit pochopení funkce ani působit infantilně; v kritických akcích musí zůstat význam jednoznačný.

## 15. Repo a důležité soubory

Aktuální repository:

`vaclavloubek/vibelesson`

Hlavní soubory:

- `app/page.tsx` — vstup do tvorby nové lekce;
- `app/lessons/page.tsx` — knihovna **Moje lekce**;
- `app/lessons/[id]/page.tsx` — serverové načtení konkrétní vlastní lekce + start session;
- `app/layout.tsx` — metadata značky;
- `app/join/page.tsx` a `app/join/[code]/page.tsx` — veřejný studentský vstup;
- `app/sessions/[id]/page.tsx` — teacher live session;
- `app/student/[id]/page.tsx` — student live session;
- `app/api/generate/route.ts` — generování + auth + quota + cost tracking + uložení;
- `app/api/revise/route.ts` — AI úprava celé lekce + autosave;
- `app/api/revise-block/route.ts` — AI úprava jednoho bloku + autosave;
- `app/api/lessons/[id]/route.ts` — přejmenování, duplikace, smazání a Undo save;
- `app/api/sessions/*` — vytvoření a teacher řízení live session a týmů;
- `app/api/student/*` — join, studentský stav, odpovědi a týmová spolupráce;
- `components/LessonWorkspace.tsx` — hlavní pracovní prostor lekce, recovery a Undo;
- `components/LessonPreview.tsx` — teacher/student preview lekce;
- `components/AuthControls.tsx` — auth a kvóty;
- `components/StartSessionButton.tsx` — start živé hodiny;
- `components/TeacherSession.tsx` — **Řídicí centrum** živé hodiny;
- `components/StudentSession.tsx` — studentský live pohled;
- `components/StudentResponseInput.tsx` — individuální studentské odpovědi;
- `components/TeacherResponses.tsx` — teacher přehled odpovědí;
- `components/TeamPicker.tsx` — volba týmu;
- `components/TeamTaskResponseInput.tsx` — společná týmová odpověď, lock a autosave;
- `lib/schema.ts` — přísný Zod datový model lekce;
- `lib/ai.ts` — AI pravidla, provider-facing schema, OpenAI routing a cost metadata;
- `lib/live.ts` a `lib/live-server.ts` — live typy a serverové utility;
- `lib/supabase/*` — Supabase klienti;
- `supabase/migrations/*` — live session, responses, teams a edit-lock databázové změny;
- `PROJECT.md` — tento zdroj pravdy.

## 16. Pravidla další práce

- Před změnami vždy načíst aktuální `PROJECT.md` a relevantní soubory z `vaclavloubek/vibelesson`.
- Postupovat po malých ověřitelných krocích: **TEST / OVĚŘENÍ → ÚPRAVA → OVĚŘENÍ**.
- U delších úkolů průběžně hlásit dokončení dílčích kroků.
- Nedělat zbytečné refaktory mimo řešený problém.
- AI nikdy nesmí generovat a spouštět libovolný klientský kód.
- Všechny kvóty a oprávnění vynucovat serverově, ne jen přes UI.
- Tajné klíče nikdy neposílat do repository ani do klientského JavaScriptu.
- Po změnách ověřovat teacher i student režim; student mobile-first.
- RLS navrhovat podle skutečného access modelu; nepoužívat široké politiky jen kvůli rychlosti implementace.
- Platformní `profiles.role = admin` nepoužívat jako univerzální právo ke čtení cizího obsahu.
- Budoucí školní role `owner/admin/member` musí být oddělené od platformní role admina.
- `PROJECT.md` aktualizovat pouze na výslovný pokyn uživatele.
- V UI od 2026-09-16 používat značku **Syllonaut**, nikoli EduPilot. Legacy technické názvy měnit pouze tehdy, když změna přináší reálný přínos a neohrozí provoz.

## 17. Bezprostřední další kroky

1. **Ověřit rebranding v produkčním buildu** — desktop, mobil, teacher i student flow.
2. **Připojit `syllonaut.com` k Vercelu** a nastavit potřebné DNS záznamy u registrátora.
3. **Doplnit vizuální identitu** — logo/brand mark, favicon a OG/social preview; současné písmeno `S` je pouze přechodný textový brand mark.
4. **Dokončit live MVP podle priority** — QR join, scoreboard, synchronizovaný timer a post-session report.
5. Až po stabilizaci live toku řešit historii sessions, exporty, sdílení a organizační účty.
