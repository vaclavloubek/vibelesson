# LEGAL-023 — Balíčky návrhů hodnocení od AI: podklad pro právní posouzení

Stav: **připraveno, neaktivní** (interní verze 0.9.145). Nákup je za serverovým
vypínačem `AI_GRADING_TOPUPS_ENABLED` (výchozí vypnuto) a zároveň ho blokuje
`TERMS_AI_GRADING_TOPUP_ARTICLE_ACTIVE = false` v `lib/legal.ts`. Dokud právník
neposoudí body níže a vlastník projektu nepotvrdí výsledek, zůstává v produkci
**VOP 1.11** a checkout balíčku vrací `topup_terms_not_active`.

## Co se prodává

- Jednorázové balíčky návrhů hodnocení od AI jen pro **individuální Teacher Pro**
  s aktivním předplatným (stav `trialing` / `active`). Ne pro Free, Teacher,
  členy školních organizací, předplatné po splatnosti ani při pozastavení AI.
- Ceny (Syllonaut není plátce DPH; CZK je konečná cena):

  | Balíček | CZK | EUR | USD |
  | --- | --- | --- | --- |
  | 60 návrhů | 99 Kč | €3.99 | $4.49 |
  | 100 návrhů | 149 Kč | €5.99 | $6.49 |
  | 200 návrhů | 279 Kč | €11.49 | $12.49 |

  EUR a USD jdou stejně jako předplatné přes **Stripe Managed Payments**
  (Stripe jako merchant of record); daň se podle nastavení cen Teacher Pro může
  připočíst navíc. Doklad u CZK vystaví Stripe (faktura s `invoice_creation`),
  u EUR/USD Stripe jako merchant of record.
- Platnost 12 měsíců od potvrzení platby, i přes hranice období tarifu.
- Pořadí čerpání: nejdřív limit tarifu Teacher Pro, pak dokoupené návrhy,
  z balíčků nejdřív ten, který dřív vyprší. Neúspěšný návrh se vrací.
- Po skončení Teacher Pro se nevyčerpané návrhy zmrazí do obnovení Teacher Pro,
  nejdéle do konce platnosti. Za zmrazené ani propadlé návrhy se nevrací cena.
- Refund platby balíčku: nevyčerpané návrhy balíčku zanikají, AI se nepozastaví.
  Spor (chargeback): návrhy zanikají a zároveň se použije stávající pozastavení
  AI funkcí (čl. 6 VOP) do vyřešení sporu.

## Navržené znění (VOP 1.12, nový článek 5a)

Zdroj pravdy je `TERMS_AI_GRADING_TOPUP_CLAUSE` v `lib/terms-content.ts`
(CS i EN). Článek je vložený jako **5a** mezi články 5 a 6, aby se nemusela
přečíslovat ustanovení 6–14 a odkazy na ně. Souhlasy u objednávky jsou v
`AI_GRADING_TOPUP_CONSENT` (tamtéž):

1. „Souhlasím s obchodními podmínkami včetně článku o balíčcích návrhů.“
2. „Výslovně žádám o okamžité zpřístupnění dokoupených návrhů hodnocení od AI
   hned po zaplacení.“
3. „Beru na vědomí, že okamžitým zpřístupněním ztrácím právo od nákupu balíčku
   odstoupit.“

Před přesměrováním do Stripe se uloží neměnný snímek smlouvy
(`private.ai_grading_topup_contract_snapshots`): poskytovatel, předmět, cena,
měna, fakturační země, platnost, pořadí čerpání, podmínka Teacher Pro, oba
souhlasy, refund a spor, verze VOP a celé znění VOP 1.12. Formulář pro
odstoupení se nepřikládá (viz otázka 1).

## Otázky pro právníka

1. **Digitální obsah, nebo digitální služba?** Balíček je předplacené oprávnění
   k budoucím AI operacím. Lze ho posoudit jako digitální obsah nedodávaný na
   hmotném nosiči (zánik práva na odstoupení podle § 1837 písm. l) OZ po
   výslovné žádosti a potvrzení na trvalém nosiči), nebo jde o službu, kde by se
   použil režim poměrné úhrady jako u předplatného (čl. 7 VOP)?
2. **Propadnutí a zmrazení.** Je přiměřené, že nevyčerpané návrhy po 12 měsících
   bez náhrady propadnou a že se po skončení Teacher Pro zmrazí bez vrácení ceny?
   Potřebuje spotřebitel výslovné upozornění i v Ceníku (nyní je tam cena,
   platnost a „čerpá se po limitu tarifu“)?
3. **Managed Payments (EUR/USD).** Stripe je u těchto plateb merchant of record.
   Odpovídá formulace „platební zprostředkovatel může připočíst daň“ a smluvní
   vztah (Syllonaut vs. Stripe) požadavkům na předsmluvní informace? Navazuje na
   LEGAL-019 (DPH/OSS).
4. **Refund a spor.** Je v pořádku, že refund i spor ruší zbytek balíčku a spor
   navíc dočasně pozastaví AI funkce účtu (stávající čl. 6)?
5. **Nový souhlas.** Stačí VOP 1.12 odsouhlasit při prvním nákupu balíčku, nebo
   je potřeba nový souhlas všech uživatelů? Návrh: stávající souhlasy v4–v12
   zůstanou dostatečné pro běžné používání (článek 5a se týká jen nového
   dobrovolného nákupu).

## Aktivace po posouzení

1. `lib/legal.ts`: `TERMS_AI_GRADING_TOPUP_ARTICLE_ACTIVE = true`,
   `TERMS_VERSION = '1.12'`, nové `TERMS_EFFECTIVE_DATE` a
   `TERMS_ACCEPTANCE_KEY = '<datum>-v13'`, klíč `2026-09-24-v12` ponechat v
   `TERMS_PRODUCT_ACCESS_KEYS`; upravit pevné datum účinnosti v EN textu
   `app/terms/page.tsx` a ve snímku (`lib/individual-contract-snapshot.ts`),
   rozšířit `scripts/verify-terms.mjs` o verzi 1.12.
2. LIVE ceny: `scripts/create-ai-grading-topup-prices.mjs --mode live --confirm-live`.
3. Stripe event destination (LIVE i sandbox): přidat `checkout.session.completed`
   a `checkout.session.async_payment_succeeded`.
4. Vercel Production: `AI_GRADING_TOPUPS_ENABLED=true`.
5. Resend: doplnit blok s balíčky do šablony „Grading quota reached“ (Cowork).
