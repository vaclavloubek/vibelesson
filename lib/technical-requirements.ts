import { MATERIAL_MAX_FILES, MATERIAL_MAX_TOTAL_BYTES } from '@/lib/materials';

// LEGAL-018: pre-contractual information on functionality, compatibility and
// interoperability. One source for the public page, the Terms and the
// immutable contract snapshot.

// Must match next/dist/shared/lib/modern-browserslist-target.js (Next.js 16).
export const SUPPORTED_BROWSERS = {
  chrome: 111,
  edge: 111,
  firefox: 111,
  safari: '16.4',
} as const;

const materialsMb = Math.round(MATERIAL_MAX_TOTAL_BYTES / 1_000_000);
export const SUPPORTED_BROWSER_SUMMARY = `Chrome ${SUPPORTED_BROWSERS.chrome}+, Edge ${SUPPORTED_BROWSERS.edge}+, Firefox ${SUPPORTED_BROWSERS.firefox}+, Safari ${SUPPORTED_BROWSERS.safari}+`;

export type TechnicalRequirementSection = { title: string; items: string[] };

export const TECHNICAL_REQUIREMENTS: Record<'cs' | 'en', TechnicalRequirementSection[]> = {
  cs: [
    {
      title: 'Prohlížeč a zařízení',
      items: [
        `Aktuální webový prohlížeč: ${SUPPORTED_BROWSER_SUMMARY} (na iPhonu a iPadu iOS/iPadOS ${SUPPORTED_BROWSERS.safari} nebo novější). Starší prohlížeče nejsou podporované.`,
        'Zapnutý JavaScript. Syllonaut je webová aplikace, nic se neinstaluje.',
        'Učitel připravuje a řídí hodinu na počítači, notebooku nebo tabletu; pro promítání stačí připojený projektor nebo obrazovka. Studenti se připojují z vlastního telefonu, tabletu nebo počítače přes QR kód či odkaz, bez účtu.',
        'Placené funkce fungují jen na důvěryhodných zařízeních účtu; limit zařízení je uveden v Ceníku.',
      ],
    },
    {
      title: 'Cookies a úložiště prohlížeče',
      items: [
        'Povolené nezbytné cookies pro přihlášení, zabezpečení účtu a zapamatování jazyka. Analytické cookies jsou volitelné.',
        'Pro odolnost živé hodiny aplikace ukládá poslední stav a neodeslané odpovědi v úložišti prohlížeče (Service Worker, IndexedDB). V anonymním okně nebo při zakázaném úložišti může být tato ochrana při výpadku omezená.',
      ],
    },
    {
      title: 'Připojení k internetu',
      items: [
        'Stabilní připojení k internetu u učitele i studentů; aplikace neběží offline. Při krátkém výpadku živá hodina zachová poslední stav a po obnovení připojení se synchronizuje.',
        'Síť (například školní firewall) musí povolit HTTPS spojení na syllonaut.com a na challenges.cloudflare.com (ochrana přihlášení a registrace). Spojení WebSocket živou hodinu zrychluje, ale není nutné — bez něj hodina běží přes běžné dotazy.',
      ],
    },
    {
      title: 'Soubory a export',
      items: [
        `Podklady pro tvorbu lekce: PDF, PPTX, DOCX, TXT nebo MD, nejvýše ${MATERIAL_MAX_FILES} souborů a dohromady ${materialsMb} MB.`,
        'Pracovní listy lze vytisknout z prohlížeče nebo stáhnout jako PDF (tarify s pracovními listy).',
        'Výsledky živé hodiny lze stáhnout jako CSV (otevře se v Excelu, Google Tabulkách apod.); školy mohou učitele hromadně pozvat ze souboru CSV.',
        'Lekce se sdílejí odkazem v rámci Syllonautu; přímý export do jiných výukových systémů (např. LMS) ani import z nich není k dispozici.',
      ],
    },
  ],
  en: [
    {
      title: 'Browser and device',
      items: [
        `A current web browser: ${SUPPORTED_BROWSER_SUMMARY} (on iPhone and iPad, iOS/iPadOS ${SUPPORTED_BROWSERS.safari} or later). Older browsers are not supported.`,
        'JavaScript enabled. Syllonaut is a web application; nothing needs to be installed.',
        'The teacher prepares and runs the lesson on a computer, laptop or tablet; a connected projector or screen is enough for presenting. Students join from their own phone, tablet or computer via QR code or link, without an account.',
        'Paid features work only on the account’s trusted devices; the device limit is stated on the Pricing page.',
      ],
    },
    {
      title: 'Cookies and browser storage',
      items: [
        'Essential cookies allowed for sign-in, account security and remembering the language. Analytics cookies are optional.',
        'For live-lesson resilience the app stores the last state and unsent responses in browser storage (Service Worker, IndexedDB). In a private window or with storage disabled, this outage protection may be limited.',
      ],
    },
    {
      title: 'Internet connection',
      items: [
        'A stable internet connection for the teacher and students; the app does not run offline. During a short outage a live lesson keeps its last state and resynchronises when the connection returns.',
        'The network (for example a school firewall) must allow HTTPS connections to syllonaut.com and challenges.cloudflare.com (sign-in and sign-up protection). WebSocket connections speed up live lessons but are not required — without them the lesson runs over regular requests.',
      ],
    },
    {
      title: 'Files and export',
      items: [
        `Source materials for lesson creation: PDF, PPTX, DOCX, TXT or MD, up to ${MATERIAL_MAX_FILES} files and ${materialsMb} MB in total.`,
        'Worksheets can be printed from the browser or downloaded as PDF (plans that include worksheets).',
        'Live-lesson results can be downloaded as CSV (opens in Excel, Google Sheets and similar); schools can bulk-invite teachers from a CSV file.',
        'Lessons are shared by link within Syllonaut; direct export to or import from other learning systems (such as an LMS) is not available.',
      ],
    },
  ],
};
