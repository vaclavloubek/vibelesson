# Syllonaut — projektový stav

Aktualizováno: 2026-09-17 po dokončení bezpečnostního auditu SEC-001 až SEC-015 a následném doplnění prémiových složek/podsložek a veřejné stránky Pricing / Ceník. Třináct bezpečnostních nálezů je remediovaných/uzavřených; SEC-002 a SEC-007 jsou vědomě přijaté výjimky / odložená rizika.

## 1. Produkt a zdroj pravdy

**Syllonaut — AI navigátor pro interaktivní výuku.**

Syllonaut umožňuje učiteli vytvořit, upravit, uložit, vést a vyhodnotit interaktivní hodinu. Učitel zadá téma/cílovou skupinu/délku/styl nebo přidá vlastní podklady; AI vytvoří validovanou strukturovanou lekci. Učitel ji upravuje přirozeným jazykem, uloží ji ke svému účtu, spustí live session a studenti se připojí bez plnohodnotného účtu přes QR/kód.

Autoritativní repository: `vaclavloubek/vibelesson`.

Starší `vaclavloubek/edupilot` nepoužívat. Produktově a vizuálně používat pouze **Syllonaut**; technické legacy názvy mohou zůstat tam, kde migrace nemá funkční hodnotu.

`PROJECT.md` je zdroj pravdy pro produkt, architekturu, bezpečnost, stav a priority. Mění se pouze na výslovný pokyn uživatele.

Hlavní doména: `syllonaut.com`.

Bezpečnostní baseline commit před touto dokumentační aktualizací:

`584a72b200fb4bea148cac7c4719c713d5fb23fc` — **Fix SEC-015 AI zero data retention enforcement**.

Aktuální HEAD je vždy nutné načíst z GitHubu před zahájením práce; tento dokument nesmí sloužit jako náhrada kontroly aktuálního `main`.

## 2. Stack a deployment

- Next.js 16.3.1, React 19.2, TypeScript 5.9, Zod 4.1
- Vercel AI SDK 7 + Vercel AI Gateway
- Supabase Auth + Postgres + RLS + Realtime
- AI model: `openai/gpt-5.6-sol`
- Vercel projekt: `edupilot2` (legacy technický název), autoritativní branch `main`, plán Pro
- Supabase project ref: `qsjddlgmabgmtssvntmn`, `eu-west-1`, Postgres 17, RLS aktivní
- velikost DB ověřená 2026-09-17: přibližně **13 MB**

Všechny současné AI inference cesty explicitně vynucují AI Gateway `zeroDataRetention: true`. Generování bez podkladů, revize a AI grading jsou omezené na OpenAI; generování s podklady používá pouze `bedrock` / `azure`, řazené podle ceny. ZDR je fail-closed routing requirement.

### Vercel Preview a SEC-002

Poslední ověřený stav při auditu:

- Preview používá stejný produkční Supabase trust boundary jako Production;
- Preview mělo přístup i k placené AI identitě/credentialu;
- Preview buildy jsou funkční.

To znamená vyšší blast radius při testování a riziko nechtěných zápisů/placených AI callů do produkce. Cílová architektura zůstává: samostatný staging Supabase, oddělená Preview AI identita/credential a Deployment Protection.

**SEC-002 — ACCEPTED RISK / DEFERRED.** Uživatel výslovně rozhodl ponechat současné sdílené prostředí jako vědomou výjimku. Nález je auditně dispositioned, ale **není technicky remediovaný**. Dokud zůstává výjimka v platnosti, Preview testy nesmí dělat destruktivní zásahy do produkčních dat, load/stress testy ani zbytečné placené AI cally. Před širší produkční škálou nebo při zapojení dalších vývojářů znovu zvážit oddělený staging.

## 3. Hlavní routy

- `/` — landing
- `/pricing` — veřejný Pricing / Ceník pro individuální učitele a školy
- `/new` — tvorba lekce
- `/lessons` — Moje lekce + poslední výsledky
- `/lessons/<id>` — lesson workspace
- `/sessions/<id>` — teacher live session / report
- `/sessions/<id>/presenter` — read-only projekční režim
- `/join`, `/join/<code>` — studentský vstup
- `/student/<id>` — student live
- `/auth/confirm` — scanner-safe potvrzovací mezikrok
- `/auth/confirm/verify` — POST TokenHash → `verifyOtp`
- `/auth/update-password` — změna hesla po recovery
- `/auth/error` — bezpečný auth error stav

Landing umožní začít zadáním bez okamžité registrace; účet je potřeba až pro skutečné AI generování a ukládání. Landing navigace obsahuje odkaz na Ceník.

## 4. Architektonické principy

AI negeneruje libovolný React/HTML. Generuje validovaný `Lesson` JSON; aplikace určuje rendering a chování.

- Zod chrání strukturu.
- Změna jednoho bloku nemá potichu změnit zbytek lekce.
- DB/server je zdroj pravdy pro live session.
- Realtime je pouze invalidation/wake-up; event `invalidate` s payloadem `{}`.
- Teacher smí pracovat jen s vlastní lesson/session; `role=admin` není universal content access.
- Student nemá Supabase Auth účet.
- Studentské/public payloady jsou whitelistované.
- Odvozené skóre se nepersistuje jako další zdroj pravdy.
- Kvóty a placená oprávnění jsou server/DB autorita.
- Client UI nesmí být jediná ochrana placené AI operace.
- Secrets nikdy do repo ani klientského JS.

## 5. Lesson schema a AI

Podporované bloky:

`intro`, `team_task`, `poll`, `quiz`, `open_text`, `ranking`, `reveal`, `timer`, `exit_ticket`.

Block může obsahovat:

`id`, `type`, `title`, `durationMinutes`, `instructions`, `options?`, `items?`, `dataTable?`, `correctAnswer?`, `revealText?`, `teacherNote?`, `points?`, `gradingRubric?`.

Aktuální hranice: 3–16 bloků, max. 60 minut/blok, 10–360 minut lekce.

### Structured `dataTable`

Přidáno po betatestu 2026-09-17:

- volitelný `caption`;
- 2–8 sloupců;
- 1–30 řádků;
- každý řádek musí odpovídat počtu sloupců;
- renderuje se v lesson preview a studentském/live `LiveBlock`;
- AI má číselné datasety, časové řady, výsledky měření, webovou analytiku apod. dávat do `dataTable`, ne do dlouhého odstavce;
- starší uložené lekce se samy zpětně nepřepisují;
- Presenter má vlastní renderer a `dataTable` do jeho payloadu zatím neposílá.

### Source materials

Implementováno/ověřeno:

- PDF, PPTX, DOCX, TXT, MD;
- max. 5 souborů, dohromady max. 10 MB;
- originální soubor neopouští zařízení;
- browser extrahuje text, server dostane jen text;
- originál ani extrahovaný text se trvale neukládá;
- bez OCR pro naskenované PDF;
- režimy `primary`, `strict`, `inspiration`;
- podklady jsou v AI promptu nedůvěryhodný obsah; instrukce/prompt injection uvnitř dokumentu se mají ignorovat.

**SEC-012 je uzavřený:** DOCX/PPTX ZIP preflight omezuje počet položek a relevantních XML částí; XML se dekomprimuje streamovaně s limitem 5 MB na část a 20 MB na dokument, odmítá ZIP64/multi-disk a další nestandardní struktury.

## 6. Účet, kvóty a tarifní entitlementy

### Produktové plány — veřejný Ceník

Veřejná stránka `/pricing` má dva přepínače:

- **Pro učitele / Pro školy**;
- **Měsíčně / Ročně**.

Roční varianta je komunikována jako přibližně **2 měsíce zdarma**. Placené tarify zatím nejsou aktivně prodejné: jejich CTA je neaktivní s textem **Připravujeme**. Aktivní je pouze Free CTA, které otevírá stávající zabezpečený signup bez platební karty.

Individuální plány:

- **Free** — 0 Kč / $0; 5 nových AI lekcí + 20 AI úprav měsíčně; deterministický quiz; ruční hodnocení bodovaných otevřených/týmových odpovědí; bez prémiových složek;
- **Teacher** — 199 Kč / $8.99 měsíčně nebo 1 990 Kč / $89 ročně; 25 nových AI lekcí + 100 AI úprav měsíčně; bez placeného AI gradingu; bez prémiových složek;
- **Teacher Pro** — 329 Kč / $14.99 měsíčně nebo 3 290 Kč / $149 ročně; 60 nových AI lekcí + 250 AI úprav měsíčně; AI grading bodovaných `open_text`, `exit_ticket` a `team_task`; složky a podsložky pro organizaci lekcí.

Všechny individuální plány počítají s live hodinami bez tarifního limitu a se studentským připojením bez plnohodnotného účtu.

Školní/týmové plány, zatím jako veřejná produktová nabídka bez aktivního billing/provisioning flow:

- **Team** — až 10 učitelů; 200 AI lekcí + 800 AI úprav měsíčně společně; 1 290 Kč / $59.99 měsíčně nebo 12 900 Kč / $599 ročně;
- **School** — až 30 učitelů; 600 AI lekcí + 2 400 AI úprav měsíčně společně; 3 190 Kč / $149.99 měsíčně nebo 31 900 Kč / $1,499 ročně;
- **Campus** — až 100 učitelů; 2 000 AI lekcí + 8 000 AI úprav měsíčně společně; 8 490 Kč / $399.99 měsíčně nebo 84 900 Kč / $3,999 ročně.

Školní plány počítají se sdíleným měsíčním AI limitem pro daný tým/školu/organizaci. Týmová administrace, skutečné organization membership, billing, checkout a provisioning těchto plánů zatím implementované nejsou.

### Server-authoritative profil a entitlementy

Nový auth user dostane `profiles` řádek přes `on_auth_user_created → private.handle_new_user()`. DB defaulty jsou autorita Free 5/20; při registraci se tarif nevybírá.

Běžný Free účet:

- `role=user`
- 5 nových lekcí / kalendářní měsíc
- 20 AI úprav / kalendářní měsíc
- `ai_grading_enabled=false`
- `lesson_folders_enabled=false`

Admin:

- `role=admin`
- `monthly_lesson_limit=NULL`
- `monthly_revision_limit=NULL`
- je serverově považován za oprávněný k AI gradingu
- je serverově považován za oprávněný k prémiovým složkám/podsložkám

Názvy plánů a ceny nejsou zatím zadrátované do DB entitlement logiky ani billingu. Runtime oprávnění se v současnosti řídí explicitními server-authoritative hodnotami v `profiles` a kvótami.

### AI grading entitlement

Od 2026-09-17 existuje v `profiles` server-authoritative boolean `ai_grading_enabled`.

Produktové pravidlo:

- Free: deterministický quiz + ruční hodnocení otevřených/týmových odpovědí;
- Teacher: stejně bez placeného AI gradingu;
- Teacher Pro: `ai_grading_enabled=true` a může používat placený AI grading;
- admin se chová jako Teacher Pro;
- UI ani název plánu není bezpečnostní hranice.

Fail-closed ochrana je ve více vrstvách:

- submit/queue vytvoří pro neentitled učitele rovnou manual-review evaluation;
- background grading processor bez entitlementu nevrací práci k AI;
- přímý `/grade` endpoint entitlement znovu ověřuje;
- DB `claim_response_evaluation(...)` kontroluje ownership i entitlement;
- UI není bezpečnostní hranice.

Manual grading používá stejnou tabulku `response_evaluations`, typicky `status='needs_review'`, `grader_version='manual-v1'`, bez `ai_score`, modelu a AI costu. Učitel zadá `teacher_score` a volitelnou poznámku.

### Lesson folders entitlement

Od 2026-09-17 existuje v `profiles` server-authoritative boolean `lesson_folders_enabled`.

Produktové pravidlo:

- Free a Teacher: bez složek;
- Teacher Pro: `lesson_folders_enabled=true`;
- admin má entitlement automaticky;
- entitlement se kontroluje serverově a v RLS/DB write boundary, ne pouze zobrazením UI.

## 7. Lesson workspace

Lesson workspace má:

- automatické uložení nové AI lekce;
- `/lessons` knihovnu;
- stabilní `/lessons/<id>`;
- autosave AI změn;
- rename / duplicate / delete;
- jednokrokové Undo bez další AI kvóty;
- lokální recovery snapshot;
- ochranu před zavřením při ukládání;
- zobrazení kvóty;
- Poslední výsledky / historické sessions.

### Prémiové složky a podsložky

Pro účty s `lesson_folders_enabled=true` a pro admina je implementovaná organizace uložených lekcí:

- root složky + jedna úroveň podsložek, tedy maximálně dvě úrovně;
- vytvoření složky/podsložky;
- přejmenování;
- smazání prázdné hierarchické větve až po odstranění podsložek;
- přesun existujících i nově vytvořených lekcí do složky nebo zpět mimo složky;
- dashboard `/lessons` zobrazuje složkovou navigaci a obsah vybrané složky;
- při smazání složky se lesson reference bezpečně vrací na `folder_id=NULL` díky FK `ON DELETE SET NULL`;
- ownership a entitlement jsou vynucené serverově/RLS.

Složky jsou osobní pro daného ownera; současná implementace není sdílený školní/team filesystem.

Ukázková lekce **„Mediální mise – Jak přežít internet a neztratit důstojnost“** byla seeddována/duplikována pod uživatelský účet jako běžná vlastní lesson (migrace `20260917033538_seed_admin_demo_lesson`).

## 8. Auth — stav 2026-09-17

Aplikační public teacher auth flow je implementovaný:

- signup e-mail + heslo;
- login/logout;
- potvrzení e-mailu;
- forgot password;
- recovery + update password;
- generická recovery odpověď bez account enumeration;
- ochrana proti open redirectu;
- password reveal controls;
- Cloudflare Turnstile na veřejných auth tocích;
- Turnstile UX: `beforeInteractive`, preconnect, interaction-only, stav „Kontroluji zabezpečení…“.

Confirmation/recovery jsou scanner-safe:

`TokenHash → /auth/confirm → explicitní POST → /auth/confirm/verify → verifyOtp`

Pouhý GET bezpečnostního e-mailového scanneru tedy token nespotřebuje.

Repo obsahuje branded Orbital Precision auth šablony pro Confirm signup, Reset password, Invite, Magic link, Change email a Reauthentication. Confirm/Recovery jsou aktuální produktové flow; ostatní jsou připravené pro budoucnost.

Hosted Supabase Auth konfigurace byla v rámci **SEC-006** ověřena proti skutečnému projektu a hardening byl dokončen: canonical Site URL `https://www.syllonaut.com`, redirect allowlist přesně `https://www.syllonaut.com`, password minimum 8 znaků, Turnstile aktivní, Resend SMTP/doména ověřené a scanner-safe signup/recovery templates funkční. **SEC-006 — REMEDIATED / CLOSED.**

**SEC-007 — ACCEPTED RISK / DEFERRED:** Supabase Security Advisor dál hlásí Leaked Password Protection Disabled. Na Free plánu zůstává tato ochrana nedostupná; riziko bylo vědomě přijato do doby přechodu na placený plán nebo další produkční hardening fáze.

## 9. Student a live session

Student:

- nemá plnohodnotný účet;
- připojí se QR/kódem a zadá display name;
- participant identita používá náhodný token;
- raw token je pouze HttpOnly cookie, DB drží SHA-256 hash;
- token je scopeovaný na session/participant;
- server-side capability expiruje pevně 24 hodin od joinu (`participant_token_expires_at`), stejně jako browser cookie;
- po refreshi se identita zachovává po dobu platnosti tokenu;
- student vidí pouze aktivní blok a whitelistovaný stav;
- nemění teacher-controlled session state.

Veřejný join je povolen v `lobby` a `live`, ne po `ended`.

### Síťový hardening

Nasazeno:

- individual response save má timeout + následné ověření, zda zápis při stall skutečně proběhl;
- live session lépe toleruje přechodné Supabase chyby;
- Realtime chyba nemá blokovat základní serverový tok;
- team edit lock TTL prodloužen z 12 s na 60 s, DB cap 120 s;
- team status fallback cca 5 s;
- heartbeat cca 15 s;
- team draft se při výpadku zachovává v `sessionStorage`;
- autosave retry backoff cca 2–30 s;
- při refreshi/síťovém konfliktu se lokální text nepřepíše potichu vzdálenou verzí; student zvolí, kterou verzi použít.

### SEC-004 — join abuse/cost amplification — REMEDIATED / CLOSED

Finální ochrana je na DB insert boundary:

- session max. **200 participants**;
- max. **150 nových joinů za 1 minutu na session**;
- kontrola je serializovaná přes lock session row a probíhá v `before insert` triggeru;
- přímý Edge Function/DB insert tedy nemůže obejít aplikační kontrolu;
- index `participants(session_id, joined_at desc)` podporuje recent-join kontrolu.

Relevantní migrace v produkční historii:

- `20260917142041_limit_student_session_joins`
- `20260917142118_enforce_participant_join_limits_at_insert`

## 10. Odevzdání odpovědí: draft vs submit

Neaktivita studenta **není** signál „odpověď je hotová“.

### Team task

- `team_responses.answer` = autosavovaný koncept
- `team_responses.submitted_answer` = poslední explicitně odevzdaná verze
- `team_responses.submitted_at` = čas explicitního odevzdání

Autosave pouze ukládá koncept a nesmí spouštět placené hodnocení.

Akce **Odevzdat týmovou odpověď** snapshotuje aktuální text a teprve explicitní submit může vytvořit/aktualizovat evaluation. Identická znovu odevzdaná verze nesmí vytvořit další placené AI hodnocení.

Presenter u `team_task` počítá jako odevzdané jen řádky s `submitted_at`.

### Individuální `open_text` / `exit_ticket` — SEC-001

Po remediaci SEC-001 mají bodované individuální odpovědi stejnou explicitní semantiku:

- běžné uložení = koncept, bez placené AI operace;
- **Odevzdat odpověď** uloží `submitted_answer` + `submitted_at`;
- identická verze je idempotentní;
- pokud je evaluation ještě `pending`, novější explicitně odevzdaný snapshot ji může aktualizovat tak, aby proběhl nejvýše jeden paid grading;
- po startu nebo dokončení AI gradingu změněná odpověď sama nový placený call nevytvoří;
- teacher vidí, že existuje novější submitted verze, a případné nové hodnocení spouští explicitně;
- podle entitlementu se novější verze po teacher akci zařadí buď do AI, nebo zpět k ručnímu hodnocení.

**SEC-001 — REMEDIATED / CLOSED.**

Relevantní commity:

- `753c848` — explicit individual submissions
- `8360205` — teacher-controlled regrading

## 11. Activity clarity a beta feedback

Uzavřené poznámky z betatestu:

1. Student u aktivity explicitně vidí `Individuální aktivita`, `Týmová aktivita` nebo `Společná aktivita`; stejné badge jsou i v lesson preview.
2. Číselné datasety používají structured `dataTable`.
3. Vyhodnocení otevřených/týmových odpovědí se váže na explicitní submit, ne na autosave nebo čas neaktivity.

Presenter používá vlastní typový label (`Týmový úkol`, `Kvíz`, `Hlasování` atd.); explicitní activity-mode badge ani `dataTable` zatím v samostatném Presenter rendereru nejsou.

## 12. Hybridní scoring + grading

Implementováno a nasazeno:

- quiz se boduje deterministicky pro všechny tarify;
- bodované `open_text` / `exit_ticket` a `team_task` používají `response_evaluations`;
- bez AI entitlementu čekají na ruční teacher score;
- s AI entitlementem AI hodnotí explicitně odevzdaný snapshot podle rubriky;
- teacher override > AI;
- student submit není blokován čekáním na AI;
- atomický DB claim chrání proti paralelnímu dvojímu gradingu;
- confidence může vést k `needs_review`;
- persistent teacher review queue;
- teacher-only rationale/rubrika/confidence/teacher note;
- derived scoreboard se neukládá;
- teacher scoreboard a Presenter používají centralizovaný serverový výpočet;
- public student score vrací jen vlastní `score`, `maxPoints`, `rank`.

`response_evaluations` ukládá answer/rubric snapshot, criterion scores, `ai_score`, `teacher_score`, confidence, status, model a skutečný `cost_usd`. U manual-only hodnocení AI pole zůstávají prázdná.

Hybridní scoring zatím není součástí post-session reportu/CSV.

## 13. Presenter Mode

Samostatný teacher-owner-auth read-only režim.

Lobby:

- QR;
- join link;
- join code;
- počet připojených.

Live:

- právě aktivní úkol synchronizovaný přes Realtime invalidaci + server fetch;
- progress;
- submission counter;
- team counter používá explicitní submit;
- timer;
- join informace zůstávají dostupné.

Po `ended` se zobrazí scoreboard / Moon race:

- Země → Měsíc;
- poloha rakety odpovídá skutečnému `score / dostupné maximum`;
- finální let s akcelerací/decelerací;
- reduced-motion fallback;
- žádné teacher-only grading internals v Presenter payloadu.

## 14. Databázové oblasti a migrace

Hlavní tabulky:

- `profiles`
- `lessons`
- `lesson_folders`
- `generation_requests`
- `sessions`
- `participants`
- `responses`
- `teams`
- `team_responses`
- `team_edit_locks`
- `response_evaluations`

Důležité novější migrace v produkční historii:

- `20260917033538_seed_admin_demo_lesson`
- `20260917085744_extend_team_edit_lock_ttl`
- `20260917102904_submit_team_answers_before_ai_grading`
- `20260917102936_persist_submitted_team_answer_snapshot`
- `20260917105454_submit_team_answers_before_ai_grading`
- `20260917133141_prepare_explicit_individual_submission`
- `20260917134214_activate_explicit_individual_submission`
- `20260917134458_add_teacher_regrade_action`
- `20260917142041_limit_student_session_joins`
- `20260917142118_enforce_participant_join_limits_at_insert`
- `20260917145648_gate_ai_grading_by_entitlement`
- `20260917152048_fix_sec_005_student_write_toctou`
- `20260917162423_add_sec_009_session_retention_lifecycle`
- `20260917163934_strengthen_sec_011_relational_scope_constraints`
- `20260917165505_expire_sec_013_participant_tokens`
- `20260917174635_add_lesson_folders_and_entitlement`
- `20260917175452_index_lesson_folder_scope_fk`
- `20260917180456_harden_lesson_folder_access_and_index_fk`

Repo migration filenames musí zůstat sladěné s verzemi z produkční `supabase_migrations.schema_migrations`. SEC-004 migration history byla explicitně srovnána commitem `14ed01e`.

Folder schema používá owner-scoped composite FK, RLS, max. dvě úrovně hierarchie, `lessons.folder_id` a server-authoritative `profiles.lesson_folders_enabled`. Přesun/assignment bez entitlementu je fail-closed.

## 15. Security audit — aktuální stav

Důkladný audit celé aplikace proběhl 2026-09-17. Všechny nálezy SEC-001 až SEC-015 mají nyní jasný disposition: **13 remediovaných/uzavřených + 2 vědomě přijaté výjimky (SEC-002, SEC-007)**.

### Remediované / uzavřené

**SEC-001 — opakovaná AI spotřeba při automatickém re-gradingu individuálních odpovědí — REMEDIATED / CLOSED**

Explicitní draft/submit, idempotence, teacher-controlled regrade a DB ochrana placeného callu.

**SEC-003 — CSV formula injection — REMEDIATED / CLOSED**

CSV export neutralizuje potenciální spreadsheet formule bez poškození skutečných čísel. Commit `c10f0c4`.

**SEC-004 — neomezené joiny / cost amplification — REMEDIATED / CLOSED**

DB boundary cap 200 participants + 150 joinů/min/session.

**SEC-005 — TOCTOU mezi kontrolou live stavu a privilegovaným student/team zápisem — REMEDIATED / CLOSED**

Migrace `20260917152048_fix_sec_005_student_write_toctou`: DB triggery re-checkují live/current block, team membership a edit lock přímo na write boundary.

**SEC-006 — hosted Supabase Auth hardening/config — REMEDIATED / CLOSED**

Hosted konfigurace byla skutečně ověřena a upravena: password minimum 8, canonical Site URL/redirect allowlist, Turnstile, Resend SMTP/doména a scanner-safe aktivní templates.

**SEC-008 — dependency lockfile / nedeterministické deployment verze — REMEDIATED / CLOSED**

Repo má `package-lock.json`, Node `24.x`, npm `11.19.0` a Vercel používá `npm ci`. Produkční dependencies prošly audit bez HIGH/CRITICAL nálezů při remediaci.

**SEC-009 — retention/deletion lifecycle studentských/session dat — REMEDIATED / CLOSED**

Ukončené sessions se mažou po 12 měsících, opuštěné lobby/live sessions po 30 dnech, expirované team edit locky po 24 hodinách. Teacher může vlastní ukončenou session ručně smazat. Daily Supabase Cron běží v 03:17 UTC. Migrace `20260917162423_add_sec_009_session_retention_lifecycle`.

**SEC-010 — ochrana `main` branche — REMEDIATED / CLOSED**

Aktivní GitHub ruleset `Protect main`: PR povinný, required check `Vercel`, strict up-to-date branch, linear history, block force-push/deletion, bez bypassu. Standardní workflow je `branch → Preview/CI → PR → merge`.

**SEC-011 — relační consistency defense-in-depth — REMEDIATED / CLOSED**

Composite FK vynucují konzistentní `session/team/participant` scope pro participants, team responses a team edit locks. Migrace `20260917163934_strengthen_sec_011_relational_scope_constraints`.

**SEC-012 — DOCX/PPTX decompression bomb — REMEDIATED / CLOSED**

ZIP preflight max. 2000 entries, max. 500 relevantních XML částí, 5 MB rozbalených dat na XML část a 20 MB na dokument; streamovaný decompression guard + odmítnutí ZIP64/multi-disk.

**SEC-013 — participant token bez server-side expiry — REMEDIATED / CLOSED**

`participant_token_expires_at` v DB, pevná max. životnost 24 h; expiry kontrolují student-session, team-edit i public scoreboard. Migrace `20260917165505_expire_sec_013_participant_tokens`.

**SEC-014 — explicitní browser security headers — REMEDIATED / CLOSED**

Globální CSP, HSTS, `nosniff`, `DENY` framing, Referrer Policy, Permissions Policy a vypnuté `X-Powered-By`; Preview CSP zachovává Vercel Toolbar, produkční CI ověřuje živé headers.

**SEC-015 — provider-level Zero Data Retention — REMEDIATED / CLOSED**

Všechna současná `generateText(...)` volání explicitně vyžadují AI Gateway `zeroDataRetention: true`. OpenAI generation/revision/grading zůstává provider-restricted; source-material generation používá Azure/Bedrock. `npm run check` obsahuje AST regresní test, který selže, pokud některá routing větev ZDR opomene. Commit `584a72b`.

### Vědomě přijaté výjimky

**SEC-002 — Preview sdílí production AI/Supabase trust boundary — ACCEPTED RISK / DEFERRED**

Technicky neopraveno. Uživatel výslovně přijal riziko sdíleného Preview/Production trust boundary. Znovu otevřít při potřebě staging prostředí, širší produkční škále nebo zapojení dalších vývojářů.

**SEC-007 — Leaked Password Protection Disabled — ACCEPTED RISK / DEFERRED**

Supabase Security Advisor warning zůstává kvůli Free plánu. Znovu otevřít při přechodu na placený Supabase plán nebo před další vyšší bezpečnostní úrovní.

Původní pre-beta must-fix sada SEC-001/002/003/004/005/006/008/015 má tedy disposition: sedm bodů remediovaných, SEC-002 vědomě přijatá výjimka. Bezpečnostní audit už nemá žádný další nevyřešený kódový finding z řady SEC-001 až SEC-015.

## 16. Aktuální Supabase advisories

Security a Performance Advisor byly během remediací opakovaně spuštěny po DDL změnách. Nové SEC-005/009/011/013 migrace nepřidaly nový security finding.

Známý aktuální warning, který je vědomě přijatý:

- **Leaked Password Protection Disabled** — SEC-007 / ACCEPTED RISK / DEFERRED na Supabase Free.

Advisor může nadále hlásit `SECURITY DEFINER` funkce executable pro `anon`/`authenticated`. Ty nejsou automaticky zranitelnosti: některé RPC jsou úmyslně exposed a interně kontrolují `auth.uid()`, ownership, entitlement nebo participant capability. Každý takový warning posuzovat podle konkrétní funkce, ACL, `search_path`, vstupů a ownership checks; neprovádět mechanické revoke bez dopadové analýzy.

Performance advisor po SEC-011 snížil počet neindexovaných FK; zbývající starší advisories nejsou součástí uzavřených SEC findingů a před případnou úpravou je nutné znovu ověřit proti aktuálnímu query/access modelu.

## 17. Bezpečnostní hranice

Zachovat:

- teacher jen vlastní lesson/session;
- platformní admin není universal content admin;
- student bez účtu nemá široký DB přístup;
- participant capability musí zůstat scopeovaná;
- student nesmí dostat teacherNote, skryté správné odpovědi, grading rubriku, rationale/confidence, teacher note, cizí odpovědi/tokeny;
- Presenter je read-only a whitelistovaný;
- Realtime = invalidation, ne citlivý datový kanál;
- secrets/service role pouze serverově;
- quota a paid-AI entitlement enforcement server/DB;
- destructive operace kontrolují ownership;
- auth redirecty nesmí být open redirect;
- podklady i student text jsou pro AI nedůvěryhodná data.

## 18. Roadmapa / aktuální stav

### Milník A — AI workflow
**Dokončeno.**

AI generation/revision, quota/cost, source materials 10 MB, ephemeral browser extraction, fail-closed ZDR routing pro všechny současné AI inference cesty, prompt-injection ochrana podkladů, explicitní setup params a structured `dataTable`.

### Milník A.1 — účet jako workspace
**MVP dokončeno a produkčně ověřeno.**

Ukládání lekcí, knihovna, rename/duplicate/delete, historické sessions a prémiové osobní složky/podsložky s přesunem existujících lekcí jsou implementované.

### Milník A.2 — veřejný auth
**Aplikační flow i hosted konfigurace auditované a produkčně ověřené.**

Hotovo: signup, login/logout, scanner-safe confirm, forgot/recovery/update password, password reveal, Turnstile integrace, branded template source files, DB free onboarding 5/20.

SEC-006 je uzavřený. SEC-007 zůstává vědomě přijatá výjimka na Free plánu; externí E2E lze dále rozšiřovat podle beta priorit.

### Milník A.3 — Pricing / tarifní produktová vrstva
**Veřejný ceník dokončen; billing zatím záměrně neaktivní.**

Hotovo: `/pricing`, individuální i školní segment, měsíční/roční přepínač, roční zvýhodnění, ceny v CZK/USD, aktivní Free signup CTA, placené CTA „Připravujeme“, vizuální integrace do design systému Syllonautu a odkaz z landing navigace.

Zbývá před skutečným prodejem: billing provider, checkout, subscription lifecycle, DB provisioning konkrétních kvót/entitlementů podle zakoupeného plánu, správa organizací/členství, fakturace a změny/rušení plánu.

### Milník B — live hodina
**Hlavní MVP dokončeno.**

Hotovo: join, participant auth, responses, teams/team task, lock/autosave, explicit team i individual submit, timer, reveal, QR, recovery, report/CSV, scoring, plan-aware manual/AI grading, teacher review, public own score, Presenter, Moon race, network hardening, join abuse protection, beta activity clarity a data tables.

Zbývá: hybridní scoring v post-session reportu/CSV a případné další statistiky. Security audit SEC-001 až SEC-015 je dispositioned; otevřené zůstávají pouze přijaté výjimky SEC-002/007.

### Další produktové položky

- koš/verzování;
- sdílení lekcí a public read-only link;
- templates/favorites/search;
- user export/delete;
- skutečné školní/organizační účty, membership a správa rolí;
- billing/checkout/subscription lifecycle podle již zveřejněné tarifní struktury;
- OCR;
- pokročilá analytika/lokalizace.

## 19. Poslední významné operace 2026-09-17

Bezpečnostní a související změny dokončené po starší verzi tohoto dokumentu:

- `753c848` — SEC-001: explicit individual submissions
- `8360205` — SEC-001: teacher-controlled regrading
- `c10f0c4` — SEC-003: CSV formula injection fix
- `ab69390` — SEC-004: participant caps + burst limit na DB boundary
- `14ed01e` — srovnání SEC-004 migration history s produkcí
- `2fffbf2` — tarifní `ai_grading_enabled`, manual grading pro default/free, AI grading pouze pro entitled účty
- `21975d8` — SEC-005 DB write-boundary TOCTOU hardening
- SEC-006 — hosted Auth config ověřen a ručně hardenován (password min 8, canonical redirect allowlist)
- SEC-007 — vědomě přijaté riziko kvůli Supabase Free
- `534ecb6` — SEC-008 deterministic dependency installs (`package-lock`, Node 24.x, npm 11.19, `npm ci`)
- `f60fb28` — SEC-009 session retention lifecycle + manual delete
- SEC-010 — aktivní GitHub ruleset `Protect main`
- `aac840f` — SEC-011 composite relational constraints
- `5182b71` — SEC-012 Office ZIP/decompression hardening
- `7637dc4` — SEC-013 server-side participant token expiry
- `1becf44` — SEC-014 browser security headers + live regression check
- `584a72b` — SEC-015 fail-closed AI Gateway Zero Data Retention + AST regression check
- `24e8b1c` — prémiové lesson folders/podsložky, `lesson_folders_enabled`, přesun existujících lekcí a server/RLS enforcement
- `e0a02bd` — veřejná stránka Pricing / Ceník, tarify učitelé/školy, měsíční/roční varianta a Free registrační CTA

Všechny uvedené kódové remediace a následné produktové změny prošly chráněným PR workflow s povinným Vercel checkem.

## 20. Pravidla další práce

- nejdřív načíst aktuální `PROJECT.md`, `main` a relevantní soubory;
- vždy zkontrolovat, zda se `main` neposunul kvůli paralelnímu chatu;
- **TEST / OVĚŘENÍ → ÚPRAVA → OVĚŘENÍ**;
- security findings řešit jednotlivě, ne hromadným refaktorem;
- malé logické celky;
- commitovat funkční celky, ne jednotlivé soubory;
- před finálním commitem/merge znovu načíst HEAD `main`;
- zachovat paralelní změny;
- žádný force update `main`;
- `main` je chráněný rulesetem `Protect main`; změny standardně přes pracovní branch → Vercel/CI → PR → merge, branch musí být před mergem aktuální vůči `main`;
- Preview před Production, pokud je dostupné;
- DB migrace pokud možno backward-compatible;
- DDL přes Supabase migration workflow, ne ad-hoc trvalé SQL;
- security/permissions/quota/paid entitlement serverově;
- secrets nikdy do repo/klienta;
- při Supabase zásahu nejdřív ověřit live DB stav;
- po DDL znovu spustit relevantní Supabase advisories;
- nedělat destruktivní/load/stress testy na produkci;
- nevytvářet umělé placené AI cally jen kvůli testu, pokud lze bezpečnost ověřit strukturálně;
- `PROJECT.md` měnit pouze na výslovný pokyn uživatele.

## 21. Bezprostřední další krok

**Security audit SEC-001 až SEC-015 je dokončen a dispositioned.**

- SEC-001/003/004/005/006/008/009/010/011/012/013/014/015 — REMEDIATED / CLOSED.
- SEC-002 — ACCEPTED RISK / DEFERRED: Preview sdílí production trust boundary.
- SEC-007 — ACCEPTED RISK / DEFERRED: Leaked Password Protection na Supabase Free.

Produktově jsou nyní dokumentované a implementované také prémiové složky/podsložky a veřejný Pricing / Ceník. Placené plány zůstávají pouze veřejně popsané a jejich CTA je „Připravujeme“; aktivní je Free signup.

Další práce se má vrátit k produktové roadmapě a beta zpětné vazbě. Před aktivací placených tarifů bude potřeba samostatně navrhnout billing/provisioning a organizační membership model. Security výjimky SEC-002/007 znovu otevřít pouze při změně předpokladů (staging/širší tým/produkční škála, resp. placený Supabase plán). Nové bezpečnostní změny dál provádět jednotlivě podle `TEST / OVĚŘENÍ → ÚPRAVA → OVĚŘENÍ`.