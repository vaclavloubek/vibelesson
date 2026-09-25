import { AI_GRADING_ALLOWANCES, INDIVIDUAL_PLAN_ALLOWANCES, pricingPagePrice } from '@/lib/individual-billing-catalog';
import { ORGANIZATION_PLANS } from '@/lib/organization-billing-catalog';
import { SYLLONAUT_GUIDE_STEPS } from '@/lib/onboarding-guide-steps';
import { PROVIDER_CONTACT } from '@/lib/provider-contact';
import { HELP_GUIDE_ACTIONS, type HelpGuideAction } from '@/lib/help/actions';

// Knowledge base for Syllonaut Help. Plan numbers come from the billing
// catalogs and guide step titles from the guide itself, so answers cannot
// drift from the Pricing page or the guide.

// Czech facts, verbatim from the approved knowledge base
// (outputs/napoveda-znalostni-baze.md, approved 25. 9. 2026) without the
// "Zdroj" notes, which are for review only.
const RULES_CS = `
Pevná pravidla k tarifům a limitům:

- Obnova limitu: Teacher a Teacher Pro podle fakturačního cyklu (u ročního předplatného po měsících od data nákupu); Free, Team, School a Campus podle kalendářního měsíce. Přesné datum je v KONTEXTU UŽIVATELE.
- Co čerpá limit: nová AI lekce a AI úprava (celé lekce i jedné aktivity). Nečerpá: spuštění hotové lekce v placených tarifech, připojení studentů, ruční úprava aktivity.
- Školní tarify: limit je společný pro celou organizaci; veřejně je zatím nelze koupit online, učitelé je dostanou pozváním školy.
- Zařízení u placených účtů: Teacher a Teacher Pro nejvýš 3 aktivní zařízení a 5 nově přidaných za 30 dní; Team, School a Campus 5 a 10 na učitele. Starší zařízení jde odebrat v Předplatném, u školních účtů ve správě školy. Studenti se nepočítají.
- Zakázané formulace: „bez omezení“, „neomezeně“.
`;

const FACTS_CS = `
## Lekce: tvorba a úpravy

Každá položka = fakta pro model, ne hotová odpověď. Model z nich složí odpověď podle pravidel hlasu.

L1 · Jak vytvořit lekci. Tlačítko „Nová lekce“ v hlavičce. Do formuláře učitel popíše, co chce učit, a nastaví jazyk, cílovou skupinu, délku (výchozích 45 min), velikost týmu a volitelně tón. Podklady jsou volitelné: PDF, PPTX, DOCX, TXT nebo MD, nejvýš 5 souborů a dohromady 10 MB; text se z nich vytáhne v prohlížeči. AI připraví návrh lekce, který je třeba před výukou projít; aplikace to v editoru připomíná. Nová lekce čerpá jednu AI lekci z limitu. · Akce: [[guide:lesson:0]]

L2 · Úprava celé lekce. V editoru uložené lekce je část „Uprav celou lekci“. Učitel napíše pokyn běžnou řečí, např. „zkrátit na 45 minut“ nebo „více týmové práce“, a klikne na „Upravit celou lekci“. Čerpá jednu AI úpravu. · Akce: [[guide:lesson:3]]

L3 · Úprava jedné aktivity. Klepnutím na aktivitu („Upravit blok“) se otevře její úprava se dvěma záložkami. „Upravit s AI“: pokyn a tlačítko „Upravit jen tuto aktivitu“, zbytek lekce zůstane beze změny, čerpá jednu AI úpravu. „Upravit ručně“: texty, položky, možnosti a minutáž (1–60 min) bez AI a bez čerpání limitu, uložení tlačítkem „Uložit změny“. Ručně nejde měnit správnou odpověď, body, typ aktivity ani počet možností; to umí jen úprava s AI. Ruční úprava funguje i při platební pauze AI. Poslední změnu vrátí „↶ Vrátit poslední změnu“. Celou lekci ručně skládat nejde. · Akce: [[guide:lesson:4]]

L4 · Jazyk lekce. Placené tarify vytvoří lekci v libovolném jazyce (volba „Jazyk lekce“, případně „Jiný jazyk…“). Ve Free se lekce vytvoří v jazyce rozhraní a hlavní jazyk nejde změnit ani úpravou; cizí jazyk jako učivo (slovíčka, dialogy, překladové úlohy) je povolený. · Akce: [[link:pricing]] pro Free

L5 · Vzorová odpověď a osnova. Při tvorbě lekce AI připraví u psaných a řazených aktivit vzorovou odpověď jen pro učitele („Vzorová odpověď (vytvořila AI)“) a u psaných aktivit osnovu, která studentovi pomůže začít psát. Student vzorovou odpověď během hodiny nevidí. Nezměněnou osnovu nejde odevzdat.

L6 · Pracovní listy. Tlačítko „Pracovní list“ u lekce otevře tisk a PDF: studentskou verzi a „Klíč pro učitele“ se vzorovými odpověďmi. Součástí tarifů Teacher Pro, School a Campus. · Akce: [[link:pricing]] bez nároku

L7 · Složky. Složky a podsložky v „Moje lekce“ mají Teacher Pro, School a Campus.

L8 · Sdílení s kolegy. „Sdílet s kolegy“ vytvoří odkaz na lekci. Kolega si lekci přebere k sobě; ve Free se to počítá do 2 importů nebo kopií měsíčně.

L9 · Archivované lekce ve Free. Lekci, která už byla živě použitá, lze dál upravovat ručně i pomocí AI (AI úpravy v rámci limitu), ale znovu spustit ji nejde. · Akce: [[link:pricing]]

L10 · Mimo rozsah. „Napiš mi kvíz o fotosyntéze“, „přelož aktivitu“: Nápověda obsah netvoří. Odpověď ukáže „Nová lekce“ nebo úpravu s AI v editoru.

## Živá hodina

H1 · Jak otevřít hodinu. Na stránce lekce nebo přímo z „Moje lekce“ tlačítko „Otevřít hodinu pro studenty“. Otevře se Řídicí centrum s kódem a QR kódem; hodina ještě neběží, studenti se ale už mohou připojovat. Samotnou hodinu učitel spustí tlačítkem „Odstartovat hodinu“. · Akce: [[guide:lesson:6]]

H2 · Jak se připojí studenti. Na telefonu otevřou syllonaut.com/join a zadají sedmimístný kód hodiny, nebo načtou QR kód, případně otevřou odkaz, který učitel zkopíruje ikonou. Pak zadají zobrazované jméno. Plnohodnotný účet nepotřebují. Připojit se mohou i po startu hodiny, na všechny není nutné čekat. · Akce: [[guide:live:2]]

H3 · Prezentační režim a projektor. „Prezentační režim“ otevře samostatné okno bez učitelského ovládání. Učitel ho přetáhne na projektor nebo druhý displej a dá přes celou obrazovku; hodinu řídí dál v původním okně. · Akce: [[guide:live:0]]

H4 · Týmy. Pokud lekce obsahuje týmový úkol, učitel před startem nastaví počet týmů a vytvoří je; studenti si tým vyberou ve startovní zóně. Tým odevzdává jeden společný textový zápis. · Akce: [[guide:live:3]]

H5 · Řízení hodiny. Mezi aktivitami se přechází tlačítky „Předchozí“ a „Další“. Průběžné odpovědi a časovač zůstávají na učitelské obrazovce; časovač má ovládání přímo v panelu s odpočtem. U kvízu a hlasování učitel rozhodne, zda zveřejní výsledky; když přejde dál od nezveřejněného kvízu, aplikace se zeptá. · Akce: [[guide:live:5]]

H6 · Ukončení hodiny. „Ukončit hodinu“ a potvrzení. Tím se uzamkne vstup studentů a Syllonaut připraví vyhodnocení. · Akce: [[guide:live:6]]

H7 · Free: jedno živé použití. Ve Free lze každou lekci živě použít jednou. Použití se započítá už s prvním připojeným studentem, i s vlastním telefonem na zkoušku. Na vyzkoušení studentského pohledu slouží náhled „Studentský režim“ v editoru. Pak je lekce v archivu („První živé použití dokončeno“). Placené tarify spouštějí hotové lekce opakovaně bez čerpání AI limitu. · Akce: [[link:pricing]]

H8 · Spojení. Stav spojení se v Řídicím centru ukazuje jen při problému: „Synchronizuji…“ nebo „Záložní spojení – hodina běží dál“. V tu chvíli není nutné nic dělat, hodina pokračuje. Když student při odesílání ztratí spojení, aplikace ho vyzve odeslat odpověď znovu. Syllonaut potřebuje aktuální prohlížeč se zapnutým JavaScriptem a cookies a připojení k internetu (stránka Technické požadavky). · Akce: při trvajícím problému [[link:contact]]

## Vyhodnocení

V1 · Kde jsou výsledky. Po ukončení hodiny se pod potvrzením automaticky načte vyhodnocení: účast, odpovědi a výsledky jednotlivých aktivit. Odpovědi jdou stáhnout jako CSV. Starší hodiny jsou u lekce v „Moje lekce“ („Hodina z této lekce“). · Akce: [[guide:evaluation:1]]

V2 · Bodování kvízů. Kvízy se bodují automaticky podle správné odpovědi, ve všech tarifech. Otevřené a týmové odpovědi hodnotí učitel ručně; AI návrhy bodování mají Teacher Pro, School a Campus.

V3 · Body od AI a potvrzení. AI navrhne body k otevřeným, týmovým a závěrečným (exit ticket) odpovědím podle kritérií aktivity. Do skóre a pořadí se započítají až po potvrzení učitelem; do té doby učitel vidí „AI návrh“. Návrhy jde potvrdit jednotlivě, upravit, nebo hromadně tlačítkem „Potvrdit všechny návrhy AI“ v panelu žebříčku. Nebodovaná aktivita se AI nehodnotí. · Akce: [[guide:evaluation:0]]

V4 · Upozornění na možné využití AI. Syllonaut může u odpovědi upozornit na možné využití AI, např. podle stop kopírování z AI chatu v odevzdaném textu. Je to signál ke kontrole, ne důkaz, a body nikdy sám nemění. Hromadné potvrzení takové odpovědi přeskočí (tlačítko se pak jmenuje „Potvrdit návrhy AI bez podezření“), učitel je projde jednotlivě. Student signál nikdy nevidí.

V5 · Co vidí student. Po potvrzení učitelem vidí student body u aktivního úkolu a na konci hodiny přehled „Moje hodnocení“. Když učitel potvrdil návrh beze změny, vidí i souhrn AI označený „Souhrn AI hodnocení, potvrzený učitelem“. Poznámku uvidí jen tehdy, když ji učitel napsal jako „Poznámka pro studenta (volitelná, student ji uvidí)“.

V6 · PDF „Moje řešení“. Po ukončení hodiny si student na závěrečné obrazovce stáhne „Stáhnout moje řešení (PDF)“: zadání, svou odpověď, správné odpovědi kvízů, vzorové odpovědi od AI a potvrzená hodnocení. Učitel to nemusí nijak povolovat; PDF se nikam neukládá.

V7 · Limit AI návrhů bodování. Teacher Pro má {AI_GRADING_ALLOWANCES.teacher_pro} návrhů za období, School a Campus společně za měsíc (viz Tarify). Když dojdou, odpovědi zůstanou k ručnímu hodnocení. Zbývající počet je v KONTEXTU UŽIVATELE.

## Účet, předplatné a platby

U1 · Kolik mi zbývá. Odpověď bere čísla a datum obnovy z KONTEXTU UŽIVATELE. Stejné údaje učitel najde v nabídce účtu v hlavičce aplikace.

U2 · Došel mi limit. Uvést datum obnovy z kontextu. Do té doby funguje ruční úprava aktivity a v placených tarifech opakované spouštění hotových lekcí. Vyšší tarif zmínit jednou větou, bez nátlaku. U školních tarifů je limit společný pro celou organizaci. · Akce: [[link:pricing]]

U3 · AI nejde kvůli platbě. Při nezaplacené obnově, reklamaci platby nebo plném vrácení platby jsou AI funkce dočasně pozastavené. Uložené lekce a živá výuka zůstávají dostupné. Po potvrzení platby Stripem se AI odemkne automaticky. U školního tarifu platbu řeší správce školy. Nápověda s AI je v té době také pozastavená, takže se tahle odpověď zobrazuje jako pevný text, ne od AI. · Akce: [[link:subscription]]

U4 · Změna tarifu, faktury, zrušení. Stránka Předplatné: tarif a fakturační období se mění v Syllonautu; platební metodu, fakturační údaje, historii faktur a zrušení ke konci období řeší zákaznický portál Stripe. Po zrušení zůstávají uložené lekce. · Akce: [[link:subscription]]

U5 · Nákup a měna. Teacher a Teacher Pro jdou koupit na Ceníku, měsíčně nebo ročně. Měnu určuje fakturační země: Česko CZK, eurozóna EUR, ostatní USD. Konečnou cenu učitel vidí před zaplacením. Školní tarify se zatím online koupit nedají. · Akce: [[link:pricing]]

U6 · Odstoupení od smlouvy. Na stránce Odstoupení (po přihlášení) nebo v Předplatném tlačítko „Odstoupit od smlouvy online“. Přijetí Syllonaut potvrdí textově. Podmínky a lhůtu chatbot nevykládá, odkáže na VOP. · Akce: [[link:withdrawal]]

U7 · Reklamace. Stránka Reklamace (po přihlášení): jméno, e-mail, oblast, popis vady a požadovaný způsob vyřízení. Potvrzení s číslem reklamace a termínem vyřízení přijde e-mailem. · Akce: [[link:complaint]]

U8 · Smazání účtu. Aplikace nemá samoobslužné smazání. Žádost se pošle e-mailem z adresy účtu na vaclav@syllonaut.com. Před smazáním Syllonaut sám ukončí automatické obnovení předplatného a smazání potvrdí e-mailem. · Akce: [[link:contact]]

U9 · Zařízení. Placené funkce včetně spouštění lekcí jdou jen na důvěryhodných zařízeních (limity viz Tarify). Starší zařízení učitel odebere v Předplatném, u školních účtů ve správě školy. · Akce: [[link:subscription]]

U10 · Školní účet. Učitel se k škole přidá přes pozvánku; tarif, členy, zařízení a platby řídí správce školy ve správě školy. Na otázky k licenci nebo platbě školy chatbot odkazuje na správce.

U11 · Kontakt. E-mail vaclav@syllonaut.com, telefon +420 733 377 199. Chatbot neslíbí termín odpovědi. · Akce: [[link:contact]]
`;

// English knowledge base: a translation of the Czech one with the same facts.
// Button labels are the English halves of ui('cs', 'en') in the code.
const RULES_EN = `
Fixed rules for plans and allowances:

- Allowance renewal: Teacher and Teacher Pro follow the billing cycle (for an annual subscription, monthly from the purchase date); Free, Team, School and Campus follow the calendar month. The exact date is in the USER CONTEXT.
- What uses the allowance: a new AI lesson and an AI edit (of the whole lesson or of one activity). Not used: running a finished lesson on paid plans, students joining, manual activity editing.
- School plans: the allowance is shared by the whole organisation; they cannot be bought online yet, teachers get them through an invitation from their school.
- Devices on paid accounts: Teacher and Teacher Pro at most 3 active devices and 5 newly added within 30 days; Team, School and Campus 5 and 10 per teacher. An older device can be removed in Subscription, for school accounts in school administration. Students do not count.
- Forbidden wording: “unlimited”, “without limits”.
`;

const FACTS_EN = `
## Lessons: creating and editing

Each item is facts for the model, not a finished answer. Compose the answer from them according to the voice rules.

L1 · How to create a lesson. The “New lesson” button in the header. In the form the teacher describes what they want to teach and sets the language, audience, duration (45 min by default), team size and optionally the tone. Source materials are optional: PDF, PPTX, DOCX, TXT or MD, at most 5 files and 10 MB in total; the text is extracted in the browser. AI prepares a lesson draft that must be reviewed before teaching; the editor reminds the teacher of this. A new lesson uses one AI lesson from the allowance. · Action: [[guide:lesson:0]]

L2 · Editing the whole lesson. The editor of a saved lesson has a section “Edit the whole lesson”. The teacher writes an instruction in plain language, e.g. “shorten it to 45 minutes” or “add more teamwork”, and clicks “Edit whole lesson”. Uses one AI edit. · Action: [[guide:lesson:3]]

L3 · Editing one activity. Clicking an activity (“Edit block”) opens its editor with two tabs. “Edit with AI”: an instruction and the button “Edit this activity only”; the rest of the lesson stays unchanged; uses one AI edit. “Edit manually”: texts, items, options and timing (1–60 min) without AI and without using the allowance, saved with “Save changes”. The correct answer, points, activity type and number of options cannot be changed manually; only editing with AI can do that. Manual editing also works while AI is paused for payment. “↶ Undo last change” reverts the last change. A whole lesson cannot be assembled manually. · Action: [[guide:lesson:4]]

L4 · Lesson language. Paid plans create a lesson in any language (the “Lesson language” choice, or “Other language…”). On Free the lesson is created in the interface language and its main language cannot be changed, not even by editing; a foreign language as subject matter (vocabulary, dialogues, translation tasks) is allowed. · Action: [[link:pricing]] for Free

L5 · Model answer and outline. When creating a lesson, AI prepares a model answer for written and ordering activities, for the teacher only (“Model answer (written by AI)”), and for written activities an outline that helps the student start writing. Students do not see the model answer during the lesson. An unchanged outline cannot be submitted.

L6 · Worksheets. The “Worksheet” button on a lesson opens printing and PDF: a student version and a “Teacher key” with model answers. Included in Teacher Pro, School and Campus. · Action: [[link:pricing]] without the entitlement

L7 · Folders. Folders and subfolders in “My lessons” are available on Teacher Pro, School and Campus.

L8 · Sharing with colleagues. “Share with colleagues” creates a link to the lesson. A colleague takes the lesson over into their own account; on Free this counts towards the 2 imports or copies per month.

L9 · Archived lessons on Free. A lesson that has already been used live can still be edited manually and with AI (AI edits within the allowance), but it cannot be run again. · Action: [[link:pricing]]

L10 · Out of scope. “Write me a quiz about photosynthesis”, “translate this activity”: Help does not create content. The answer points to “New lesson” or to editing with AI in the editor.

## Live lesson

H1 · How to open a lesson. On the lesson page or directly from “My lessons”, the button “Open lesson for students”. The control centre opens with the join code and QR code; the lesson is not running yet, but students can already join. The teacher starts the lesson itself with “Start lesson”. · Action: [[guide:lesson:6]]

H2 · How students join. On their phones they open syllonaut.com/join and enter the seven-character lesson code, or scan the QR code, or open the link the teacher copies with the icon. Then they enter a display name. They do not need a full account. They can also join after the lesson has started; there is no need to wait for everyone. · Action: [[guide:live:2]]

H3 · Presenter mode and projector. “Presenter mode” opens a separate window without teacher controls. The teacher moves it to the projector or a second display and makes it full screen; the lesson is still controlled in the original window. · Action: [[guide:live:0]]

H4 · Teams. If the lesson contains a team task, the teacher sets the number of teams before the start and creates them; students choose a team in the lobby. A team submits one shared written answer. · Action: [[guide:live:3]]

H5 · Running the lesson. Move between activities with “Previous” and “Next”. Live responses and the timer stay on the teacher screen; the timer controls are right in the countdown panel. For a quiz and a poll the teacher decides whether to reveal the results; when moving on from an unrevealed quiz, the app asks. · Action: [[guide:live:5]]

H6 · Ending the lesson. “End lesson” and confirm. This closes student access and Syllonaut prepares the evaluation. · Action: [[guide:live:6]]

H7 · Free: one live use. On Free each lesson can be used live once. The use counts from the first joined student, including the teacher's own phone used as a test. To try the student view, use the “Student view” preview in the editor. Afterwards the lesson is archived (“First live use completed”). Paid plans run finished lessons repeatedly without using the AI allowance. · Action: [[link:pricing]]

H8 · Connection. The control centre shows the connection status only when there is a problem: “Synchronizing…” or “Backup connection – the lesson continues”. Nothing needs to be done then; the lesson continues. If a student loses the connection while submitting, the app asks them to submit the answer again. Syllonaut needs an up-to-date browser with JavaScript and cookies enabled and an internet connection (Technical requirements page). · Action: [[link:contact]] if the problem persists

## Evaluation

V1 · Where the results are. After the lesson ends, the evaluation loads automatically below the confirmation: participation, responses and results of each activity. Responses can be downloaded as CSV. Older lessons are listed with the lesson in “My lessons” (“Live run of this lesson”). · Action: [[guide:evaluation:1]]

V2 · Scoring quizzes. Quizzes are scored automatically against the correct answer, on all plans. Open and team answers are graded by the teacher manually; AI grading suggestions are available on Teacher Pro, School and Campus.

V3 · AI points and confirmation. AI suggests points for open, team and exit ticket answers according to the activity criteria. They count towards the score and ranking only after the teacher confirms them; until then the teacher sees “AI suggestion”. Suggestions can be confirmed one by one, adjusted, or confirmed together with “Confirm all AI suggestions” in the scoreboard panel. An unscored activity is not assessed by AI. · Action: [[guide:evaluation:0]]

V4 · Notice of possible AI use. Syllonaut may flag an answer for possible AI use, e.g. traces of copying from an AI chat in the submitted text. It is a signal to check, not proof, and it never changes points by itself. Bulk confirmation skips such answers (the button is then called “Confirm AI suggestions without suspicion”), and the teacher reviews them one by one. Students never see the signal.

V5 · What the student sees. After the teacher confirms, the student sees the points on the active task and, at the end of the lesson, the “My evaluations” overview. If the teacher confirmed a suggestion unchanged, the student also sees the AI summary labelled “AI evaluation summary, confirmed by the teacher”. The student sees a note only if the teacher wrote it as “Note for the student (optional, the student will see it)”.

V6 · “My solutions” PDF. After the lesson ends, the student can download “Download my solutions (PDF)” on the final screen: the task, their own answer, the correct quiz answers, the AI model answers and the confirmed evaluations. The teacher does not have to enable anything; the PDF is not stored anywhere.

V7 · AI grading suggestion allowance. Teacher Pro has a fixed number of suggestions per period, School and Campus share theirs per month (see Plans). When they run out, answers stay for manual grading. The remaining number is in the USER CONTEXT.

## Account, subscription and payments

U1 · How much is left. The answer takes the numbers and the renewal date from the USER CONTEXT. The teacher finds the same data in the account menu in the app header.

U2 · The allowance ran out. Give the renewal date from the context. Until then manual activity editing works, and on paid plans finished lessons can be run again. Mention a higher plan in one sentence, without pressure. On school plans the allowance is shared by the whole organisation. · Action: [[link:pricing]]

U3 · AI does not work because of a payment. After an unpaid renewal, a payment dispute or a full refund, AI features are temporarily paused. Saved lessons and live teaching remain available. AI unlocks automatically once Stripe confirms the payment. On a school plan the school administrator resolves the payment. Help with AI is also paused during that time, so this answer is shown as fixed text, not by AI. · Action: [[link:subscription]]

U4 · Changing the plan, invoices, cancellation. The Subscription page: the plan and billing period are changed in Syllonaut; the payment method, billing details, invoice history and cancellation at the end of the period are handled in the Stripe customer portal. Saved lessons remain after cancellation. · Action: [[link:subscription]]

U5 · Buying and currency. Teacher and Teacher Pro can be bought on the Pricing page, monthly or annually. The currency depends on the billing country: Czech Republic CZK, euro area EUR, elsewhere USD. The teacher sees the final price before paying. School plans cannot be bought online yet. · Action: [[link:pricing]]

U6 · Withdrawal from the contract. On the Withdrawal page (after signing in) or in Subscription, the button “Withdraw from contract online”. Syllonaut confirms receipt in writing. Help does not interpret the conditions or the deadline; it refers to the Terms. · Action: [[link:withdrawal]]

U7 · Complaints. The Complaint page (after signing in): name, email, area, description of the defect and the requested resolution. A confirmation with the complaint number and the resolution deadline arrives by email. · Action: [[link:complaint]]

U8 · Deleting the account. The app has no self-service deletion. The request is sent by email from the account address to vaclav@syllonaut.com. Before deletion, Syllonaut itself stops automatic subscription renewal and confirms the deletion by email. · Action: [[link:contact]]

U9 · Devices. Paid features, including running lessons, work only on trusted devices (limits in Plans). The teacher removes an older device in Subscription, for school accounts in school administration. · Action: [[link:subscription]]

U10 · School account. A teacher joins a school through an invitation; the plan, members, devices and payments are managed by the school administrator in school administration. Questions about the school licence or payment are referred to the administrator.

U11 · Contact. Email vaclav@syllonaut.com, phone +420 733 377 199. Help does not promise a response time. · Action: [[link:contact]]
`;

// Free is not in a billing catalog; these numbers match the Pricing page
// (teacherPlansCs in components/PricingPage.tsx) and billing_plans.free.
const FREE_PLAN = { lessonGenerations: 3, aiEdits: 10, imports: 2 };

function czk(value: number) {
  return value.toLocaleString('cs-CZ').replace(/ /g, ' ');
}

function plansSection(locale: 'cs' | 'en') {
  const teacher = INDIVIDUAL_PLAN_ALLOWANCES.teacher;
  const pro = INDIVIDUAL_PLAN_ALLOWANCES.teacher_pro;
  const { team, school, campus } = ORGANIZATION_PLANS;
  const teacherPrice = pricingPagePrice('teacher');
  const proPrice = pricingPagePrice('teacher_pro');

  if (locale === 'en') {
    return `## Plans and allowances

AI lessons / AI edits per month:
- Free: ${FREE_PLAN.lessonGenerations} AI lessons, ${FREE_PLAN.aiEdits} AI edits; ${FREE_PLAN.imports} imports or copies of lessons; each lesson can be used live once; lessons in the interface language.
- Teacher: ${teacher.lessonGenerations} AI lessons, ${teacher.aiEdits} AI edits; lessons in any language; finished lessons can be run again without using the AI allowance.
- Teacher Pro: ${pro.lessonGenerations} AI lessons, ${pro.aiEdits} AI edits; everything in Teacher plus worksheets (print and PDF), ${AI_GRADING_ALLOWANCES.teacher_pro} AI grading suggestions for teacher confirmation per period, notices of possible AI use, folders and subfolders.
- Team: ${team.monthlyLessonLimit} AI lessons and ${team.monthlyRevisionLimit} AI edits shared; up to ${team.seatLimit} teachers; lessons in any language.
- School: ${school.monthlyLessonLimit} AI lessons and ${school.monthlyRevisionLimit} AI edits shared; up to ${school.seatLimit} teachers; like Teacher Pro plus ${AI_GRADING_ALLOWANCES.school} AI grading suggestions, a shared library and a licence lock for school lessons.
- Campus: ${campus.monthlyLessonLimit} AI lessons and ${campus.monthlyRevisionLimit} AI edits shared; up to ${campus.seatLimit} teachers; like School plus ${AI_GRADING_ALLOWANCES.campus} AI grading suggestions.

Prices per month / per year in CZK: Teacher ${czk(teacherPrice.monthlyCzk)} / ${czk(teacherPrice.annualCzk)}, Teacher Pro ${czk(proPrice.monthlyCzk)} / ${czk(proPrice.annualCzk)}, Team ${czk(team.prices.monthly.czk)} / ${czk(team.prices.annual.czk)}, School ${czk(school.prices.monthly.czk)} / ${czk(school.prices.annual.czk)}, Campus ${czk(campus.prices.monthly.czk)} / ${czk(campus.prices.annual.czk)}. Do not state prices in EUR or USD; refer to the Pricing page, because they depend on the billing country.

${RULES_EN.trim()}`;
  }

  return `## Tarify a limity

AI lekce / AI úpravy za měsíc:
- Free: ${FREE_PLAN.lessonGenerations} AI lekce, ${FREE_PLAN.aiEdits} AI úprav; ${FREE_PLAN.imports} importy nebo kopie lekcí; každou lekci lze živě použít jednou; lekce v jazyce rozhraní.
- Teacher: ${teacher.lessonGenerations} AI lekcí, ${teacher.aiEdits} AI úprav; lekce v libovolném jazyce; opakované spouštění hotových lekcí bez čerpání AI limitu.
- Teacher Pro: ${pro.lessonGenerations} AI lekcí, ${pro.aiEdits} AI úprav; vše z Teacher a navíc pracovní listy (tisk a PDF), ${AI_GRADING_ALLOWANCES.teacher_pro} AI návrhů bodování k potvrzení za období, upozornění na možné využití AI, složky a podsložky.
- Team: ${team.monthlyLessonLimit} AI lekcí a ${team.monthlyRevisionLimit} AI úprav společně; až ${team.seatLimit} učitelů; lekce v libovolném jazyce.
- School: ${school.monthlyLessonLimit} AI lekcí a ${school.monthlyRevisionLimit} AI úprav společně; až ${school.seatLimit} učitelů; jako Teacher Pro a navíc ${AI_GRADING_ALLOWANCES.school} AI návrhů bodování, sdílená knihovna, licenční zámek školních lekcí.
- Campus: ${campus.monthlyLessonLimit} AI lekcí a ${campus.monthlyRevisionLimit} AI úprav společně; až ${campus.seatLimit} učitelů; jako School a navíc ${AI_GRADING_ALLOWANCES.campus} AI návrhů bodování.

Ceny měsíčně / ročně v Kč: Teacher ${czk(teacherPrice.monthlyCzk)} / ${czk(teacherPrice.annualCzk)}, Teacher Pro ${czk(proPrice.monthlyCzk)} / ${czk(proPrice.annualCzk)}, Team ${czk(team.prices.monthly.czk)} / ${czk(team.prices.annual.czk)}, School ${czk(school.prices.monthly.czk)} / ${czk(school.prices.annual.czk)}, Campus ${czk(campus.prices.monthly.czk)} / ${czk(campus.prices.annual.czk)}. Ceny v EUR a USD neuváděj a odkaž na Ceník, protože závisí na fakturační zemi.

${RULES_CS.trim()}`;
}

// Where each guide step can run, as in the approved action table.
const GUIDE_STEP_PLACE: Record<HelpGuideAction, { cs: string; en: string }> = {
  'lesson:0': { cs: 'nová lekce', en: 'new lesson' },
  'lesson:2': { cs: 'editor lekce', en: 'lesson editor' },
  'lesson:3': { cs: 'editor lekce', en: 'lesson editor' },
  'lesson:4': { cs: 'editor lekce', en: 'lesson editor' },
  'lesson:6': { cs: 'editor lekce', en: 'lesson editor' },
  'live:0': { cs: 'Řídicí centrum', en: 'control centre' },
  'live:2': { cs: 'Řídicí centrum', en: 'control centre' },
  'live:3': { cs: 'Řídicí centrum před startem', en: 'control centre before the start' },
  'live:5': { cs: 'běžící hodina', en: 'running lesson' },
  'live:6': { cs: 'běžící hodina', en: 'running lesson' },
  'evaluation:0': { cs: 'ukončená hodina', en: 'ended lesson' },
  'evaluation:1': { cs: 'ukončená hodina', en: 'ended lesson' },
};

function actionsSection(locale: 'cs' | 'en') {
  const guideLines = HELP_GUIDE_ACTIONS.map((action) => {
    const [chapter, step] = action.split(':') as [keyof typeof SYLLONAUT_GUIDE_STEPS, string];
    const guideStep = SYLLONAUT_GUIDE_STEPS[chapter][Number(step)];
    const place = GUIDE_STEP_PLACE[action][locale];
    return locale === 'en'
      ? `- [[guide:${action}]] = guide step “${guideStep.title.en}” (works on: ${place})`
      : `- [[guide:${action}]] = krok Průvodce „${guideStep.title.cs}“ (funguje na stránce: ${place})`;
  });
  const linkLines = locale === 'en'
    ? [
        '- [[link:pricing]] = Pricing page',
        '- [[link:subscription]] = Subscription page',
        '- [[link:complaint]] = Complaint page',
        '- [[link:withdrawal]] = Withdrawal page',
        `- [[link:contact]] = email to ${PROVIDER_CONTACT.email}`,
      ]
    : [
        '- [[link:pricing]] = stránka Ceník',
        '- [[link:subscription]] = stránka Předplatné',
        '- [[link:complaint]] = stránka Reklamace',
        '- [[link:withdrawal]] = stránka Odstoupení',
        `- [[link:contact]] = e-mail na ${PROVIDER_CONTACT.email}`,
      ];
  const heading = locale === 'en' ? '## Actions' : '## Akce';
  return [heading, ...guideLines, ...linkLines].join('\n');
}

export function buildHelpKnowledge(locale: 'cs' | 'en') {
  return [
    plansSection(locale),
    (locale === 'en' ? FACTS_EN : FACTS_CS).trim(),
    actionsSection(locale),
  ].join('\n\n');
}
