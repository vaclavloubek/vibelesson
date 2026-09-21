# Přechod Syllonautu ze Supabase na Neon

Aktualizováno: 2026-09-21  
Výchozí commit auditu: `3e2aa66e740001d9e4d28f9d2630781318d0f569`  
Pracovní větev ověřeného importu: `codex/neon-staging-import-20260921-v2`

## Stav

Příprava je implementovaná jako bezpečný, opakovatelný migrační balík. Produkční Supabase ani produkční prostředí Vercelu nebyly změněny. Výchozí `DATABASE_BACKEND` zůstává `supabase`; zapnutí Neonu vyžaduje explicitní runtime gate `NEON_CUTOVER_APPROVED=true`.

Databázová stagingová kopie byla vytvořena a validována. Auth import je připravený jako jednorázový Preview build se zachováním UUID a povinným resetem hesla; po jeho ověření následuje aplikační refaktor. **Není povolen produkční cutover**, dokud neprojdou všechny stop podmínky v tomto dokumentu.

### Zřízený stagingový cíl

Dne 2026-09-21 byl ve Vercel projektu `edupilot2` zřízen Vercel-managed Neon projekt `neon-red-ladder`:

- region AWS Europe Central 1 (Frankfurt), plán Free;
- výchozí Neon branch `main`, určená jako rodič stagingového ověření;
- Vercel resource je připojený pouze k Preview, nikoli k Production;
- pro Preview je zapnuté automatické vytváření izolované Neon branch;
- Managed Better Auth i Data API jsou aktivní;
- plošný `Grant public schema access` zůstal vypnutý; granty a RLS se aplikují explicitně z auditovaných migrací;
- databáze byla při zřízení prázdná a produkční traffic zůstává na Supabase.

### Ověřený stagingový import

Dne 2026-09-21 byl do nové izolované Preview branch proveden kompletní dump/restore ze Supabase. Úspěšný Vercel deployment `4DhTaNKAUgz4YV4dRKQxYm3chPM2` běžel z commitu `50d94d9` a skončil stavem `Ready`:

- preflight ověřil Supabase PostgreSQL 17.6 a Neon PostgreSQL 18.6;
- shodné počty a deterministické checksumy prošly pro všech 14 sledovaných tabulek;
- ověřené počty: `profiles` 3, `lessons` 32, `sessions` 23, `participants` 151, `responses` 265, `teams` 54, `team_responses` 75, `lesson_folders` 9, `lesson_live_usage` 10, `lesson_shares` 8, `billing_subscriptions` 5, `billing_email_deliveries` 1, `organization_memberships` 3 a `organizations` 1;
- identity bridge obsahuje 3 uživatele a shoduje se se zdrojem; heslové hashe ani session tokeny se neimportovaly;
- závěrečný aplikační build, TypeScript a generování stránek prošly;
- Supabase byl po celou dobu pouze čten a produkční Vercel prostředí zůstalo beze změny.

Jednorázový zapisující `buildCommand` byl po úspěchu odstraněn z `vercel.json`, aby další Preview deploymenty migraci automaticky neopakovaly. Úspěšný staging snapshot je dostupný na `https://edupilot2-2267f49n9-vaclavloubek1.vercel.app`; nejde o produkční cutover.

## Incident 2026-09-21

Pozorovaný problém na `/lessons` nebyla ztráta dat:

- přímý databázový dotaz v době incidentu vrátil 26 lekcí, 9 složek, 22 ukončených sessions a profil přibližně za sekundu;
- session nebyla expirovaná a `auth.sessions.refreshed_at` se změnilo v 14:31:45 CEST;
- po refreshi tokenu začala stejná verze aplikace a stejná data znovu fungovat; `main` zůstal na `3e2aa66e` a neproběhl deploy ani migrace;
- Supabase současně evidoval incident s odmítáním JWT na API Gateway/Data API;
- `/lessons` prováděl mnoho navazujících Auth/Data API/RPC požadavků bez explicitního timeoutu. LEGAL-012 přidal jednu další kontrolu akceptace VOP, ale incident začal před nasazením této změny.

Pracovní závěr: kořenem byl přechodný Auth/API stav po validaci JWT; sekvenční načítání bez timeoutu zvětšilo dopad na UI. V této větvi proto každý Supabase fetch končí po 8 sekundách, nezávislé dotazy `/lessons` běží souběžně, Terms gate má jeden batch RPC a route má vlastní loading/error boundary.

## Inventura závislostí

| Oblast | Nález | Cílová náhrada |
|---|---:|---|
| Soubory s přímou Supabase závislostí | 101 | postupně `lib/neon/*` a serverové datové služby |
| Tabulky volané přes `.from()` | 23 | Neon Postgres + Data API/RLS |
| RPC jména volaná aplikací | přibližně 70 | stejné PostgreSQL funkce po revizi grantů |
| SQL migrace v repozitáři | 134 | zdrojové `pg_dump` schéma je kanonické; historie není úplný bootstrap |
| `SECURITY DEFINER` výskyty v migracích | 280 | jednotlivě auditovat ownera, `search_path`, granty a autorizaci |
| `auth.uid()` výskyty | 92 | Neon Data API / `pg_session_jwt`, ověřit typ UUID |
| `auth.users` výskyty | 39 | přemapovat na `app_identity.users`; zachovat UUID |
| Supabase Edge Functions | 2 (`student-session`, `team-edit`) | port do Vercel route/server modulů |
| Supabase Realtime klienti | 4 | Cloudflare Durable Object WebSocket + replay/polling |
| `pg_net` / outbound HTTP | 3 aktivní dispatch cesty | soukromá DB fronta + Vercel Cron/worker |
| Supabase Storage | nepoužívá se | žádná migrace souborů |

První verzovaná SQL migrace už odkazuje na existující `public.lessons`; migrační adresář tedy není úplný bootstrap databáze. Proto se cílové schéma vytváří ze skutečného zdrojového `pg_dump --section=pre-data/post-data`, ne pouhým přehráním 134 souborů.

## Cílová architektura

| Současnost | Cíl |
|---|---|
| Supabase Postgres | Neon Postgres v AWS regionu co nejblíže Vercelu a dnešnímu `eu-west-1` |
| Supabase Data API | Neon Data API pro úzké RLS klientské cesty |
| `service_role` RPC | dočasná NOLOGIN kompatibilitní role; server-only `app_service` přes `@neondatabase/serverless`, později přímé nejmenší granty |
| Supabase Auth/SSR | Neon Auth (Managed Better Auth) s httpOnly cookies a zachovanými UUID |
| `auth.users` FK | stabilní `app_identity.users` bridge, synchronizovaný z `neon_auth.user` |
| Supabase Realtime | existující Cloudflare `LiveSession` Durable Object |
| Supabase Edge Functions | Vercel Route Handlers / serverové moduly |
| `pg_net` | DB outbox + idempotentní Vercel worker/Cron |
| Supabase Cron | Vercel Cron nebo explicitní Neon-supported scheduler podle konkrétní úlohy |

Pro privilegované billingové, právní a organizační operace se nepoužije veřejný Data API klíč. Poběží výhradně serverově, s omezenou DB rolí a existující Stripe/Resend idempotencí. Hodnoty connection stringů, Stripe secretů, webhook secretů a Auth cookie secretu se nesmí logovat ani vystavit přes `NEXT_PUBLIC_*`.

## Co je v této větvi připravené

- přesně připnuté balíky `@neondatabase/serverless`, `@neondatabase/auth` a `@neondatabase/neon-js`;
- lazy serverový Neon SQL klient a oddělený serverový/klientský Neon Auth základ;
- explicitní konfigurace a cutover guard;
- read-only preflight, výchozí dry-run migrace, explicitní write gate, import identity bridge a deterministické kontroly počtů/checksumů;
- samostatný Auth preflight, který bez výpisu e-mailů porovná počet a fingerprint UUID/e-mailů a odmítne ne-UUID identitu;
- dry-run-first Auth import s vlastní zápisovou pojistkou, zachováním UUID, kontrolou konfliktů a výslovným zákazem kopírování hesel a sessions;
- idempotentní SQL prerequisites a Neon Auth synchronizační trigger;
- deklarace Cloudflare Durable Object SQLite migrace;
- hardening `/lessons` proti opakování incidentu;
- regresní kontrakt `scripts/verify-neon-migration-preparation.mjs`.

Balíky Neon Auth a Neon JS jsou v této revizi beta a jsou připnuté přesně. Před produkcí musí staging prokázat funkčnost konkrétních verzí; automatický upgrade není povolen.

## Proměnné prostředí

Server-only:

```text
DATABASE_BACKEND=supabase|neon
NEON_DATABASE_URL=
NEON_DATABASE_URL_UNPOOLED=
NEON_DATA_API_URL=
NEON_AUTH_BASE_URL=
NEON_AUTH_COOKIE_SECRET=
NEON_CUTOVER_APPROVED=false|true
```

Klientské endpointy bez credentialů:

```text
NEXT_PUBLIC_NEON_DATA_API_URL=
NEXT_PUBLIC_NEON_AUTH_URL=
```

Pouze jednorázový migrační shell, nikdy Vercel runtime:

```text
SUPABASE_DB_URL=
NEON_MIGRATION_APPROVED=I_UNDERSTAND_THIS_WRITES_TO_NEON
NEON_AUTH_IMPORT_APPROVED=I_UNDERSTAND_THIS_CREATES_NEON_AUTH_USERS
```

### Bezpečné lokální načtení Preview proměnných

Místní kopie se propojí s existujícím Vercel projektem a tajné hodnoty se stáhnou přímo do Git-ignorovaného souboru. Connection stringy se nekopírují do chatu ani do verzovaných souborů.

```bash
vercel link --yes --project edupilot2
vercel env pull .env.local --environment=preview --yes
chmod 600 .env.local
```

Po rotaci Neon databázového hesla je nutné Preview proměnné stáhnout znovu a vytvořit nový Preview deployment. Hodnoty se při ověřování nikdy nevypisují; kontroluje se pouze přítomnost požadovaných názvů. Vercel Secret hodnoty jsou po uložení write-only, takže ručně vytvořený `SUPABASE_DB_URL` se při `env pull` stáhne jako prázdná hodnota a jednorázový migrační shell si jej musí vyžádat skrytě za běhu.

Vzdálený Vercel Preview preflight používá pro zdroj výhradně Supabase **Session pooler** (`*.pooler.supabase.com:5432`). Přímý endpoint `db.*.supabase.co` je IPv6 a z Vercel buildu nemusí být dosažitelný (`ENETUNREACH`).

## Staging runbook

### 1. Zřídit izolovaný cíl

1. [Hotovo] Neon je zřízen přes Vercel Marketplace v AWS Frankfurt.
2. [Hotovo] Vercel Production nebyl připojen; Preview vytváří izolované databázové branche.
3. [Hotovo] Data API a Managed Better Auth jsou aktivní na výchozí branch `main`.
4. [Čeká] Nastavit trusted origins, e-mail, OAuth callbacky a cookie doménu pouze na staging.
5. [Čeká] Vytvořit nepoužívané staging Stripe webhook endpointy nebo Stripe test-mode endpointy; nikdy nemíchat test/live secrets.

### 2. Nástroje a read-only kontrola

Je potřeba kompatibilní `psql` a `pg_dump`. Hodnoty URL se nevypisují.

```bash
npm run neon:preflight
npm run neon:preflight -- --execute
```

První příkaz je pouze náhled. Druhý čte verze, velikost a požadované role ze zdroje i cíle.

Ověřeno 2026-09-21 přes jednorázový Vercel Preview build:

- zdroj: PostgreSQL 17.6, 21 MB, schémata `auth`, `private`, `public`, 55 aplikačních tabulek a 3 Auth uživatelé;
- cíl: PostgreSQL 18.6, přibližně 7,8 MB systémových dat, 0 aplikačních tabulek, role `anonymous`/`authenticated` a Neon Auth připravené;
- výsledek: `PASS`, všechny dotazy uvnitř read-only transakcí, žádné databázové zápisy;
- kapacita: zdrojových 21 MB se vejde do 0,5GB Free staging limitu s výraznou rezervou.

Pro opakování v chráněném Preview buildu slouží `npm run neon:remote-preflight`. Nesmí být trvale připojen k běžnému build commandu; zapíná se pouze jednorázově a po kontrole se z build konfigurace odstraní.

### 3. Kopie databáze

Stav: **Hotovo pro izolovaný staging**. Úspěšný import a checksumy jsou zaznamenané výše. Příkazy níže zůstávají runbookem pro nový čistý staging nebo budoucí finální copy po schváleném write-freeze.

```bash
npm run neon:migrate
NEON_MIGRATION_APPROVED=I_UNDERSTAND_THIS_WRITES_TO_NEON npm run neon:migrate -- --execute
```

Výchozí příkaz nic nemění. `--execute` zapisuje jen do cílového Neonu, nikdy do Supabase. Citlivý dočasný export vzniká s `umask 077` v náhodném adresáři a po skončení se odstraní. Heslové hashe ani session tokeny se tímto krokem neexportují.

Skript odmítne cíl, který už obsahuje aplikační tabulky v `public`, `private` nebo `app_identity`. Po částečně neúspěšném importu se nepokračuje přes existující data; vytvoří se nová čistá Neon branch a import se opakuje od začátku.

### 4. Auth migrace

Aktuální Neon Auth je Better Auth v `neon_auth.*`. Starší Neon návod pro Stack Auth a `users_sync` není pro tuto architekturu autoritativní.

Read-only kontrola 2026-09-21 ověřila:

- Supabase má 3 aktivní uživatele, všichni 3 mají potvrzený e-mail a heslovou identitu; jediný provider je `email`;
- stagingová tabulka `neon_auth.user` je prázdná a používá UUID primární klíč;
- heslo se v Better Auth ukládá do `neon_auth.account` s providerem `credential`;
- Supabase hashe jsou bcrypt, zatímco spravovaný Better Auth používá scrypt. Hashe se proto nekopírují a existující uživatelé musí jednou projít bezpečným resetem hesla.

Povinný postup:

1. Spustit dry-run; nesmí nic změnit:

```bash
bash scripts/neon/auth-import.sh
```

2. Na izolované Preview branch spustit zápis pouze s explicitní pojistkou:

```bash
NEON_AUTH_IMPORT_APPROVED=I_UNDERSTAND_THIS_CREATES_NEON_AUTH_USERS \
  bash scripts/neon/auth-import.sh --execute
```

Skript načte ze Supabase pouze UUID a stav ověření, importuje 3 řádky do `neon_auth.user`, porovná fingerprint a nainstaluje synchronizační trigger. Nekopíruje `encrypted_password`, OAuth tokeny ani sessions a neposílá žádný e-mail.

3. Po úspěšném Preview buildu odstranit jednorázový `buildCommand` z `vercel.json` dříve, než bude větev sloučena nebo znovu nasazena mimo staging.
4. Jeden vlastník testovacího účtu sám spustí „Zapomenuté heslo“, dokončí reset a ověří login, logout, refresh a revokaci session. Odeslání resetovacího e-mailu není součást automatického importu.
5. Samostatně ověřit registraci, verifikaci e-mailu a případný budoucí OAuth callback.
6. Diagnostiku lze zopakovat:

```bash
npm run neon:auth-preflight
```

Auth preflight musí vrátit shodný počet i fingerprint mezi Supabase, `app_identity.users` a `neon_auth.user` a nula non-UUID ID. Nezobrazuje jednotlivé e-maily.

### 5. Aplikační port

Před cutoverem musí být dokončeno:

- nahradit Supabase SSR/Auth helpery Neon Auth middlewarem/handlerem;
- přesměrovat `.from()` a `.rpc()` na Neon Data API nebo serverové SQL služby;
- převést `student-session` a `team-edit` z Edge Functions do Vercel serverových modulů;
- odstranit čtyři Supabase Realtime kanály až po ověření teacher/student/presenter WebSocket reconnectu, replay a fallback pollingu přes Cloudflare;
- nahradit všechny `net.http_post` grading dispatch funkce DB outboxem; samotná existence `private.grading_jobs` nestačí, protože současný worker používá jednorázový plaintext capability token;
- převést cron úlohy pro grading retry, free-session expiry a billing lifecycle;
- zachovat append-only právní evidenci, Stripe webhook signature validation, idempotency keys a oddělení test/live klíčů;
- přegenerovat databázové typy proti Neonu a odstranit `service_role` z klientských cest.

### 6. Akceptační testy

Minimální testovací matice:

| Tok | Povinné ověření |
|---|---|
| Auth | registrace, login heslem, OAuth, reset, refresh, logout, revokace |
| Lekce | seznam, složky, vytvoření, AI generování, editace, share/import, archivace |
| Live | teacher start/next/end, student join/response, týmy, presenter, reconnect/replay |
| Hodnocení | enqueue, claim, AI výsledek, retry, budget a review |
| Billing | test Checkout, signed webhook replay, upgrade/downgrade, portal, refund/dispute |
| Právní | VOP re-consent v4/v5/v6, snapshot, online odstoupení, immutable audit |
| Organizace | pozvánka, role, seat/device limity, objednávka, invoice lifecycle |
| Izolace | cizí user/org nesmí číst ani měnit data; anonymous nesmí privileged RPC |
| Výkon | `/lessons` p95, počet backend round-tripů, timeout/error UX |

Každý test musí projít přes browser → Vercel route → Neon/Auth/Data API → odpověď v UI. Nestačí pouze SQL dotaz.

## Stop podmínky před produkcí

Cutover je zakázaný, pokud platí alespoň jedna položka:

- Auth import nezachovává UUID nebo není prokázané přihlášení existujících účtů;
- checksum/count nesedí pro libovolnou kritickou tabulku;
- některý `SECURITY DEFINER` RPC má implicitní `PUBLIC` execute, neomezený `search_path` nebo chybějící kontrolu actor/owner;
- kompatibilitní role `anon` / `service_role` jsou LOGIN role nebo mají širší členství, než je popsáno v `0001_prerequisites.sql`;
- některá veřejná tabulka nemá RLS nebo správný grant pro `anonymous`/`authenticated`;
- aplikace stále volá Supabase Edge Function, Realtime channel nebo `pg_net` v kritickém toku;
- Stripe/Resend workflow ztratí idempotenci nebo rozlišení test/live;
- Cloudflare Durable Object migrace nebyla ověřena proti skutečné deployed migration history;
- Vercel preview/build/typecheck nebo staging E2E nejsou zelené;
- není domluvené write-freeze okno a osoba oprávněná rozhodnout rollback.

## Produkční cutover

Pro velikost současných dat je bezpečnější krátký write freeze než obousměrný dual-write. Billingová a právní data se nesmí zapisovat paralelně do dvou zdrojů bez distribuované idempotence.

1. Oznámit údržbové okno a zastavit nové mutace, signup, checkout a live start; čtení může zůstat.
2. Zaznamenat poslední Supabase transakční čas a commit aplikace.
3. Provedení finálního dump/importu a všech checksumů.
4. Ověřit identity fingerprint a Auth smoke test.
5. Nastavit Neon env pro nový Vercel deployment, ale ponechat starý deployment dostupný pro rollback.
6. Nasadit s `DATABASE_BACKEND=neon` a `NEON_CUTOVER_APPROVED=true`.
7. Spustit smoke testy v pořadí Auth → read-only lekce → bezpečná testovací mutace → live staging-like flow → Stripe test-mode.
8. Otevřít zápisy až po zeleném výsledku a 15 minut sledovat Auth 4xx/5xx, DB errors, latency a queue backlog.
9. Supabase ponechat beze změny a read-only po dohodnuté rollback období. Mazání projektu je samostatné budoucí rozhodnutí.

## Rollback

Pokud se problém objeví ještě během write freeze:

1. neotevírat Neon zápisy;
2. vrátit Vercel env na Supabase a nasadit poslední známý dobrý commit;
3. ověřit login, `/lessons`, jednu read-only session a Stripe webhook health;
4. znovu otevřít zápisy do Supabase.

Pokud už Neon přijal produkční zápisy, prosté přepnutí zpět by vytvořilo split-brain a je zakázané. Zápisy se znovu zmrazí, identifikuje se Neon-only delta podle časů/ID a ta se řízeně přenese zpět nebo se Neon opraví vpřed. Billingové/právní eventy se deduplikují podle existujících provider ID a idempotency keys; nikdy se slepě nereplayují.

## Provoz po cutoveru

- měřit p50/p95/p99 pro Auth, Data API, přímé SQL a `/lessons` odděleně;
- logovat názvy operací, status a latency, nikdy JWT, cookie, DB URL, e-mail ani odpovědi studentů;
- alertovat na Auth 401/403 skok, DB 5xx, timeouty, grading queue age a Cloudflare revision/reconnect chyby;
- zálohy a PITR Neonu otestovat obnovou do nové branch;
- po stabilizačním období odstranit Supabase kód po menších PR, ale Supabase projekt rušit až po samostatném schválení a ověřené retenci/exportu auditních dat.
