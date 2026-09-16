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

Hlavní doména: **syllonaut.com** — zakoupena 2026-09-16. Připojení domény k produkčnímu Vercel projektu je samostatný infrastrukturní krok a zatím není považováno za dokončené.

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

Starší repository `vaclavloubek/edupilot` není autoritativní a nesmí se pro tento projekt používat. Případné přejmenování aktuálního repozitáře je možné řešit později jako samostatný technický krok.

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
- structured outputs používají provider-compatible schema a následnou přísnou aplikační validaci.

Production:

- Vercel projekt: `edupilot2` — **legacy technický název**, nikoli aktuální značka;
- veřejná Vercel URL: `https://edupilot2.vercel.app/`;
- hlavní budoucí veřejná doména: `https://syllonaut.com/`;
- autoritativní branch: `main`;
- Vercel plán: **Pro** od 2026-09-16;
- souhrnný commit `fe62c5629b76478190898945b1f6f53d970247cd` (`Deploy accumulated Syllonaut project changes`) úspěšně prošel Vercel buildem po přechodu na Pro;
- tento build slouží jako ověřený produkční roll-up dnešních změn před následnou aktualizací `PROJECT.md`.

Důvod přechodu na Pro: během intenzivního vývoje jsme narazili na Hobby build/deployment rate limit kvůli příliš jemným commitům. Z toho vzniklo nové projektové pravidlo: změny se odteď commitují po logických celcích, nikoli po jednotlivých souborech.

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

Endpoint `/api/revise-block` upraví pouze jeden vybraný blok a zachová jeho `id`. Učitel tak může jemně ladit lekci bez zničení již připravené struktury.

### 7.4 Didaktická pravidla AI

System prompt aktuálně vyžaduje zejména:

- hotová a přímo čitelná zadání studentům;
- aktivní práci studentů před dlouhým výkladem;
- humor jen podle věku a tónu, ne infantilně;
- realistickou délku bloků;
- u `team_task` jeden jasný společný textový výstup, který lze skutečně zapsat do sdíleného týmového pole;
- korektně vyplněné možnosti u poll/quiz;
- u rankingu seřazení všech položek + krátké povinné zdůvodnění;
- teacher notes skryté před studentem;
- bodování jen tam, kde dává smysl;
- nevymýšlet reálné studie, citace nebo data;
- pokud je potřeba scénář, použít zjevně fiktivní situaci;
- celkovou délku co nejblíže požadavku učitele.

System prompt používá značku **Syllonaut**.

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

Základní live workflow včetně individuálních odpovědí, týmů a sdílené týmové odpovědi je implementované a manuálně ověřené.

### 10.1 Vytvoření session

- z uložené lekce lze přes **Odstartovat hodinu** vytvořit novou session;
- session ukládá `lesson_snapshot`, takže historický průběh není závislý na pozdějších úpravách nebo smazání původní lekce;
- session dostává unikátní sedmimístný `join_code` bez snadno zaměnitelných znaků;
- jedna uložená lekce může mít v čase více sessions.

### 10.2 Teacher lobby / Startovní zóna

- učitel vidí kód a studentský odkaz;
- vidí připojené studenty;
- pokud lekce obsahuje `team_task`, může před startem vytvořit 2–12 týmů;
- studenti si ve startovní zóně volí tým;
- učitel může týmy před startem resetovat;
- lekci s `team_task` nelze spustit bez vytvořených týmů;
- po startu se týmová struktura už běžně nemění.

### 10.3 Řídicí centrum

Po startu učitel:

- vidí aktuální blok a pořadí bloků;
- přechází na předchozí / další blok;
- vidí připojené studenty a týmy;
- vidí individuální odpovědi;
- vidí společné týmové odpovědi;
- může session ukončit.

Stav session se synchronizuje přes Supabase Realtime invalidaci; databáze/server jsou zdroj pravdy a periodický REST refresh slouží jako fallback.

### 10.4 Studentský vstup a identita

- veřejná cesta `/join` přijímá krátký kód;
- `/join/<code>` přijímá zobrazované jméno;
- student nepotřebuje Supabase Auth ani plnohodnotný účet;
- participant dostává náhodný 32byte token; v databázi se ukládá pouze SHA-256 hash;
- raw participant token je uložen v `HttpOnly`, `Secure`, `SameSite=Lax` cookie;
- refresh zachovává stejnou participant identitu a nevytváří duplicitního účastníka;
- student se může připojit i během `live`, ale po `ended` už ne;
- student v lobby čeká na start učitele;
- po startu vidí stejný aktivní blok jako teacher UI;
- studentský payload používá pozitivní whitelist a nesmí obsahovat `teacherNote`, skryté správné odpovědi ani jiná teacher-only metadata.

### 10.5 Individuální odpovědi — B.1/B.2

Odpověď je vázaná na konkrétní `session × participant × block` a ukládá se upsertem, takže změna odpovědi aktualizuje jeden řádek místo tvorby duplicit.

Podporované response typy:

- `poll` — `{ choice }`, volba musí být přesně jedna z možností snapshotu;
- `quiz` — `{ choice }`, stejná serverová validace jako poll, správná odpověď zůstává studentovi skrytá;
- `open_text` — `{ text }`, 1–2000 znaků;
- `ranking` — `{ ranking, text }`, pořadí musí obsahovat přesně všechny snapshot items právě jednou a krátké zdůvodnění je povinné;
- `exit_ticket` — `{ text }`, krátká textová odpověď.

Pravidla zápisu:

- odpovídat lze jen během `live`;
- odpověď lze měnit pouze tehdy, když je daný blok právě aktivní;
- při návratu učitele na předchozí response blok se editace znovu otevře;
- po přechodu jinam nebo po ukončení session server zápis odmítne;
- student nepíše přímo do tabulky `responses`, ale přes server/Edge Function s participant tokenem.

Teacher výsledky:

- poll/quiz: průběžné počty odpovědí;
- quiz: správná odpověď je viditelná pouze teacherovi;
- open text / exit ticket: pojmenované odpovědi;
- ranking: agregované pořadí podle průměrné pozice + případná zdůvodnění studentů.

Realtime přenáší pouze prázdnou invalidaci `invalidate` s payloadem `{}`; samotné odpovědi a výsledky se vždy znovu načítají autorizovaným REST/serverovým tokem.

### 10.6 Týmy a `team_task` — B.3

Datový model:

- `teams` patří konkrétní session;
- `participants.team_id` určuje členství;
- `team_responses` obsahuje jednu společnou odpověď na `session × team × block`;
- `updated_by_participant_id` eviduje posledního zapisujícího, ale odpověď patří týmu.

Členství:

- v lobby může student tým změnit;
- po startu už existující člen mezi týmy nepřeskakuje;
- student připojený až během `live` si může tým poprvé zvolit;
- teacher vidí členy týmů v lobby i během hodiny.

Pro `team_task` je implementovaný jeden společný textový výstup týmu. AI generátor je sladěný s touto interakcí a má tvořit zadání s jedním jasným společným textovým výsledkem.

### 10.7 Sdílený týmový editor — B.3.1

Cílem není CRDT/Google Docs editace po znacích, ale robustní model **jeden aktivní editor + autosave + realtime distribuce**.

Aktuální chování:

- první člen týmu, který začne editovat, získá krátkodobý serverový lock;
- ostatní členové vidí aktuální text, ale pole je pro ně dočasně read-only;
- ostatní vidí, kdo právě odpověď upravuje;
- autosave probíhá přibližně **800 ms** po posledním stisku;
- heartbeat drží lock živý každé **4 s**;
- lock expiruje po **12 s**, pokud klient zmizí nebo ztratí spojení;
- při blur se nejdřív dokončí probíhající save nebo se uloží poslední změna a teprve poté se lock uvolní;
- při úspěšném autosave se vyšle Realtime invalidace, ostatní členové a teacher si načtou aktuální serverový stav;
- pokud editor lock ztratí, klient se vrátí k poslední serverově uložené verzi.

Bezpečnostní vynucení:

- lock acquisition je atomický;
- `team_edit_locks` je server-only tabulka bez přímých práv pro `anon` a `authenticated`;
- `claim_team_edit_lock` může volat pouze `service_role`;
- databázová ochrana `team_responses` vyžaduje, aby `updated_by_participant_id` právě držel platný lock pro danou session/team/block;
- starší `respond_team` tok proto nemůže lock obejít;
- studentský `team-edit` Edge Function je veřejně dosažitelný pouze kvůli anonymous student flow, ale každou akci autentizuje vlastním participant tokenem.

### 10.8 Manuální ověření live flow 2026-09-16

Manuálně ověřeno:

- join + refresh bez duplikace participant identity;
- Realtime aktualizace lobby;
- start session a synchronizace teacher/student aktivního bloku;
- teacher-only `teacherNote` se studentovi nepropíše;
- next / previous / end;
- poll, quiz a open text odpovědi;
- ranking včetně povinného zdůvodnění;
- exit ticket;
- vytvoření týmů a volba týmu;
- jedna společná `team_task` odpověď viditelná více členům a teacherovi.

B.3.1 autosave + lock je implementovaný, serverově nasazený a zahrnutý v produkčním roll-up buildu; cílený dvouklientový smoke test po posledním roll-up deploymentu je vhodné ještě zopakovat.

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

Jedna sdílená týmová odpověď na konkrétní block.

### `team_edit_locks`

Krátkodobé server-only zámky pro týmový editor. Lock je svázán se session, týmem, blokem a participantem a má `expires_at`.

Bezpečnostní principy:

- učitel může vytvářet a ovládat pouze sessions ke svým lekcím;
- učitel může číst účastníky a odpovědi pouze svých sessions;
- platformní `profiles.role = admin` není univerzální právo ke čtení cizích sessions nebo lekcí;
- student bez účtu nemá široký anonymní SELECT/INSERT/UPDATE přístup k live tabulkám;
- studentské akce procházejí úzkými serverovými API/Edge Function toky;
- participant token je omezený na konkrétní studentskou identitu/session;
- student nesmí měnit teacher-controlled stav session;
- veřejný studentský payload nesmí obsahovat skryté teacher-only informace;
- Realtime je wake-up/invalidation mechanismus, nikoli zdroj pravdy ani kanál pro přenos response payloadů;
- session snapshot chrání historický obsah před pozdějšími změnami původní lekce.

Security Advisor po B.3/B.3.1 nehlásí nový kritický problém. Známé historické položky:

- pět quota RPC funkcí používá `SECURITY DEFINER` a je spustitelných rolí `authenticated`; funkce jsou omezené na `auth.uid()`, ale před širším veřejným provozem je vhodné znovu posoudit přesun citlivých write operací do čistě serverové obsluhy se secret/service credential;
- Supabase Auth má vypnutou leaked-password protection; před širším veřejným provozem zvážit zapnutí.

## 12. Co zatím NENÍ hotové

### Live výuka — další rozšíření

- QR kód pro rychlé studentské připojení;
- plnohodnotný scoreboard / agregace bodů napříč aktivitami;
- teacher-controlled sdílený časovač synchronizovaný napříč zařízeními;
- výsledkový report po session;
- historie proběhlých sessions v samostatném UI;
- export výsledků;
- případné další vizualizace poll/quiz výsledků;
- pokročilejší CRDT-like real-time koeditace týmové odpovědi pouze pokud se ukáže produktově potřebná.

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

Stav: **B.1, B.2 a B.3 implementované; B.3.1 autosave/lock nasazený, vhodný ještě cílený dvouklientový smoke test**.

- [x] vytvoření session ze snapshotu uložené lekce
- [x] krátký join code
- [x] anonymní studentský vstup bez plnohodnotného účtu
- [x] teacher lobby / Startovní zóna
- [x] seznam připojených studentů
- [x] Supabase Realtime invalidace + REST refetch/polling fallback
- [x] teacher ovládání aktuálního bloku
- [x] B.1 poll / quiz / open_text responses
- [x] B.2 ranking + povinné zdůvodnění
- [x] B.2 exit_ticket
- [x] teacher přehled a agregace odpovědí
- [x] B.3 týmy pro `team_task`
- [x] B.3 společná týmová odpověď
- [x] B.3.1 serverové edit locky
- [x] B.3.1 autosave týmové odpovědi
- [x] ukončení session
- [ ] cílený smoke test B.3.1 se dvěma současně otevřenými studenty po aktuálním roll-up buildu
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
19. Text zadání, studentský input, serverová validace a teacher výsledky musí používat stejný response kontrakt; nesmí nastat situace, kdy instrukce vyžaduje něco, co UI označuje za volitelné nebo neumí uložit.
20. Sdílená týmová odpověď má preferovat bezpečný model jednoho aktivního editora s autosave před složitou simultánní koeditací, dokud produktová potřeba neospravedlní CRDT řešení.

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
- `app/api/student/*` — join, studentský stav, individuální odpovědi, volba týmu a team-edit proxy;
- `components/LessonWorkspace.tsx` — hlavní pracovní prostor lekce, recovery a Undo;
- `components/LessonPreview.tsx` — teacher/student preview lekce;
- `components/AuthControls.tsx` — auth a kvóty;
- `components/StartSessionButton.tsx` — start živé hodiny;
- `components/TeacherSession.tsx` — **Řídicí centrum** živé hodiny;
- `components/StudentSession.tsx` — studentský live pohled;
- `components/StudentResponseInput.tsx` — individuální studentské odpovědi;
- `components/TeacherResponses.tsx` — teacher přehled odpovědí a agregací;
- `components/TeamPicker.tsx` — volba týmu;
- `components/TeamTaskResponseInput.tsx` — společná týmová odpověď, autosave a editor lock UX;
- `lib/schema.ts` — přísný Zod datový model lekce;
- `lib/ai.ts` — AI pravidla, provider-facing schema, OpenAI routing a cost metadata;
- `lib/live.ts` a `lib/live-server.ts` — live typy a serverové utility;
- `lib/supabase/*` — Supabase klienti;
- `supabase/functions/student-session/index.ts` — anonymous student session flow s custom participant auth;
- `supabase/functions/team-edit/index.ts` — týmový edit lock, heartbeat, autosave a release;
- `supabase/migrations/*` — live session, responses, teams a team edit lock databázové změny;
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

### 16.1 Commit a deployment workflow — závazné pravidlo od 2026-09-16

- **Commitovat po logických funkčních celcích, ne po jednotlivých souborech nebo každé dílčí úpravě.**
- Jeden logický celek může zahrnovat více komponent, API rout, migrací a souvisejících testovacích úprav, pokud společně tvoří jednu funkci nebo opravu.
- Před commitem nejdřív dokončit a ověřit celý logický krok v dostupném rozsahu; teprve potom posunout `main`.
- Samostatný commit je vhodný jen tam, kde existuje skutečná nezávislá rollback hranice — typicky izolovaná DB migrace, bezpečnostní hotfix, nezávislá infrastrukturní změna nebo jiná změna, kterou má smysl vracet samostatně.
- Nedělat commit po každém upraveném souboru jen kvůli průběžnému ukládání práce.
- Po logickém commitu ověřit Vercel build/deployment jednou za celý celek.
- Pokud probíhá více chatů nad stejným projektem, před finálním commitem zkontrolovat aktuální `main`, aby se změny z paralelních chatů nepřepsaly nebo zbytečně nenasazovaly vícekrát.
- Důvod pravidla: každý push do `main` může spustit Vercel deployment; jemné commity 2026-09-16 vyčerpaly Hobby build/deployment rate limit a vedly k přechodu na Pro.

## 17. Bezprostřední další kroky

1. **Cíleně ověřit B.3.1 v produkci** — dvě studentská okna ve stejném týmu, autosave bez tlačítka, editor lock, indikace „upravuje X“, předání locku a synchronizace teacher pohledu.
2. **Připojit `syllonaut.com` k Vercelu** a nastavit potřebné DNS záznamy u registrátora.
3. **Doplnit vizuální identitu** — logo/brand mark, favicon a OG/social preview; současné písmeno `S` je pouze přechodný textový brand mark.
4. **Dokončit live MVP podle priority** — QR join, scoreboard, synchronizovaný timer a post-session report.
5. Až po stabilizaci live toku řešit historii sessions, exporty, sdílení a organizační účty.
