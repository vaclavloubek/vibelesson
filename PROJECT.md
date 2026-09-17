# Syllonaut — projektový stav

Aktualizováno: 2026-09-17 po auth hardeningu, live-resilience úpravách, betatestových opravách a opravě Vercel Preview.

## 1. Produkt a zdroj pravdy

**Syllonaut — AI navigátor pro interaktivní výuku.**

Syllonaut umožňuje učiteli vytvořit, upravit, uložit, vést a vyhodnotit interaktivní hodinu. Učitel zadá téma/cílovou skupinu/délku/styl nebo přidá vlastní podklady; AI vytvoří validovanou strukturovanou lekci. Učitel ji upravuje přirozeným jazykem, uloží ji ke svému účtu, spustí live session a studenti se připojí bez plnohodnotného účtu přes QR/kód.

Autoritativní repository: `vaclavloubek/vibelesson`.

Starší `vaclavloubek/edupilot` nepoužívat. Produktově a vizuálně používat pouze **Syllonaut**; technické legacy názvy mohou zůstat tam, kde migrace nemá funkční hodnotu.

`PROJECT.md` je zdroj pravdy pro produkt, architekturu, bezpečnost, stav a priority. Mění se pouze na výslovný pokyn uživatele.

Hlavní doména: `syllonaut.com`.

## 2. Stack a deployment

- Next.js 16.3.1, React 19.2, TypeScript 5.9, Zod 4.1
- Vercel AI SDK 7 + Vercel AI Gateway
- Supabase Auth + Postgres + RLS + Realtime
- AI model: `openai/gpt-5.6-sol`
- Vercel projekt: `edupilot2` (legacy technický název), autoritativní branch `main`, plán Pro
- Supabase project ref: `qsjddlgmabgmtssvntmn`, `eu-west-1`, Postgres 17, RLS aktivní
- velikost DB ověřená 2026-09-17: přibližně **13 MB**

Generování bez podkladů je přes Gateway omezené na OpenAI. Generování s podklady používá routing pouze přes `bedrock` / `azure`, řazený podle ceny, `zeroDataRetention: true`.

### Vercel Preview

Preview buildy padaly proto, že `NEXT_PUBLIC_SUPABASE_URL` a `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` byly dostupné jen pro Production. 2026-09-17 byly rozšířeny i na Preview. Následný čistý Preview deployment ze stejného stromu jako produkční `main` skončil `success`.

`AI_GATEWAY_API_KEY` a `AI_MODEL` byly už předtím dostupné pro Production i Preview.

## 3. Hlavní routy

- `/` — landing
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

Landing umožní začít zadáním bez okamžité registrace; účet je potřeba až pro skutečné AI generování a ukládání.

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
- Kvóty/oprávnění jsou server/DB autorita.
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

## 6. Účet, kvóty a lesson workspace

Běžný účet:

- `role=user`
- 5 nových lekcí / kalendářní měsíc
- 20 AI úprav / kalendářní měsíc

Admin:

- `role=admin`
- `monthly_lesson_limit=NULL`
- `monthly_revision_limit=NULL`

Nový auth user dostane `profiles` řádek přes `on_auth_user_created → private.handle_new_user()`. DB defaulty jsou autorita free 5/20; při registraci se v první verzi nevybírá tarif.

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

Ukázková lekce **„Mediální mise – Jak přežít internet a neztratit důstojnost“** byla seeddována/duplikována pod uživatelský účet jako běžná vlastní lesson (migrace `20260917033538_seed_admin_demo_lesson`).

## 7. Auth — stav 2026-09-17

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

Důležité: HTML soubory v repo se samy nenasazují do hosted Supabase. Při security auditu explicitně ověřit hosted SMTP, aktivní templates, Site URL, Redirect allowlist, rate limits a další Auth konfiguraci.

## 8. Student a live session

Student:

- nemá plnohodnotný účet;
- připojí se QR/kódem a zadá display name;
- participant identita používá náhodný token;
- raw token je pouze HttpOnly cookie, DB drží SHA-256 hash;
- token je scopeovaný na session/participant;
- po refreshi se identita zachovává;
- student vidí pouze aktivní blok a whitelistovaný stav;
- nemění teacher-controlled session state.

Veřejný join je povolen v `lobby` a `live`, ne po `ended`.

### Síťový hardening 2026-09-17

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

## 9. Team task: koncept vs odevzdání

Po betatestu je týmový draft oddělený od skutečného submitu.

- `team_responses.answer` = autosavovaný **koncept**
- `team_responses.submitted_answer` = poslední explicitně odevzdaná verze
- `team_responses.submitted_at` = čas explicitního odevzdání

Autosave pouze ukládá koncept a **nesmí spouštět placené AI hodnocení**.

Akce **Odevzdat týmovou odpověď**:

- snapshotuje text do `submitted_answer`;
- nastaví `submitted_at`;
- teprve potom může queueovat AI evaluation;
- identická znovu odevzdaná verze nevytváří další placené AI hodnocení;
- změna konceptu po odevzdání neinvaliduje poslední evaluation, dokud tým znovu explicitně neodevzdá změněnou verzi.

Původní trigger, který AI queueoval při každé změně `team_responses.answer`, byl odstraněn. Historické team responses byly při migraci backfillnuté jako dříve odevzdané, aby zůstala historie konzistentní.

Presenter u team_task počítá jako odevzdané jen řádky s `submitted_at`.

## 10. Activity clarity a beta feedback

Dnešní tři poznámky z betatestu jsou uzavřené:

1. Student u aktivity explicitně vidí `Individuální aktivita`, `Týmová aktivita` nebo `Společná aktivita`; stejné badge jsou i v lesson preview.
2. Číselné datasety používají structured `dataTable`.
3. AI vyhodnocení týmové práce se spouští po explicitním submitu, ne po autosavu/neaktivitě.

Neaktivita studenta není signál „odpověď je hotová“.

Presenter používá vlastní typový label (`Týmový úkol`, `Kvíz`, `Hlasování` atd.); explicitní activity-mode badge ani `dataTable` zatím v samostatném Presenter rendereru nejsou.

## 11. Hybridní scoring + AI grading

Implementováno a nasazeno:

- quiz deterministicky;
- bodované `open_text` / `exit_ticket`: AI podle rubriky;
- bodovaný `team_task`: AI pouze nad explicitně odevzdanou verzí;
- teacher override > AI;
- AI submit nezdržuje student response;
- atomický claim chrání proti paralelnímu dvojímu gradingu;
- confidence může vést k `needs_review`;
- persistent teacher review queue;
- teacher-only rationale/rubrika/confidence/teacher note;
- derived scoreboard se neukládá;
- teacher scoreboard a Presenter používají centralizovaný serverový výpočet;
- public student score vrací jen vlastní `score`, `maxPoints`, `rank`.

`response_evaluations` ukládá answer/rubric snapshot, criterion scores, `ai_score`, `teacher_score`, confidence, status, model a skutečný `cost_usd`.

Hybridní scoring zatím není součástí post-session reportu/CSV.

## 12. Presenter Mode

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

## 13. Databázové oblasti

Hlavní tabulky:

- `profiles`
- `lessons`
- `generation_requests`
- `sessions`
- `participants`
- `responses`
- `teams`
- `team_responses`
- `team_edit_locks`
- `response_evaluations`

Poslední relevantní migrace:

- `20260917033538_seed_admin_demo_lesson`
- `20260917105500_extend_team_edit_lock_ttl.sql`
- `20260917111500_submit_team_answers_before_ai_grading.sql`

## 14. Aktuální Supabase advisories — výchozí stav pro security audit

Ověřeno 2026-09-17 po posledních migracích.

Security linter hlásí:

- `get_student_public_scoreboard(...)` — `SECURITY DEFINER`, executable pro `anon`;
- 10 `SECURITY DEFINER` RPC funkcí executable pro `authenticated`, zejména quota/evaluation/review RPC;
- **Leaked Password Protection Disabled**.

Linter warning není automaticky potvrzená zranitelnost. Některé funkce jsou záměrně `SECURITY DEFINER` a kontrolují `auth.uid()` + ownership; student public scoreboard je capability-scoped. Audit musí ověřit skutečnou exploitovatelnost, ACL, `search_path`, vstupy a ownership checks.

Performance linter hlásí:

- 6 FK bez covering indexu;
- 5 RLS policies, které volají `auth.uid()`/auth funkci per-row místo initplan-friendly `(select auth.uid())`;
- 2 dosud nepoužité indexy.

Tyto položky jsou auditní backlog; nemají se mechanicky „opravit“ bez kontroly access/query modelu.

## 15. Bezpečnostní hranice

Zachovat:

- teacher jen vlastní lesson/session;
- platformní admin není universal content admin;
- student bez účtu nemá široký DB přístup;
- participant capability musí zůstat scopeovaná;
- student nesmí dostat teacherNote, skryté správné odpovědi, grading rubriku, rationale/confidence, teacher note, cizí odpovědi/tokeny;
- Presenter je read-only a whitelistovaný;
- Realtime = invalidation, ne citlivý datový kanál;
- secrets/service role pouze serverově;
- quota enforcement server/DB;
- destructive operace kontrolují ownership;
- auth redirecty nesmí být open redirect;
- podklady i student text jsou pro AI nedůvěryhodná data.

## 16. Roadmapa / aktuální stav

### Milník A — AI workflow
**Dokončeno.**

AI generation/revision, quota/cost, source materials 10 MB, ephemeral browser extraction, ZDR routing, prompt-injection ochrana podkladů, explicitní setup params a structured `dataTable`.

### Milník A.1 — účet jako workspace
**MVP dokončeno a produkčně ověřeno.**

### Milník A.2 — veřejný auth
**Aplikační flow implementovaný; produkční konfiguraci auditovat.**

Hotovo: signup, login/logout, scanner-safe confirm, forgot/recovery/update password, password reveal, Turnstile integrace, branded template source files, DB free onboarding 5/20.

Zbývá zejména bezpečnostně ověřit hosted Auth/SMTP/templates/Site URL/redirects/rate limits/leaked-password a provést kompletní externí E2E po auditu.

### Milník B — live hodina
**Hlavní MVP dokončeno.**

Hotovo: join, participant auth, responses, teams/team task, lock/autosave, explicit team submit, timer, reveal, QR, recovery, report/CSV, scoring, AI grading, teacher review, public own score, Presenter, Moon race, network hardening, beta activity clarity a data tables.

Zbývá: hybridní scoring v post-session reportu/CSV a případné další statistiky.

### Další produktové položky

- koš/verzování;
- sdílení lekcí a public read-only link;
- templates/favorites/search;
- user export/delete;
- školní/organizační účty;
- billing až po samostatném rozhodnutí;
- OCR;
- pokročilá analytika/lokalizace.

## 17. Poslední významné operace 2026-09-17

Od předchozí aktualizace `PROJECT.md` (`6dec06b`) proběhlo zejména:

- `33b58a5` — public teacher auth flow
- `728ba54` — scanner-safe auth confirmation
- `48f7169`, `c8931d7` — branded auth templates
- `3ac1b6f`, `55ff7fb` — Turnstile + UX
- `a0bd4d0` — password reveal
- `85b4739`, `06f0b3b` — Presenter jako live classroom display
- `8691eb8` — response-save network hardening
- `18072e0` — live resilience proti přechodným Supabase chybám
- `2c4943a` — zachování team draftů při výpadku
- `c27e6b5` + finální port — activity clarity + structured numeric data
- `eb08629` + finální port — team AI grading jen po explicitním submitu
- `b9f6162` — produkční deployment betatestových oprav

Mimo repo: Vercel Supabase env vars byly rozšířeny na Preview a následný kontrolní Preview build prošel.

## 18. Pravidla další práce

- nejdřív načíst aktuální `PROJECT.md`, `main` a relevantní soubory;
- **TEST / OVĚŘENÍ → ÚPRAVA → OVĚŘENÍ**;
- malé logické celky;
- commitovat funkční celky, ne jednotlivé soubory;
- před finálním commitem znovu načíst HEAD `main`;
- zachovat paralelní změny;
- žádný force update `main`;
- Preview před Production, pokud je dostupné;
- DB migrace pokud možno backward-compatible;
- security/permissions/quota serverově;
- secrets nikdy do repo/klienta;
- při Supabase zásahu nejdřív ověřit live DB stav;
- `PROJECT.md` měnit pouze na výslovný pokyn uživatele.

## 19. Bezprostřední další krok

**Důkladný bezpečnostní audit celé aplikace.**

Nejdřív read-only. Audit musí oddělit:

- potvrzené zranitelnosti;
- hardening doporučení;
- privacy/data-leak rizika;
- abuse/cost-exhaustion rizika;
- performance advisories;
- záměrné architektonické výjimky, které linter pouze varuje.

Po auditu předložit prioritizovaná findings + remediation plán. Do produkce nic neměnit bez explicitního souhlasu uživatele.
