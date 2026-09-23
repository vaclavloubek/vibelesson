export const TERMS_VERSION = '1.7';
export const TERMS_EFFECTIVE_DATE = '2026-09-23';
export const TERMS_ACCEPTANCE_KEY = '2026-09-23-v8';

// Terms 1.7 adds the evidenced complaint process (LEGAL-017) and 1.6 the
// renewal-safe account deletion (LEGAL-016); both only benefit users. Existing
// 1.6, 1.5, 1.4 and 1.3 acceptances remain sufficient for ordinary product use;
// every new signup and order records the complete 1.7 document instead.
export const TERMS_PRODUCT_ACCESS_KEYS = [
  TERMS_ACCEPTANCE_KEY,
  '2026-09-23-v7',
  '2026-09-21-v6',
  '2026-09-21-v5',
  '2026-09-21-v4',
] as const;

export const DPA_VERSION = '1.1';
export const DPA_EFFECTIVE_DATE = '2026-09-21';
export const DPA_ACCEPTANCE_KEY = '2026-09-21-dpa-v2';
