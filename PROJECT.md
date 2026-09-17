# Syllonaut — projektový stav

Aktualizováno: 2026-09-17 po bezpečnostním auditu, remediaci SEC-001/003/004 a zavedení tarifního entitlementu pro AI grading.

## 1. Produkt a zdroj pravdy

**Syllonaut — AI navigátor pro interaktivní výuku.**

Syllonaut umožňuje učiteli vytvořit, upravit, uložit, vést a vyhodnotit interaktivní hodinu. Učitel zadá téma/cílovou skupinu/délku/styl nebo přidá vlastní podklady; AI vytvoří validovanou strukturovanou lekci. Učitel ji upravuje přirozeným jazykem, uloží ji ke svému účtu, spustí live session a studenti se připojí bez plnohodnotného účtu přes QR/kód.

Autoritativní repository: `vaclavloubek/vibelesson`.

Starší `vaclavloubek/edupilot` nepoužívat. Produktově a vizuálně používat pouze **Syllonaut**; technické legacy názvy mohou zůstat tam, kde migrace nemá funkční hodnotu.

`PROJECT.md` je zdroj pravdy pro produkt, architekturu, bezpečnost, stav a priority. Mění se pouze na výslovný pokyn uživatele.

Hlavní doména: `syllonaut.com`.

Aktuální `main` HEAD při této aktualizaci:

`2fffbf2a804d864cfda1a09cb20c758f5d4377e7` — **Gate AI grading by plan entitlement**.

## 2. Stack a deployment

- Next.js 16.3.1, React 19.2, TypeScript 5.9, Zod 4.1
- Vercel AI SDK 7 + Vercel AI Gateway
- Supabase Auth + Postgres + RLS + Realtime
- AI model: `openai/gpt-5.6-sol`
- Vercel projekt: `edupilot2` (legacy technický název), autoritativní branch `main`, plán Pro
- Supabase project ref: `qsjddlgmabgmtssvntmn`, `eu-west-1`, Postgres 17, RLS aktivní
- velikost DB ověřená 2026-09-17: přibližně **13 MB**

Generování bez podkladů je přes Gateway omezené na OpenAI. Generování s podklady používá routing pouze přes `bedrock` / `azure`, řazený podle ceny, `zeroDataRetention: true`.

### Vercel Preview a SEC-002

Poslední ověřený stav při auditu:

- `NEXT_PUBLIC_SUPABASE_URL` a `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` jsou dostupné i pro Preview;
- `AI_GATEWAY_API_KEY` a `AI_MODEL` byly dostupné pro Production i Preview;
- Preview buildy jsou funkční.

Tento stav znamenal sdílenou produkční trust boundary pro Preview a byl evidován jako **SEC-002**. Cílová architektura byla odsouhlasena: samostatný sdílený staging Supabase pro Preview, oddělená AI identita/credential s omezeným blast radius a ochrana Preview přes Vercel Authentication/Deployment Protection.

**SEC-002 není v tomto dokumentu považován za uzavřený**, dokud nebude oddělení prostředí skutečně provedeno a ověřeno. Nezaměňovat veřejný Supabase publishable key s tajným credentialem; problém je především sdílená produkční DB/trust boundary a placená AI identita.

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

Security audit eviduje samostatně **SEC-012**: klientská extrakce DOCX/PPTX přes JSZip může před textovým limitem expandovat komprimovaný obsah; jde o low hardening proti decompression bomb.

## 6. Účet, kvóty a tarifní entitlementy

Běžný účet:

- `role=user`
- 5 nových lekcí / kalendářní měsíc
- 20 AI úprav / kalendářní měsíc
- `ai_grading_enabled=false` jako bezpečný default

Admin:

- `role=admin`
- `monthly_lesson_limit=NULL`
- `monthly_revision_limit=NULL`
- je serverově považován za oprávněný k AI gradingu

Nový auth user dostane `profiles` řádek přes `on_auth_user_created → private.handle_new_user()`. DB defaulty jsou autorita free 5/20; při registraci se v první verzi nevybírá tarif.

### AI grading entitlement

Od 2026-09-17 existuje v `profiles` server-authoritative boolean `ai_grading_enabled`.

Produktové pravidlo:

- Free: deterministický quiz + ruční hodnocení otevřených/týmových odpovědí;
- budoucí střední tarif: stejně bez placeného AI gradingu;
- nejvyšší tarif: `ai_grading_enabled=true` a může používat placený AI grading;
- admin se chová jako nejvyšší tarif;
- billing ani názvy budoucích placených tarifů zatím nejsou zadrátované do grading kódu.

Fail-closed ochrana je ve více vrstvách:

- submit/queue vytvoří pro neentitled učitele rovnou manual-review evaluation;
- background grading processor bez entitlementu nevrací práci k AI;
- přímý `/grade` endpoint entitlement znovu ověřuje;
- DB `claim_response_evaluation(...)` kontroluje ownership i entitlement;
- UI není bezpečnostní hranice.

Manual grading používá stejnou tabulku `response_evaluations`, typicky `status='needs_review'`, `grader_version='manual-v1'`, bez `ai_score`, modelu a AI costu. Učitel zadá `teacher_score` a volitelnou poznámku.

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

Důležité: HTML soubory v repo se samy nenasazují do hosted Supabase. **SEC-006** zůstává otevřený jako hosted-config validation: SMTP, aktivní templates, Site URL, Redirect allowlist, rate limits, CAPTCHA/Auth nastavení a session policy je nutné ověřit proti skutečnému hosted projektu.

**SEC-007:** Supabase security advisor stále hlásí Leaked Password Protection Disabled.

## 9. Student a live session

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

Repo migration filenames musí zůstat sladěné s verzemi z produkční `supabase_migrations.schema_migrations`. SEC-004 migration history byla explicitně srovnána commitem `14ed01e`.

## 15. Security audit — aktuální stav

Důkladný read-only audit celé aplikace proběhl 2026-09-17. Nálezy je nutné řešit po jednom, vždy `TEST / OVĚŘENÍ → ÚPRAVA → OVĚŘENÍ`.

### Uzavřené nálezy

**SEC-001 — opakovaná AI spotřeba při automatickém re-gradingu individuálních odpovědí — REMEDIATED / CLOSED**

Explicitní draft/submit, idempotence, teacher-controlled regrade a DB ochrana placeného callu.

**SEC-003 — CSV formula injection — REMEDIATED / CLOSED**

`SessionReport` při CSV exportu neutralizuje textové buňky, které po případném whitespace/control prefixu začínají `=`, `+`, `-` nebo `@`. Číselné hodnoty se zachovávají jako čísla. Commit `c10f0c4`.

**SEC-004 — neomezené joiny / cost amplification — REMEDIATED / CLOSED**

DB boundary cap 200 participants + 150 joinů/min/session, viz sekce 9.

### Otevřené / další nálezy

**SEC-002 — Preview sdílí production AI/Supabase trust boundary — OPEN / INFRASTRUCTURE REMEDIATION REQUIRED**

Poslední ověřený stav při auditu byl potvrzený architektonický risk. Cílové řešení: staging Supabase + oddělená Preview AI identita + Preview protection. Neoznačovat jako closed bez nové infrastrukturní verifikace.

**SEC-005 — TOCTOU mezi kontrolou live stavu a service-role zápisem — MEDIUM / CONFIRMED**

Student/team Edge flow nejdřív kontroluje aktuální aktivní blok/stav a následně provádí privilegovaný zápis. Stav se může mezi těmito kroky změnit. Cílový směr: atomický DB RPC nebo jiná DB-level recheck/lock konstrukce, která sváže autorizaci a zápis v jedné transakci. **Toto je další kódový finding k řešení.**

**SEC-006 — hosted Supabase Auth hardening/config — MEDIUM / NEEDS VALIDATION**

Ověřit skutečný hosted Site URL, redirect allowlist, CAPTCHA, rate limits, SMTP/templates, session nastavení a další Auth konfiguraci.

**SEC-007 — Leaked Password Protection Disabled — LOW / OPEN**

Aktuálně hlášeno Supabase security advisorem.

**SEC-008 — chybí dependency lockfile / deployment versions nejsou deterministické — MEDIUM / OPEN**

Vyřešit až po kontrole současného package/deploy workflow, nevytvářet lockfile mechanicky bez ověření.

**SEC-009 — chybí explicitní retention/deletion lifecycle studentských/session dat — MEDIUM HARDENING / OPEN**

**SEC-010 — `main` branch není chráněný — HARDENING / OPEN**

Při aktualizaci tohoto dokumentu GitHub stále reportoval `main protected=false`. Nepoužívat force update.

**SEC-011 — relační consistency defense-in-depth — LOW / OPEN**

**SEC-012 — DOCX/PPTX client decompression bomb — LOW / OPEN**

**SEC-013 — participant token bez explicitní server-side expiry — LOW / OPEN**

HttpOnly cookie má přibližně 24 h maxAge, ale serverová capability sama nemá explicitní expiry claim/state.

**SEC-014 — explicitní security headers — LOW / NEEDS VALIDATION**

Repo při auditu neměl explicitní security headers konfiguraci; live headers nebyly kompletně ověřené.

**SEC-015 — provider-level ZDR pro OpenAI cesty bez source materials / grading — MEDIUM / NEEDS VALIDATION**

Source-material generation používá Bedrock/Azure routing s `zeroDataRetention: true`; u běžného OpenAI generation/revision/grading toku nebyla při auditu provider-level ZDR garance explicitně doložena.

Původní pre-beta must-fix sada byla: SEC-001, SEC-002, SEC-003, SEC-004, SEC-005, SEC-006, SEC-008, SEC-015. Z ní jsou nyní uzavřené SEC-001, SEC-003 a SEC-004.

## 16. Aktuální Supabase advisories

Security advisor byl znovu spuštěn po migraci `20260917145648_gate_ai_grading_by_entitlement`.

Aktuálně hlásí:

- `get_student_public_scoreboard(...)` — `SECURITY DEFINER`, executable pro `anon`;
- 11 `SECURITY DEFINER` funkcí executable pro `authenticated`;
- **Leaked Password Protection Disabled**.

Tyto warnings nejsou automaticky zranitelnosti. Některé RPC jsou úmyslně exposed a interně kontrolují `auth.uid()`, ownership a/nebo capability. Každý advisor finding musí být posouzen podle skutečné funkce, ACL, `search_path`, vstupů a ownership checks; neprovádět mechanické revoke bez dopadové analýzy.

Předchozí performance advisories zahrnovaly FK bez covering indexu, některé RLS policies bez initplan-friendly `(select auth.uid())` a nepoužité indexy. Před případnou úpravou znovu spustit advisor a ověřit skutečný query/access model.

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

AI generation/revision, quota/cost, source materials 10 MB, ephemeral browser extraction, ZDR routing pro source-material flow, prompt-injection ochrana podkladů, explicitní setup params a structured `dataTable`.

### Milník A.1 — účet jako workspace
**MVP dokončeno a produkčně ověřeno.**

### Milník A.2 — veřejný auth
**Aplikační flow implementovaný; hosted konfiguraci dál auditovat.**

Hotovo: signup, login/logout, scanner-safe confirm, forgot/recovery/update password, password reveal, Turnstile integrace, branded template source files, DB free onboarding 5/20.

Zbývá zejména SEC-006/007 a kompletní externí E2E po security hardeningu.

### Milník B — live hodina
**Hlavní MVP dokončeno.**

Hotovo: join, participant auth, responses, teams/team task, lock/autosave, explicit team i individual submit, timer, reveal, QR, recovery, report/CSV, scoring, plan-aware manual/AI grading, teacher review, public own score, Presenter, Moon race, network hardening, join abuse protection, beta activity clarity a data tables.

Zbývá: hybridní scoring v post-session reportu/CSV, security findings od SEC-005 dál a případné další statistiky.

### Další produktové položky

- koš/verzování;
- sdílení lekcí a public read-only link;
- templates/favorites/search;
- user export/delete;
- školní/organizační účty;
- billing až po samostatném rozhodnutí;
- OCR;
- pokročilá analytika/lokalizace.

## 19. Poslední významné operace 2026-09-17

Novější než předchozí `PROJECT.md`:

- `753c848` — SEC-001: explicit individual submissions
- `8360205` — SEC-001: teacher-controlled regrading
- `c10f0c4` — SEC-003: CSV formula injection fix
- `ab69390` — SEC-004: participant caps + burst limit na DB boundary
- `14ed01e` — srovnání SEC-004 migration history s produkcí
- `2fffbf2` — tarifní `ai_grading_enabled`, manual grading pro default/free, AI grading pouze pro entitled účty

Vercel Preview i production deploy pro `2fffbf2` skončily `success`.

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

**Pokračovat v security remediation od SEC-005.**

SEC-005 je potvrzený TOCTOU problém mezi kontrolou teacher-controlled live stavu a následným privilegovaným student/team zápisem. Nejprve read-only zmapovat přesné write paths a současné Edge Function/DB transakční hranice; potom navrhnout nejmenší atomickou DB-level opravu. Neprovádět změnu, dokud není jasné, které operace je nutné svázat do jedné transakce a jak zachovat participant token/team lock semantics.

SEC-002 zůstává otevřený infrastrukturní finding a nesmí být omylem označen za vyřešený. Po SEC-005 pokračovat dalšími must-fix body SEC-006, SEC-008 a SEC-015, případně se k SEC-002 vrátit samostatným infrastrukturním krokem podle rozhodnutí uživatele.
