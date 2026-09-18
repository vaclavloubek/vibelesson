# Syllonaut — GA4 a produktová analytika

Aktualizováno: 2026-09-18

Tento dokument je zdroj pravdy pro produktovou eventovou taxonomii GA4. `PROJECT.md` zůstává samostatným zdrojem pravdy pro produkt a architekturu.

## 1. Cíl

Analytika má měřit čtyři vrstvy produktu:

**acquisition → activation → classroom use → retention / premium engagement**

Není určena pro technické telemetry, debugging backendu ani sledování obsahu výuky.

## 2. Privacy-by-design

GA4 se načítá pouze po explicitním souhlasu s analytickými cookies. Bez souhlasu se Google Analytics script nenačítá a `trackEvent()` je no-op.

Centrální implementace je v:

- `lib/analytics.ts`
- `components/CookieConsent.tsx`
- `scripts/verify-analytics.mjs`
- `scripts/verify-privacy.mjs`

V GA4 se nikdy neposílají:

| Zakázaná kategorie | Příklady |
| --- | --- |
| Identita učitele | e-mail, jméno, user ID, UUID |
| Identita studenta | jméno, display name, participant ID/token |
| Identifikátory obsahu | lesson ID, session ID, block ID |
| Obsah výuky | lesson title, zadání, instrukce, teacher notes |
| AI obsah | prompt, response, grading rationale |
| Studentský obsah | odpověď, týmový výstup, ranking text |
| Nahrané podklady | filename, text/obsah souboru |
| Bezpečnostní data | auth token, participant token, URL s tokenem |
| Neomezené chyby | raw error message/text |

Chyby se mapují pouze na nízkokardinalitní `failure_stage` a `error_code`.

`trackEvent()` používá runtime allowlist parametrů. Parametr, který není pro konkrétní event povolený v `EVENT_PARAMETER_KEYS`, se neodešle ani tehdy, pokud jej volající omylem přidá.

## 3. Page views a SPA navigace

Syllonaut používá GA4 Enhanced Measurement jako jediný zdroj SPA `page_view`.

Po souhlasu se `gtag('config', ...)` provede pouze jednou. Aplikace neposílá vlastní `page_view` při změně `pathname`. Tím se předchází dvojím page views při kombinaci s automatickým měřením změn browser history v GA4.

V produkčním Web streamu musí zůstat Enhanced Measurement → Page views → **Page changes based on browser history events** zapnuté.

## 4. Prostředí

Produkční Measurement ID se nastavuje pouze ve Vercel **Production**:

`NEXT_PUBLIC_GA_MEASUREMENT_ID=G-XXXXXXXXXX`

Preview má ve výchozím stavu proměnnou nenastavenou a analytika je no-op. Produkční data se tím nekontaminují Preview provozem.

Pro DebugView přes Preview se má použít samostatná **testovací GA4 property + Web stream**, nikoli druhý stream v produkční property. Testovací Preview může mít:

`NEXT_PUBLIC_GA_MEASUREMENT_ID=<testovací G-ID>`

`NEXT_PUBLIC_GA_DEBUG_MODE=true`

## 5. Event taxonomy

| Event | Kdy se spustí | Implementace | Povolené parametry | Účel |
| --- | --- | --- | --- | --- |
| `prepare_lesson_cta_click` | Kliknutí na CTA vedoucí do přípravy lekce | Landing, Pricing, mobile header | `location`: hero/header/pricing/other | Acquisition → creation intent |
| `pricing_view` | První načtení Pricing klienta | `PricingPage` | `segment`, `billing_period` | Výchozí Pricing kontext |
| `pricing_segment_change` | Uživatel skutečně změní učitel/škola | `PricingPage` | `segment` | Zájem o individuální vs. školní nabídku |
| `pricing_billing_period_change` | Uživatel změní měsíčně/ročně | `PricingPage` | `billing_period` | Citlivost na roční nabídku |
| `free_signup_click` | Kliknutí na Free signup CTA / auth signup | Pricing/Auth | `location` | Pricing/auth → registrace |
| `signup_started` | Otevření skutečného registračního flow | `AuthControls` | — | Začátek registrace |
| `signup_completed` | Účet je skutečně vytvořen; běžně až po úspěšném potvrzení e-mailu | `SignupCompletedAnalytics`, immediate-session fallback v Auth | — | Hlavní registrační konverze |
| `login_completed` | Úspěšný explicitní `signInWithPassword` | `AuthControls` | — | Aktivní návrat uživatele; ne refresh session |
| `lesson_creation_started` | První interakce se skutečným formulářem nové lekce | `LessonWorkspace` | — | Creation intent |
| `source_materials_added` | Uživatel odešle generování s podklady | `LessonWorkspace` | `file_count`, `file_type_group`, `size_bucket`, `material_mode` | Použití source materials bez filename/obsahu |
| `lesson_generation_started` | Validovaný požadavek jde do generování | `LessonWorkspace` | `has_materials`, `material_mode`, `duration_bucket`, `group_size_bucket` | Activation funnel start |
| `lesson_generation_completed` | Server vrátí validní uloženou lekci | `LessonWorkspace` | `has_materials`, `block_count_bucket`, `duration_bucket` | Hlavní activation event |
| `lesson_generation_failed` | Generování skončí chybou | `LessonWorkspace` | `failure_stage`, `error_code` | Funnel drop-off bez raw errorů |
| `lesson_revision_started` | Odeslán AI pokyn k úpravě | `LessonWorkspace` | `revision_scope` | AI revision engagement |
| `lesson_revision_completed` | AI revize se úspěšně vrátí a uloží | `LessonWorkspace` | `revision_scope` | AI revision value |
| `lesson_revision_failed` | AI revize selže | `LessonWorkspace` | `revision_scope`, `error_code` | Revision drop-off |
| `lesson_duplicated` | API úspěšně vytvoří kopii lekce | `LessonActions` | — | Library reuse |
| `folder_created` | Folder API úspěšně vytvoří složku/podsložku | `LessonLibrary` | — | Premium organization engagement |
| `lesson_moved_to_folder` | Jedna lekce se úspěšně přesune do složky | `LessonLibrary` | — | Folder utility |
| `bulk_lessons_moved` | Úspěšný přesun více lekcí | `LessonLibrary` | `item_count_bucket` | Advanced folder utility |
| `live_session_created` | Úspěšně vznikne session v lobby | `StartSessionButton` | — | Lesson → classroom intent |
| `live_session_started` | Učitel úspěšně odstartuje live session | `TeacherSession` | `block_count_bucket`, `planned_duration_bucket` | Hlavní product-value event |
| `presenter_opened` | Presenter poprvé úspěšně načte session | `PresenterMode` | `session_state` | Projekční režim usage |
| `activity_advanced` | Učitel úspěšně přejde tlačítkem Další | `TeacherSession` | `activity_type`, `activity_mode` | Použití typů aktivit v reálné výuce |
| `student_join_completed` | Join API úspěšně připojí studenta | `StudentJoinForm` | — | Classroom participation |
| `activity_response_submitted` | První smysluplné odevzdání dané aktivity v aktuálním klientovi | Student response / team response | `activity_type`, `activity_mode` | Student engagement bez obsahu |
| `live_session_ended` | Učitel úspěšně ukončí session | `TeacherSession` | `participant_count_bucket`, `completed_activity_count_bucket` | Completion classroom funnel |
| `session_report_viewed` | Hotový report se poprvé úspěšně načte | `SessionReport` | — | Post-session engagement |
| `session_csv_exported` | Učitel spustí lokální CSV export | `SessionReport` | — | Reporting utility |
| `ai_grading_completed` | AI hodnocení skutečně dokončí evaluaci | přímý `/grade` výsledek nebo pozorovaný přechod stavu ve `EvaluationReviewQueue` | `activity_type`, `result_state` | Teacher Pro AI grading usage |
| `manual_grading_completed` | První úspěšné ruční potvrzení manual-only evaluace | `EvaluationReviewQueue` | `activity_type` | Manual grading usage |
| `teacher_grade_override` | Učitel úspěšně změní AI skóre na jinou hodnotu | `EvaluationReviewQueue` | `activity_type` | Human override usage |

### Poznámka ke studentským odpovědím

`activity_response_submitted` není autosave telemetry.

- `open_text`, `exit_ticket`, `ranking`: event až po explicitním submitu.
- `team_task`: event až po explicitním submitu týmového výstupu.
- `poll` a `quiz`: první úspěšně uložená volba se považuje za submit.
- autosave konceptu, heartbeat, retry a Realtime invalidation event nevytvářejí.

## 6. Parametry a buckety

Nízkokardinalitní buckety jsou definované centrálně v `lib/analytics.ts`.

Důležitá zásada: přesné počty a přesné hodnoty se neposílají tam, kde pro produktovou analýzu stačí bucket. Výjimkou je `file_count`, který je už na úrovni produktu omezený maximálně na 5.

## 7. GA4 custom dimensions

Doporučený počáteční set event-scoped custom dimensions:

| Display name | Event parameter |
| --- | --- |
| CTA location | `location` |
| Pricing segment | `segment` |
| Billing period | `billing_period` |
| Activity type | `activity_type` |
| Activity mode | `activity_mode` |
| Revision scope | `revision_scope` |
| Has materials | `has_materials` |
| Material mode | `material_mode` |
| Duration bucket | `duration_bucket` |
| Block count bucket | `block_count_bucket` |
| Participant count bucket | `participant_count_bucket` |
| Failure stage | `failure_stage` |
| Error code | `error_code` |
| Session state | `session_state` |
| Grading result state | `result_state` |

Další buckety (`group_size_bucket`, `file_type_group`, `size_bucket`, `item_count_bucket`, `planned_duration_bucket`, `completed_activity_count_bucket`) jsou posílané jako nízkokardinalitní parametry, ale není nutné je registrovat jako custom dimensions hned v MVP. Přidat je až podle reálné reporting potřeby.

### Plan tier

`plan_tier` se zatím **neposílá**. Současný backend nemá autoritativní billing/provisioning plan tier; má pouze explicitní serverové entitlementy a kvóty. Odvozovat plán z UI, ceny nebo klientského stavu by bylo nepřesné. Parametr lze přidat až po zavedení server-authoritative plan modelu.

## 8. Key Events

V GA4 označit jako Key Events:

| Event | Důvod |
| --- | --- |
| `signup_completed` | skutečná registrace |
| `lesson_generation_completed` | activation |
| `live_session_started` | hlavní product-value moment |

## 9. Funnels

### Acquisition / activation

`Landing / page_view → prepare_lesson_cta_click → signup_completed → lesson_generation_completed → live_session_started`

Poznámka: strict opt-in znamená, že uživatelé bez analytického souhlasu nejsou v GA4 funnelu vůbec. GA4 funnel proto měří chování consenting populace, nikoli absolutní počet všech uživatelů.

### Engagement

`lesson_generation_completed → lesson_revision_completed → live_session_started → live_session_ended → session_report_viewed`

### Pricing

Do zavedení billing/checkoutu se sleduje pouze `pricing_view`, změna segmentu/fakturace a `free_signup_click`.

Až bude billing implementovaný, mají se použít standardní GA4 ecommerce eventy, zejména `purchase`, místo vlastních náhražek.

## 10. Eventy, které se záměrně neposílají

Analytika nevytváří event pro autosave, heartbeat, Realtime invalidation, timer tick, změnu textového pole, render, background polling ani network retry.

## 11. DebugView a QA

Výchozí Preview nemá GA Measurement ID.

Pro čisté E2E testování přes Preview:

1. použít samostatnou testovací GA4 property;
2. vytvořit její vlastní Web stream;
3. nastavit jeho Measurement ID pouze do Preview environment;
4. nastavit `NEXT_PUBLIC_GA_DEBUG_MODE=true`;
5. udělit analytický souhlas v testovacím browseru;
6. ověřit eventy v DebugView a Realtime;
7. po testu Preview GA env odstranit.

Produkční property se tím nekontaminuje Preview provozem.

## 12. Automatické regression checks

`npm run check` obsahuje:

`tsc --noEmit → verify-ai-zdr → verify-age-appropriateness → verify-privacy → verify-live-resilience → verify-analytics`

Analytics check hlídá zejména:

- centrální `trackEvent()`;
- consent gating;
- no-op bez Measurement ID;
- zákaz reklamních signálů;
- absenci manuální SPA `page_path` logiky;
- zákaz přímých custom `gtag('event')` mimo helper;
- runtime parametr allowlist;
- nejrizikovější PII/ID/token parametry.
