export const TERMS_VERSION = '1.10';
export const TERMS_EFFECTIVE_DATE = '2026-09-23';
export const TERMS_ACCEPTANCE_KEY = '2026-09-23-v11';

// Terms 1.10 states the intended purpose of AI point suggestions (LEGAL-021),
// 1.9 the statutory online-withdrawal notice (LEGAL-020), 1.8 the technical
// requirements (LEGAL-018), 1.7 the complaint process (LEGAL-017) and 1.6 the
// renewal-safe account deletion (LEGAL-016). Existing 1.9 to 1.3 acceptances
// remain sufficient for ordinary product use; every new signup and order
// records the complete 1.10 document instead.
export const TERMS_PRODUCT_ACCESS_KEYS = [
  TERMS_ACCEPTANCE_KEY,
  '2026-09-23-v10',
  '2026-09-23-v9',
  '2026-09-23-v8',
  '2026-09-23-v7',
  '2026-09-21-v6',
  '2026-09-21-v5',
  '2026-09-21-v4',
] as const;

export const DPA_VERSION = '1.1';
export const DPA_EFFECTIVE_DATE = '2026-09-21';
export const DPA_ACCEPTANCE_KEY = '2026-09-21-dpa-v2';
