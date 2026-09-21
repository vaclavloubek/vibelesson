import { PROVIDER_CONTACT } from '@/lib/provider-contact';

export type WithdrawalFormLocale = 'cs' | 'en';

export const WITHDRAWAL_FORM_COPY = {
  cs: {
    title: 'Vzorový formulář pro odstoupení od smlouvy',
    instruction: '(vyplňte tento formulář a pošlete jej zpět pouze v případě, že chcete odstoupit od smlouvy)',
    addressee: 'Adresát',
    statement: 'Oznamuji/oznamujeme (*), že tímto odstupuji/odstupujeme (*) od smlouvy o nákupu tohoto zboží (*) / o poskytnutí těchto služeb (*):',
    ordered: 'Datum objednání (*) / datum obdržení (*)',
    names: 'Jméno a příjmení spotřebitele/spotřebitelů',
    address: 'Adresa spotřebitele/spotřebitelů',
    date: 'Datum',
    signature: 'Podpis spotřebitele/spotřebitelů (pouze pokud je tento formulář zasílán v listinné podobě)',
    note: '(*) Nehodící se škrtněte nebo údaje doplňte.',
  },
  en: {
    title: 'Model withdrawal form',
    instruction: '(complete and return this form only if you wish to withdraw from the contract)',
    addressee: 'To',
    statement: 'I/We hereby give notice that I/We withdraw from my/our contract of sale of the following goods (*) / for the provision of the following services (*):',
    ordered: 'Ordered on (*) / received on (*)',
    names: 'Name of consumer(s)',
    address: 'Address of consumer(s)',
    date: 'Date',
    signature: 'Signature of consumer(s) (only if this form is submitted on paper)',
    note: '(*) Delete as appropriate or complete the relevant information.',
  },
} as const;

function escapeHtml(value: string) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

export function withdrawalAddresseeHtml(locale: WithdrawalFormLocale) {
  const country = locale === 'cs' ? PROVIDER_CONTACT.countryCs : PROVIDER_CONTACT.countryEn;
  const phone = locale === 'cs' ? 'Telefon' : 'Phone';
  const email = locale === 'cs' ? 'E-mail' : 'Email';
  return `${escapeHtml(PROVIDER_CONTACT.legalName)}<br>${escapeHtml(PROVIDER_CONTACT.addressLine1)}<br>${escapeHtml(PROVIDER_CONTACT.postalCity)}<br>${escapeHtml(country)}<br>${phone}: ${escapeHtml(PROVIDER_CONTACT.phoneDisplay)}<br>${email}: ${escapeHtml(PROVIDER_CONTACT.email)}`;
}

export function buildStatutoryWithdrawalFormHtml(locale: WithdrawalFormLocale) {
  const copy = WITHDRAWAL_FORM_COPY[locale];
  const lines = '________________________________';
  return `<h1>${escapeHtml(copy.title)}</h1>
<p class="muted">${escapeHtml(copy.instruction)}</p>
<p><strong>${escapeHtml(copy.addressee)}:</strong><br>${withdrawalAddresseeHtml(locale)}</p>
<p>${escapeHtml(copy.statement)}</p>
<p>${lines}</p>
<table>
<tr><th>${escapeHtml(copy.ordered)}</th><td>${lines}</td></tr>
<tr><th>${escapeHtml(copy.names)}</th><td>${lines}</td></tr>
<tr><th>${escapeHtml(copy.address)}</th><td>${lines}</td></tr>
</table>
<p>${escapeHtml(copy.signature)}: ${lines}</p>
<table><tr><th>${escapeHtml(copy.date)}</th><td>${lines}</td></tr></table>
<p class="muted">${escapeHtml(copy.note)}</p>`;
}
