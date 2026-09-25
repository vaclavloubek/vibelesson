import { createHash } from 'node:crypto';
import {
  TERMS_ACCEPTANCE_KEY,
  TERMS_AI_GRADING_TOPUP_ARTICLE_ACTIVE,
  TERMS_EFFECTIVE_DATE,
  TERMS_VERSION,
} from '@/lib/legal';
import { PROVIDER_CONTACT } from '@/lib/provider-contact';
import { TECHNICAL_REQUIREMENTS } from '@/lib/technical-requirements';
import {
  TERMS_ACCOUNT_DELETION_CLAUSE,
  TERMS_ACCOUNT_ELIGIBILITY_CLAUSE,
  TERMS_AI_GRADING_TOPUP_CLAUSE,
  TERMS_AI_SCORING_PURPOSE_CLAUSE,
  TERMS_ONLINE_WITHDRAWAL_NOTICE,
  TERMS_COMPLAINT_CLAUSE,
  TERMS_DPA_SCOPE_CLAUSE,
  TERMS_PLAN_PRICING_CLAUSE,
  TERMS_SERVICE_CHANGE_CLAUSE,
  TERMS_TECHNICAL_REQUIREMENTS_CLAUSE,
  TERMS_WITHDRAWAL_CLAUSE,
} from '@/lib/terms-content';
import { buildStatutoryWithdrawalFormHtml, WITHDRAWAL_FORM_COPY } from '@/lib/withdrawal-form';
import type { BillingPeriod, IndividualPlanCode } from '@/lib/subscription-change-policy';
import type { IndividualBillingCurrency } from '@/lib/individual-billing-catalog';
import {
  AI_GRADING_TOPUP_VALIDITY_MONTHS,
  aiGradingTopupQuantity,
  type AiGradingTopupPackCode,
} from '@/lib/ai-grading-topup-catalog';
import { AI_GRADING_TOPUP_CONSENT } from '@/lib/terms-content';

export type IndividualContractLocale = 'cs' | 'en';

export type IndividualContractSnapshotDocuments = {
  contractHtml: string;
  withdrawalFormHtml: string;
  contentSha256: string;
};

function escapeHtml(value: string) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function planName(planCode: IndividualPlanCode) {
  return planCode === 'teacher_pro' ? 'Teacher Pro' : 'Teacher';
}

function formatMoney(amountMinor: number, currency: IndividualBillingCurrency, locale: IndividualContractLocale) {
  return new Intl.NumberFormat(locale === 'cs' ? 'cs-CZ' : 'en-US', {
    style: 'currency',
    currency: currency.toUpperCase(),
    minimumFractionDigits: currency === 'czk' ? 0 : 2,
    maximumFractionDigits: currency === 'czk' ? 0 : 2,
  }).format(amountMinor / 100);
}

function documentShell(locale: IndividualContractLocale, title: string, body: string) {
  return `<!doctype html>
<html lang="${locale}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${escapeHtml(title)}</title>
<style>
body{font-family:Arial,Helvetica,sans-serif;color:#171821;max-width:860px;margin:36px auto;padding:0 24px;line-height:1.55}
h1{font-size:28px;margin:0 0 20px}h2{font-size:20px;margin:28px 0 10px}h3{font-size:16px;margin:20px 0 8px}
p,li{font-size:14px}table{border-collapse:collapse;width:100%;margin:16px 0 24px}th,td{border:1px solid #ddd;padding:9px 10px;text-align:left;font-size:14px;vertical-align:top}
th{width:34%;background:#f5f4fb}.muted{color:#666}.box{padding:16px;border:1px solid #d8d7e8;border-radius:10px;background:#f8f7ff}
hr{border:0;border-top:1px solid #ddd;margin:34px 0}a{color:#4f46c8}
</style>
</head>
<body>${body}</body>
</html>`;
}

const TERMS_CURRENT_CS = `
<section>
<h2>1. Poskytovatel služby</h2>
<p><strong>${escapeHtml(PROVIDER_CONTACT.legalName)}</strong><br>IČO: ${escapeHtml(PROVIDER_CONTACT.businessId)}<br>${escapeHtml(PROVIDER_CONTACT.addressLine1)}<br>${escapeHtml(PROVIDER_CONTACT.postalCity)}<br>${escapeHtml(PROVIDER_CONTACT.countryCs)}</p>
<p>Telefon: <a href="${escapeHtml(PROVIDER_CONTACT.phoneHref)}">${escapeHtml(PROVIDER_CONTACT.phoneDisplay)}</a><br>E-mail: <a href="${escapeHtml(PROVIDER_CONTACT.emailHref)}">${escapeHtml(PROVIDER_CONTACT.email)}</a><br>Web: <strong>${escapeHtml(PROVIDER_CONTACT.website)}</strong></p>
<p>Tyto obchodní podmínky tvoří součást smlouvy mezi poskytovatelem a uživatelem služby Syllonaut.</p>
</section>
<section>
<h2>2. Služba a vznik smlouvy</h2>
<p>Syllonaut je online služba pro přípravu, úpravu, vedení a vyhodnocování interaktivních lekcí s využitím AI. Smlouva k Free účtu vzniká dokončením registrace po odsouhlasení těchto podmínek. U placeného tarifu vzniká placený smluvní vztah dokončením objednávky; aktivace placených oprávnění nastává podle zvoleného způsobu platby po potvrzení platby.</p>
<p>Jedná-li osoba za školu, firmu nebo jinou organizaci, potvrzuje, že je oprávněna organizaci zavázat. U školních tarifů je vlastníkem organizace účet, který objednávku vytvořil, dokud nedojde k platnému převodu role.</p>
<p>${escapeHtml(TERMS_ACCOUNT_ELIGIBILITY_CLAUSE.cs)}</p>
<p>${escapeHtml(TERMS_DPA_SCOPE_CLAUSE.cs)} Zpracovatelská smlouva je dostupná na syllonaut.com/cs/dpa.</p>
<p>${escapeHtml(TERMS_TECHNICAL_REQUIREMENTS_CLAUSE.cs)}</p>
</section>
<section>
<h2>3. Účet a bezpečnost</h2>
<ul>
<li>Uživatel uvádí pravdivé údaje a chrání své přihlašovací údaje.</li>
<li>Účet je určen konkrétnímu uživateli; obcházení limitů sdílením účtu nebo jiným technickým způsobem není dovoleno.</li>
<li>Studenti se k živé lekci mohou připojit bez plnohodnotného účtu. Za přiměřené a zákonné použití Syllonautu ve výuce odpovídá učitel nebo organizace, která výuku vede.</li>
</ul>
</section>
<section>
<h2>4. AI funkce a obsah</h2>
<p>Výstupy AI mohou obsahovat nepřesnosti nebo nevhodné návrhy. Učitel musí před použitím ve výuce zkontrolovat věcnou správnost, přiměřenost věku, bezpečnost a vhodnost obsahu. Syllonaut nenahrazuje odborný úsudek učitele.</p>
<p>${escapeHtml(TERMS_AI_SCORING_PURPOSE_CLAUSE.cs)}</p>
<p>Uživatel zůstává odpovědný za obsah, který do služby vloží, a musí mít právo jej používat. Poskytovateli uděluje pouze takové oprávnění k technickému zpracování obsahu, které je nutné pro provoz služby a vyžádané AI operace.</p>
<p>Podrobnosti o zpracování osobních údajů a AI dodavatelích jsou v zásadách ochrany osobních údajů na syllonaut.com.</p>
</section>
<section>
<h2>5. Tarify, ceny a AI limity</h2>
<p>${escapeHtml(TERMS_PLAN_PRICING_CLAUSE.cs)}</p>
<p>AI limity se vztahují na operace uvedené u daného tarifu. Nevyčerpané měsíční kvóty se nepřevádějí, není-li výslovně uvedeno jinak. Poskytovatel může zavést přiměřené technické a bezpečnostní limity bránící zneužití služby.</p>
</section>
<section>
<h2>6. Platby, obnovení a zrušení předplatného</h2>
<p>Individuální placené tarify hrazené kartou se obnovují automaticky po zvoleném měsíčním nebo ročním období, dokud uživatel automatické obnovení nezruší. Správa předplatného, faktur a zrušení je dostupná v části Předplatné a prostřednictvím zákaznického portálu Stripe.</p>
<p>U školních tarifů se režim obnovení řídí zvoleným způsobem platby. Kartové předplatné se může obnovovat automaticky; objednávky na fakturu se obnovují až novou objednávkou nebo fakturou. Zrušení automatického obnovení neukončuje již zaplacené období.</p>
<p>Pokud platba není potvrzena, je po splatnosti, je vrácena nebo je předmětem sporu, může Syllonaut dočasně omezit nové placené AI operace nebo po uplynutí oznámené lhůty pozastavit placená oprávnění. Existující obsah je zachován v rozsahu popsaném v aplikaci.</p>
</section>
<section>
<h2>7. Spotřebitelé: právo odstoupit do 14 dnů</h2>
<p>Jste-li spotřebitel, můžete od smlouvy uzavřené na dálku zpravidla odstoupit do 14 dnů od jejího uzavření bez uvedení důvodu. Odstoupení stačí v této lhůtě odeslat na vaclav@syllonaut.com jednoznačným prohlášením.</p>
<p>${escapeHtml(TERMS_WITHDRAWAL_CLAUSE.cs)}</p>
<p>Zákonný vzorový formulář je přiložen k tomuto potvrzení a trvale dostupný na syllonaut.com/cs/withdrawal. ${escapeHtml(TERMS_ONLINE_WITHDRAWAL_NOTICE.cs)}</p>
<p>Toto právo se vztahuje pouze na spotřebitele. Práva spotřebitele, která nelze smluvně omezit, zůstávají těmito podmínkami nedotčena.</p>
</section>
<section>
<h2>8. Vady, reklamace a dostupnost služby</h2>
${TERMS_COMPLAINT_CLAUSE.cs.map((paragraph) => `<p>${escapeHtml(paragraph)}</p>`).join('')}
<p>Syllonaut je průběžně vyvíjená online služba. Krátkodobé výpadky mohou nastat kvůli údržbě, bezpečnosti nebo závislosti na externích poskytovatelích. Poskytovatel bude usilovat o rozumnou dostupnost a nápravu závažných poruch, negarantuje však nepřetržitý provoz bez výpadku.</p>
</section>
<section>
<h2>9. Zakázané použití</h2>
<p>Syllonaut nesmí být používán zejména k:</p>
<ul><li>protiprávnímu jednání nebo porušování práv třetích osob;</li><li>nahrávání škodlivého kódu, útokům na službu, obcházení zabezpečení, kvót nebo platebních omezení;</li><li>neoprávněnému získávání cizích účtů, dat nebo studentských odpovědí;</li><li>automatizovanému hromadnému využívání mimo funkce, které Syllonaut výslovně poskytuje.</li></ul>
</section>
<section>
<h2>10. Změny služby a podmínek</h2>
${TERMS_SERVICE_CHANGE_CLAUSE.cs.map((paragraph) => `<p>${escapeHtml(paragraph)}</p>`).join('')}
</section>
<section>
<h2>11. Ukončení účtu</h2>
${TERMS_ACCOUNT_DELETION_CLAUSE.cs.map((paragraph) => `<p>${escapeHtml(paragraph)}</p>`).join('')}
<p>Poskytovatel může účet nebo jeho funkce omezit při závažném či opakovaném porušování těchto podmínek, zneužití služby nebo z bezpečnostních důvodů. Pokud to situace dovoluje, uživatele předem upozorní.</p>
</section>
<section>
<h2>12. Odpovědnost</h2>
<p>Nic v těchto podmínkách nevylučuje ani neomezuje odpovědnost nebo práva, která podle použitelného práva vyloučit či omezit nelze. Uživatel bere na vědomí zejména povahu AI výstupů podle článku 4 a odpovídá za vlastní rozhodnutí, jak je použije ve výuce.</p>
</section>
<section>
<h2>13. Rozhodné právo a spotřebitelské spory</h2>
<p>Smluvní vztah se řídí právem České republiky. Jste-li spotřebitel s bydlištěm v jiné zemi, nejsou tím dotčena kogentní práva, která vám poskytuje právo země vašeho obvyklého bydliště.</p>
<p>Případný spor se nejprve pokusíme vyřešit dohodou. Spotřebitel může podat návrh na mimosoudní řešení spotřebitelského sporu u České obchodní inspekce (ČOI), Štěpánská 567/15, 120 00 Praha 2; informace a elektronický postup jsou na webu ČOI: <a href="https://coi.gov.cz/informace-o-adr/">coi.gov.cz</a>.</p>
</section>
<section>
<h2>14. Ochrana osobních údajů a závěrečná ustanovení</h2>
<p>Zpracování osobních údajů upravuje samostatná stránka Ochrana osobních údajů (GDPR) na syllonaut.com.</p>
<p>V rozsahu, v němž Syllonaut zpracovává osobní údaje jménem organizace Team / School / Campus nebo učitele s individuálním účtem při výuce (čl. 2), je závaznou součástí smlouvy také zpracovatelská smlouva (DPA) na syllonaut.com/cs/dpa.</p>
<p>Aktuální verze těchto podmínek je ${TERMS_VERSION} a je účinná od 25. 9. 2026. U konkrétní objednávky se uchovává verze podmínek odsouhlasená při objednání.</p>
</section>`;

const TERMS_CURRENT_EN = `
<section>
<h2>1. Service provider</h2>
<p><strong>${escapeHtml(PROVIDER_CONTACT.legalName)}</strong><br>Business ID: ${escapeHtml(PROVIDER_CONTACT.businessId)}<br>${escapeHtml(PROVIDER_CONTACT.addressLine1)}<br>${escapeHtml(PROVIDER_CONTACT.postalCity)}<br>${escapeHtml(PROVIDER_CONTACT.countryEn)}</p>
<p>Phone: <a href="${escapeHtml(PROVIDER_CONTACT.phoneHref)}">${escapeHtml(PROVIDER_CONTACT.phoneDisplay)}</a><br>Email: <a href="${escapeHtml(PROVIDER_CONTACT.emailHref)}">${escapeHtml(PROVIDER_CONTACT.email)}</a><br>Website: <strong>${escapeHtml(PROVIDER_CONTACT.website)}</strong></p>
<p>These Terms form part of the contract between the provider and each Syllonaut user.</p>
</section>
<section>
<h2>2. Service and formation of the contract</h2>
<p>Syllonaut is an online service for preparing, refining, running and evaluating interactive lessons with AI. The Free-account contract is formed when registration is completed after accepting these Terms. A paid contract is formed when the paid order is completed; paid entitlements activate according to the selected payment method after payment is confirmed.</p>
<p>A person acting for a school, company or other organization confirms that they are authorized to bind that organization. For school plans, the account creating the order is the organization owner until the role is validly transferred.</p>
<p>${escapeHtml(TERMS_ACCOUNT_ELIGIBILITY_CLAUSE.en)}</p>
<p>${escapeHtml(TERMS_DPA_SCOPE_CLAUSE.en)} The Data Processing Agreement is available at syllonaut.com/en/dpa.</p>
<p>${escapeHtml(TERMS_TECHNICAL_REQUIREMENTS_CLAUSE.en)}</p>
</section>
<section>
<h2>3. Account and security</h2>
<ul>
<li>Users must provide accurate information and protect their sign-in credentials.</li>
<li>An account is assigned to a specific user; bypassing limits by account sharing or other technical means is not permitted.</li>
<li>Students may join a live lesson without a full account. The teacher or organization running the lesson is responsible for appropriate and lawful classroom use of Syllonaut.</li>
</ul>
</section>
<section>
<h2>4. AI features and content</h2>
<p>AI outputs may contain inaccuracies or unsuitable suggestions. Before classroom use, the teacher must review factual accuracy, age appropriateness, safety and suitability. Syllonaut does not replace professional teacher judgment.</p>
<p>${escapeHtml(TERMS_AI_SCORING_PURPOSE_CLAUSE.en)}</p>
<p>Users remain responsible for content they submit and must have the right to use it. They grant the provider only the rights needed to technically process that content to operate the service and perform requested AI operations.</p>
<p>Details about personal-data processing and AI providers are in the Privacy Notice on syllonaut.com.</p>
</section>
<section>
<h2>5. Plans, prices and AI allowances</h2>
<p>${escapeHtml(TERMS_PLAN_PRICING_CLAUSE.en)}</p>
<p>AI allowances apply to the operations listed for the relevant plan. Unused monthly allowances do not roll over unless expressly stated otherwise. The provider may apply reasonable technical and security limits to prevent abuse.</p>
</section>
<section>
<h2>6. Payments, renewals and cancellation</h2>
<p>Individual paid plans purchased by card renew automatically for the selected monthly or annual billing period until automatic renewal is cancelled. Subscription, invoices and cancellation can be managed in the Subscription area and through the Stripe customer portal.</p>
<p>For school plans, renewal depends on the selected payment method. Card subscriptions may renew automatically; invoice-based plans renew only through a new order or invoice. Cancelling automatic renewal does not end a period that has already been paid for.</p>
<p>If payment is unconfirmed, overdue, refunded or disputed, Syllonaut may temporarily restrict new paid AI operations or suspend paid entitlements after the stated grace period. Existing content remains available to the extent described in the application.</p>
</section>
<section>
<h2>7. Consumers: 14-day withdrawal right</h2>
<p>If you are a consumer, you generally have 14 days from conclusion of a distance contract to withdraw without giving a reason. It is sufficient to send an unequivocal withdrawal statement within that period to vaclav@syllonaut.com.</p>
<p>${escapeHtml(TERMS_WITHDRAWAL_CLAUSE.en)}</p>
<p>The statutory model form is attached to this confirmation and remains available at syllonaut.com/en/withdrawal. ${escapeHtml(TERMS_ONLINE_WITHDRAWAL_NOTICE.en)}</p>
<p>This right applies only to consumers. Statutory consumer rights that cannot be contractually restricted remain unaffected by these Terms.</p>
</section>
<section>
<h2>8. Defects, complaints and service availability</h2>
${TERMS_COMPLAINT_CLAUSE.en.map((paragraph) => `<p>${escapeHtml(paragraph)}</p>`).join('')}
<p>Syllonaut is an online service under continuous development. Temporary interruptions may occur for maintenance, security or because of external providers. The provider will use reasonable efforts to maintain availability and remedy material failures but does not guarantee uninterrupted operation.</p>
</section>
<section>
<h2>9. Prohibited use</h2>
<p>Syllonaut must not be used to:</p>
<ul><li>engage in unlawful activity or infringe third-party rights;</li><li>upload malicious code, attack the service, or circumvent security, quotas or payment restrictions;</li><li>obtain other users’ accounts, data or student responses without authorization;</li><li>conduct automated bulk use outside features expressly provided by Syllonaut.</li></ul>
</section>
<section>
<h2>10. Changes to the service and Terms</h2>
${TERMS_SERVICE_CHANGE_CLAUSE.en.map((paragraph) => `<p>${escapeHtml(paragraph)}</p>`).join('')}
</section>
<section>
<h2>11. Account termination</h2>
${TERMS_ACCOUNT_DELETION_CLAUSE.en.map((paragraph) => `<p>${escapeHtml(paragraph)}</p>`).join('')}
<p>The provider may restrict an account or its features for serious or repeated breaches of these Terms, abuse of the service or security reasons. Where circumstances allow, the user will be notified in advance.</p>
</section>
<section>
<h2>12. Liability</h2>
<p>Nothing in these Terms excludes or limits liability or rights that cannot be excluded or limited under applicable law. In particular, users acknowledge the nature of AI outputs described in section 4 and remain responsible for their own decisions about classroom use.</p>
</section>
<section>
<h2>13. Governing law and consumer disputes</h2>
<p>The contract is governed by the laws of the Czech Republic. If you are a consumer resident in another country, this does not deprive you of mandatory protections granted by the law of your habitual residence.</p>
<p>We will first try to resolve any dispute by agreement. A consumer may submit a dispute for out-of-court resolution to the Czech Trade Inspection Authority (ČOI), Štěpánská 567/15, 120 00 Prague 2; information and the electronic procedure are available at <a href="https://coi.gov.cz/informace-o-adr/">coi.gov.cz</a>.</p>
</section>
<section>
<h2>14. Privacy and final provisions</h2>
<p>Personal-data processing is described in the separate Privacy Notice on syllonaut.com.</p>
<p>To the extent Syllonaut processes personal data on behalf of a Team / School / Campus organisation or of a teacher with an individual account in teaching (section 2), that processing is additionally governed by the binding Data Processing Agreement (DPA) at syllonaut.com/en/dpa.</p>
<p>The current version of these Terms is ${TERMS_VERSION}, effective from 25 September 2026. For a specific order, the version accepted when the order was placed is retained.</p>
</section>`;

// Article 5a (Terms 1.12, AI grading suggestion packs) is part of the
// snapshot only once it is active; see lib/legal.ts for the activation steps.
function topupArticleHtml(locale: IndividualContractLocale) {
  const clause = TERMS_AI_GRADING_TOPUP_CLAUSE;
  const title = locale === 'cs' ? clause.titleCs : clause.titleEn;
  const paragraphs = locale === 'cs' ? clause.cs : clause.en;
  return `<section>\n<h2>${escapeHtml(title)}</h2>\n${paragraphs.map((paragraph) => `<p>${escapeHtml(paragraph)}</p>`).join('\n')}\n</section>\n`;
}

function termsCurrent(locale: IndividualContractLocale) {
  if (
    TERMS_VERSION !== '1.12'
    || TERMS_EFFECTIVE_DATE !== '2026-09-25'
    || TERMS_ACCEPTANCE_KEY !== '2026-09-25-v13'
    || !TERMS_AI_GRADING_TOPUP_ARTICLE_ACTIVE
  ) {
    throw new Error('contract_terms_snapshot_version_unsupported');
  }
  const base = locale === 'cs' ? TERMS_CURRENT_CS : TERMS_CURRENT_EN;
  if (!TERMS_AI_GRADING_TOPUP_ARTICLE_ACTIVE) return base;
  const marker = locale === 'cs' ? '<section>\n<h2>6. Platby' : '<section>\n<h2>6. Payments';
  if (!base.includes(marker)) throw new Error('contract_terms_snapshot_topup_anchor_missing');
  return base.replace(marker, topupArticleHtml(locale) + marker);
}

function technicalRequirementsHtml(locale: IndividualContractLocale) {
  const heading = locale === 'cs' ? 'Technické požadavky' : 'Technical requirements';
  return `<h2>${heading}</h2>` + TECHNICAL_REQUIREMENTS[locale].map((section) => (
    `<h3>${escapeHtml(section.title)}</h3><ul>${section.items.map((item) => `<li>${escapeHtml(item)}</li>`).join('')}</ul>`
  )).join('');
}

function buildWithdrawalForm(locale: IndividualContractLocale) {
  return documentShell(locale, WITHDRAWAL_FORM_COPY[locale].title, buildStatutoryWithdrawalFormHtml(locale));
}

export function buildIndividualContractSnapshotDocuments(input: {
  locale: IndividualContractLocale;
  planCode: IndividualPlanCode;
  billingPeriod: BillingPeriod;
  currency: IndividualBillingCurrency;
  amountMinor: number;
  billingCountry: string;
  capturedAt: string;
}) : IndividualContractSnapshotDocuments {
  const { locale } = input;
  const name = planName(input.planCode);
  const price = formatMoney(input.amountMinor, input.currency, locale);
  const capturedAt = new Intl.DateTimeFormat(locale === 'cs' ? 'cs-CZ' : 'en-GB', {
    dateStyle: 'long',
    timeStyle: 'medium',
    timeZone: 'Europe/Prague',
  }).format(new Date(input.capturedAt));
  const period = input.billingPeriod === 'annual'
    ? (locale === 'cs' ? 'roční' : 'annual')
    : (locale === 'cs' ? 'měsíční' : 'monthly');

  const summary = locale === 'cs'
    ? `<h1>Potvrzení smluvních informací Syllonaut</h1>
<p class="muted">Neměnný snapshot připravený před přesměrováním do platební brány Stripe: ${escapeHtml(capturedAt)}.</p>
<div class="box"><strong>Tento dokument zachycuje nabídku a obchodní podmínky odsouhlasené před objednávkou.</strong> Placené oprávnění se aktivuje po potvrzení platby.</div>
<h2>Shrnutí objednávky</h2>
<table>
<tr><th>Poskytovatel</th><td>${escapeHtml(PROVIDER_CONTACT.legalName)}, IČO ${escapeHtml(PROVIDER_CONTACT.businessId)}, ${escapeHtml(PROVIDER_CONTACT.addressLine1)}, ${escapeHtml(PROVIDER_CONTACT.postalCity)}, ${escapeHtml(PROVIDER_CONTACT.countryCs)}; telefon ${escapeHtml(PROVIDER_CONTACT.phoneDisplay)}; e-mail ${escapeHtml(PROVIDER_CONTACT.email)}</td></tr>
<tr><th>Tarif</th><td>${escapeHtml(name)}</td></tr>
<tr><th>Cena</th><td>${escapeHtml(price)}</td></tr>
<tr><th>Fakturační období</th><td>${period}</td></tr>
<tr><th>Měna</th><td>${escapeHtml(input.currency.toUpperCase())}</td></tr>
<tr><th>Fakturační země zvolená před checkoutem</th><td>${escapeHtml(input.billingCountry)}</td></tr>
<tr><th>Automatické obnovení</th><td>Ano. Předplatné se obnovuje po zvoleném období, dokud automatické obnovení nezrušíte.</td></tr>
<tr><th>Okamžité zahájení služby</th><td>Výslovně požadováno před uplynutím 14denní lhůty. Při odstoupení může být účtována poměrná část ceny za již poskytnuté plnění.</td></tr>
<tr><th>Verze obchodních podmínek</th><td>${escapeHtml(TERMS_VERSION)} · acceptance key ${escapeHtml(TERMS_ACCEPTANCE_KEY)}</td></tr>
</table>
${technicalRequirementsHtml('cs')}
<hr>
<h1>Obchodní podmínky Syllonaut</h1>
<p class="muted">Verze ${escapeHtml(TERMS_VERSION)} · účinná od 25. 9. 2026</p>${termsCurrent(locale)}`
    : `<h1>Syllonaut contract information confirmation</h1>
<p class="muted">Immutable snapshot prepared before redirecting to Stripe Checkout: ${escapeHtml(capturedAt)}.</p>
<div class="box"><strong>This document records the offer and Terms accepted before the order.</strong> Paid entitlements activate after payment is confirmed.</div>
<h2>Order summary</h2>
<table>
<tr><th>Provider</th><td>${escapeHtml(PROVIDER_CONTACT.legalName)}, Business ID ${escapeHtml(PROVIDER_CONTACT.businessId)}, ${escapeHtml(PROVIDER_CONTACT.addressLine1)}, ${escapeHtml(PROVIDER_CONTACT.postalCity)}, ${escapeHtml(PROVIDER_CONTACT.countryEn)}; phone ${escapeHtml(PROVIDER_CONTACT.phoneDisplay)}; email ${escapeHtml(PROVIDER_CONTACT.email)}</td></tr>
<tr><th>Plan</th><td>${escapeHtml(name)}</td></tr>
<tr><th>Price</th><td>${escapeHtml(price)}</td></tr>
<tr><th>Billing period</th><td>${period}</td></tr>
<tr><th>Currency</th><td>${escapeHtml(input.currency.toUpperCase())}</td></tr>
<tr><th>Billing country selected before checkout</th><td>${escapeHtml(input.billingCountry)}</td></tr>
<tr><th>Automatic renewal</th><td>Yes. The subscription renews for the selected period until automatic renewal is cancelled.</td></tr>
<tr><th>Immediate start of service</th><td>Expressly requested before the 14-day withdrawal period ends. If you withdraw, a proportionate amount may be charged for service already supplied.</td></tr>
<tr><th>Terms version</th><td>${escapeHtml(TERMS_VERSION)} · acceptance key ${escapeHtml(TERMS_ACCEPTANCE_KEY)}</td></tr>
</table>
${technicalRequirementsHtml('en')}
<hr>
<h1>Syllonaut Terms of Service</h1>
<p class="muted">Version ${escapeHtml(TERMS_VERSION)} · effective 25 September 2026</p>${termsCurrent(locale)}`;

  const contractHtml = documentShell(locale, locale === 'cs' ? 'Potvrzení smluvních informací Syllonaut' : 'Syllonaut contract information confirmation', summary);
  const withdrawalFormHtml = buildWithdrawalForm(locale);
  const contentSha256 = createHash('sha256')
    .update(contractHtml, 'utf8')
    .update('\n--syllonaut-withdrawal-form--\n', 'utf8')
    .update(withdrawalFormHtml, 'utf8')
    .digest('hex');

  return { contractHtml, withdrawalFormHtml, contentSha256 };
}

// Snapshot accepted before a one-time AI grading suggestion pack checkout.
// Requires Terms 1.12 (article 5a) to be active.
export function buildAiGradingTopupContractSnapshotDocuments(input: {
  locale: IndividualContractLocale;
  packCode: AiGradingTopupPackCode;
  currency: IndividualBillingCurrency;
  amountMinor: number;
  billingCountry: string;
  capturedAt: string;
}): { contractHtml: string; contentSha256: string } {
  if (!TERMS_AI_GRADING_TOPUP_ARTICLE_ACTIVE) {
    throw new Error('topup_terms_not_active');
  }
  const { locale } = input;
  const quantity = aiGradingTopupQuantity(input.packCode);
  const price = formatMoney(input.amountMinor, input.currency, locale);
  const capturedAt = new Intl.DateTimeFormat(locale === 'cs' ? 'cs-CZ' : 'en-GB', {
    dateStyle: 'long',
    timeStyle: 'medium',
    timeZone: 'Europe/Prague',
  }).format(new Date(input.capturedAt));
  const cs = locale === 'cs';
  const rows = cs
    ? [
        ['Poskytovatel', `${PROVIDER_CONTACT.legalName}, IČO ${PROVIDER_CONTACT.businessId}, ${PROVIDER_CONTACT.addressLine1}, ${PROVIDER_CONTACT.postalCity}, ${PROVIDER_CONTACT.countryCs}; telefon ${PROVIDER_CONTACT.phoneDisplay}; e-mail ${PROVIDER_CONTACT.email}`],
        ['Předmět', `Jednorázový balíček ${quantity} návrhů hodnocení od AI (k tarifu Teacher Pro)`],
        ['Cena', `${price} jednorázově, bez automatického obnovení`],
        ['Měna', input.currency.toUpperCase()],
        ['Fakturační země', input.billingCountry],
        ['Platnost', `${AI_GRADING_TOPUP_VALIDITY_MONTHS} měsíců od potvrzení platby, i napříč obdobími tarifu`],
        ['Pořadí čerpání', 'Nejprve limit tarifu Teacher Pro pro aktuální období, potom dokoupené návrhy; z více balíčků nejdříve ten, jehož platnost skončí nejdříve.'],
        ['Podmínka čerpání', 'Aktivní tarif Teacher Pro. Po skončení předplatného se nevyčerpané návrhy zmrazí do obnovení Teacher Pro, nejdéle do konce platnosti.'],
        ['Okamžité zpřístupnění', AI_GRADING_TOPUP_CONSENT.immediateDelivery.cs],
        ['Právo na odstoupení', AI_GRADING_TOPUP_CONSENT.withdrawalLoss.cs],
        ['Refundace a spor', 'Při vrácení nebo sporu platby nevyčerpané návrhy tohoto balíčku zanikají; při sporu se dočasně omezí AI funkce podle článku 6.'],
        ['Verze obchodních podmínek', `${TERMS_VERSION} · acceptance key ${TERMS_ACCEPTANCE_KEY}`],
      ]
    : [
        ['Provider', `${PROVIDER_CONTACT.legalName}, Business ID ${PROVIDER_CONTACT.businessId}, ${PROVIDER_CONTACT.addressLine1}, ${PROVIDER_CONTACT.postalCity}, ${PROVIDER_CONTACT.countryEn}; phone ${PROVIDER_CONTACT.phoneDisplay}; email ${PROVIDER_CONTACT.email}`],
        ['Item', `One-time pack of ${quantity} AI grading suggestions (for the Teacher Pro plan)`],
        ['Price', `${price} one-time, no automatic renewal`],
        ['Currency', input.currency.toUpperCase()],
        ['Billing country', input.billingCountry],
        ['Validity', `${AI_GRADING_TOPUP_VALIDITY_MONTHS} months from payment confirmation, across plan allowance periods`],
        ['Order of use', 'The Teacher Pro allowance for the current period first, then purchased suggestions; of several packs, the one that expires first.'],
        ['Condition of use', 'An active Teacher Pro plan. After the subscription ends, unused suggestions are frozen until Teacher Pro is restored, at most until they expire.'],
        ['Immediate access', AI_GRADING_TOPUP_CONSENT.immediateDelivery.en],
        ['Right of withdrawal', AI_GRADING_TOPUP_CONSENT.withdrawalLoss.en],
        ['Refund and dispute', 'If the payment is refunded or disputed, unused suggestions of this pack expire; a dispute also temporarily restricts AI features under section 6.'],
        ['Terms version', `${TERMS_VERSION} · acceptance key ${TERMS_ACCEPTANCE_KEY}`],
      ];
  const table = `<table>${rows.map(([key, value]) => `<tr><th>${escapeHtml(key)}</th><td>${escapeHtml(value)}</td></tr>`).join('\n')}</table>`;
  const body = cs
    ? `<h1>Potvrzení objednávky balíčku návrhů hodnocení od AI</h1>
<p class="muted">Neměnný snapshot připravený před přesměrováním do platební brány Stripe: ${escapeHtml(capturedAt)}.</p>
<div class="box"><strong>Tento dokument zachycuje nabídku, souhlasy a obchodní podmínky odsouhlasené před objednávkou.</strong> Návrhy se připíšou po potvrzení platby.</div>
<h2>Shrnutí objednávky</h2>
${table}
<hr>
<h1>Obchodní podmínky Syllonaut</h1>
<p class="muted">Verze ${escapeHtml(TERMS_VERSION)}</p>${termsCurrent(locale)}`
    : `<h1>AI grading suggestion pack order confirmation</h1>
<p class="muted">Immutable snapshot prepared before redirecting to Stripe Checkout: ${escapeHtml(capturedAt)}.</p>
<div class="box"><strong>This document records the offer, consents and Terms accepted before the order.</strong> Suggestions are added after payment is confirmed.</div>
<h2>Order summary</h2>
${table}
<hr>
<h1>Syllonaut Terms of Service</h1>
<p class="muted">Version ${escapeHtml(TERMS_VERSION)}</p>${termsCurrent(locale)}`;
  const contractHtml = documentShell(locale, cs ? 'Potvrzení objednávky balíčku návrhů hodnocení od AI' : 'AI grading suggestion pack order confirmation', body);
  const contentSha256 = createHash('sha256').update(contractHtml, 'utf8').digest('hex');
  return { contractHtml, contentSha256 };
}
