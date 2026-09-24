# Posouzení podle nařízení (EU) 2024/1689 (AI Act) — LEGAL-021

Stav: 2026-09-23, interní verze 0.9.105. Připravil vývojový tým jako podklad ke dni odeslání. **Není to právní stanovisko.** Závěry musí před 1.0 potvrdit právník se specializací na AI Act. Dokument slouží zároveň jako záznam o posouzení podle čl. 6 odst. 4.

## 1. AI funkce Syllonautu a role

Syllonaut uvádí na trh vlastní AI funkce postavené na obecných modelech třetích stran (OpenAI, AWS Bedrock, Microsoft Azure). Vůči těmto funkcím je **poskytovatelem** AI systému (navazující poskytovatel, nikoli poskytovatel modelu GPAI). Učitelé a školy jsou **zavádějícími subjekty**.

| Funkce | Co dělá | Kde v kódu |
|---|---|---|
| Tvorba a AI úpravy lekcí | Generuje text interaktivní lekce, učitel ho kontroluje a upravuje (VOP čl. 4). | `lib/ai.ts`, `app/api/generate`, `app/api/revise*` |
| AI návrh bodování | Navrhne body k otevřené, týmové a exit-ticket odpovědi podle rubriky učitele. | `lib/grading.ts`, `app/api/internal/grading/jobs` |
| Upozornění na možné využití AI | Heuristický signál pro učitele, který nemění body. | `lib/grading.ts`, `lib/ai-integrity-copy.ts` |

Zakázané praktiky podle čl. 5 (např. rozpoznávání emocí ve vzdělávání, sociální scoring) Syllonaut nepoužívá.

## 2. Klasifikace: AI návrh bodování

- **Příloha III bod 3 písm. b)** zahrnuje AI systémy určené k hodnocení výsledků učení, i formativnímu. Bez dalších opatření by funkce pod tento bod spadala.
- **Zamýšlený účel (čl. 3 bod 12)**, vymezený ve VOP 1.10 čl. 4 (`TERMS_AI_SCORING_PURPOSE_CLAUSE`): herní a formativní zpětná vazba v rámci jedné živé lekce. Není určen k úřednímu hodnocení (klasifikace, známky, vysvědčení) ani k rozhodování o přijetí, zařazení či postupu. Ceník stejný účel komunikuje jako „AI návrhy bodování … k potvrzení učitelem“.
- **Výjimka podle čl. 6 odst. 3 písm. d), přípravná činnost:** AI připraví návrh a o bodech rozhoduje učitel. Technicky je to vynucené od 0.9.105:
  - body z AI se do skóre a pořadí započítají až po potvrzení nebo úpravě učitelem: `lib/scoreboard-server.ts` a DB funkce `get_student_public_scoreboard` (Neon migrace `0012`);
  - učitel potvrzuje jednotlivě (`review_response_evaluation`) nebo hromadně vlastním úkonem (`confirm_ai_evaluation_proposals`, tlačítko „Potvrdit všechny návrhy AI“);
  - CSV export výsledků obsahuje jen odpovědi, body v něm nejsou.
  - student vidí hodnocení své odpovědi až po potvrzení učitelem (`readConfirmedEvaluations` v `lib/neon/student-session-server.ts`): body, u nezměněného AI návrhu celkové zdůvodnění viditelně označené „Souhrn AI hodnocení, potvrzený učitelem“, u změněného jen body učitele; poznámku učitele jen tehdy, když ji učitel napsal jako „Poznámku pro studenta“ (Neon migrace `0014`). Signál využití AI se studentovi nezobrazuje nikdy.
- **Profilování:** funkce hodnotí jednotlivou odpověď podle rubriky. Netvoří profil studenta a nepředvídá jeho výkon ani chování. Studenti se připojují bez účtu a body žádný profil nevytváří. **Právník musí potvrdit, že nejde o profilování ve smyslu čl. 6 odst. 3 posledního pododstavce**, protože s profilováním by výjimka neplatila.
- **Předběžný závěr:** po zavedení opatření 0.9.105 funkce nespadá mezi vysoce rizikové systémy díky výjimce podle čl. 6 odst. 3 písm. d).

## 3. Klasifikace: upozornění na možné využití AI

- **Příloha III bod 3 písm. d)** zahrnuje sledování a odhalování zakázaného chování studentů během testů. Syllonaut není testovací nástroj. Signál ale může padnout i na exit-ticket.
- Signál nemění body, není důkazem, automaticky nic nevyvolává a jen upozorní učitele: `AI_INTEGRITY_NOTICE_EXPLANATION`, `scripts/verify-ai-integrity-alert.mjs`. Automatické ověřování studentů je zakázané regresním testem.
- Signál kombinuje odhad modelu a deterministické stopy kopírování z AI chatu v odevzdaném textu (neviditelné znaky, LaTeX, Markdown, zkopírovaná zalomení řádků; `lib/ai-copy-artifacts.ts`). Posuzuje jen odevzdaný text; psaní ani vkládání textu se nesleduje. Sledování chování studenta při psaní by bylo blíž příloze III bodu 3 písm. d) a bez posouzení právníkem se nezavádí.
- **Předběžný závěr:** výjimka podle čl. 6 odst. 3 písm. d), případně písm. c). Uplatnění pro exit-tickety má potvrdit právník.

## 4. Povinnosti bez ohledu na klasifikaci

- **Čl. 6 odst. 4:** posouzení zdokumentovat před uvedením na trh (tento dokument). Povinnost **registrace výjimky v databázi EU (čl. 49 odst. 2)** a její případnou změnu nařízením 2026/1744 musí ověřit právník.
- **Čl. 4, AI gramotnost:** podporovat AI gramotnost lidí, kteří s funkcemi pracují. Uživatelům to plní VOP čl. 4 a návody v produktu, interně jde o školení týmu.
- **Čl. 50 odst. 2, označení syntetického obsahu:** poskytovatelé systémů generujících text mají výstupy strojově čitelně označit. Výjimkou je asistenční editace. Lekce generované AI tuto povinnost pravděpodobně mají. Podle veřejných zdrojů platí od 2. 8. 2026, u systémů uvedených na trh dříve s přechodem do 2. 12. 2026. **Otevřený bod:** formu označení (metadata lekce, exporty, pracovní listy) a rozsah výjimky ověřit s právníkem a zavést do 2. 12. 2026.
- **Čl. 50 odst. 1:** studenti s AI přímo nekomunikují (nejde o chatbot). Učitel ví, že pracuje s AI.

## 5. Termíny

Podle veřejných zdrojů (Digital Omnibus o AI, nařízení (EU) 2026/1744, vyhlášeno 24. 7. 2026):
- povinnosti pro samostatné vysoce rizikové systémy z přílohy III: **2. 12. 2027**;
- čl. 50: 2. 8. 2026, přechod pro existující systémy do 2. 12. 2026.

Znění nařízení 2026/1744 ověřit v Úředním věstníku.

## 6. Kontroly v repozitáři

- `scripts/verify-ai-act-scope.mjs` (součást `npm run check`) hlídá:
  - že se body z AI bez potvrzení nezapočítají, v TS i v migraci `0012`;
  - hromadné potvrzení jen pro učitele hodiny;
  - text zamýšleného účelu ve VOP a ve smluvním snapshotu;
  - copy v Ceníku;
  - existenci tohoto posouzení.
- `scripts/verify-ai-integrity-alert.mjs` hlídá, že signál je jen upozornění.

## 7. K potvrzení právníkem před 1.0

1. Vymezení účelu a výjimka podle čl. 6 odst. 3 písm. d) pro AI návrh bodování, včetně vyloučení profilování.
2. Upozornění na využití AI a exit-tickety vs. příloha III bod 3 písm. d).
3. Registrace podle čl. 49 odst. 2 po nařízení 2026/1744.
4. Čl. 50 odst. 2: forma označení textu generovaného AI, termín 2. 12. 2026.
5. Při změně účelu (např. nabídka pro úřední hodnocení) posouzení zopakovat.
