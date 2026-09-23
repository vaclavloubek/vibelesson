// LEGAL-017: shared complaint vocabulary for the form, API, emails and admin.
// Values must match the check constraints in neon/migrations/0011.

export const COMPLAINT_RESOLUTION_DAYS = 30;

export const COMPLAINT_SUBJECT_AREAS = {
  ai_generation: { cs: 'Tvorba a úpravy lekcí pomocí AI', en: 'AI lesson creation and edits' },
  live_lesson: { cs: 'Živá hodina a připojení studentů', en: 'Live lesson and student joining' },
  grading: { cs: 'Hodnocení odpovědí', en: 'Response grading' },
  billing: { cs: 'Platby, faktury a předplatné', en: 'Payments, invoices and subscription' },
  account: { cs: 'Účet a přihlášení', en: 'Account and sign-in' },
  other: { cs: 'Jiné', en: 'Other' },
} as const;

export const COMPLAINT_REMEDIES = {
  bring_into_conformity: { cs: 'Bezplatné odstranění vady (uvedení služby do souladu se smlouvou)', en: 'Free remedy of the defect (bringing the service into conformity)' },
  price_reduction: { cs: 'Přiměřená sleva z ceny', en: 'Proportionate price reduction' },
  termination: { cs: 'Ukončení smlouvy', en: 'Termination of the contract' },
  other: { cs: 'Jiné řešení (popište)', en: 'Other remedy (describe)' },
} as const;

export const COMPLAINT_OUTCOMES = {
  accepted: { cs: 'Reklamace uznána', en: 'Complaint accepted' },
  partially_accepted: { cs: 'Reklamace uznána částečně', en: 'Complaint partially accepted' },
  rejected: { cs: 'Reklamace zamítnuta', en: 'Complaint rejected' },
} as const;

export type ComplaintSubjectArea = keyof typeof COMPLAINT_SUBJECT_AREAS;
export type ComplaintRemedy = keyof typeof COMPLAINT_REMEDIES;
export type ComplaintOutcome = keyof typeof COMPLAINT_OUTCOMES;

export const COMPLAINT_SUBJECT_AREA_CODES = Object.keys(COMPLAINT_SUBJECT_AREAS) as [ComplaintSubjectArea, ...ComplaintSubjectArea[]];
export const COMPLAINT_REMEDY_CODES = Object.keys(COMPLAINT_REMEDIES) as [ComplaintRemedy, ...ComplaintRemedy[]];
export const COMPLAINT_OUTCOME_CODES = Object.keys(COMPLAINT_OUTCOMES) as [ComplaintOutcome, ...ComplaintOutcome[]];
