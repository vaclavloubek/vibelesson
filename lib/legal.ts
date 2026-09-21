export const TERMS_VERSION = '1.5';
export const TERMS_EFFECTIVE_DATE = '2026-09-21';
export const TERMS_ACCEPTANCE_KEY = '2026-09-21-v6';

// Terms 1.5 adds the statutory withdrawal form and online withdrawal channel.
// Existing 1.4 and 1.3 acceptances remain sufficient for ordinary product use;
// every new signup and order records the complete 1.5 document instead.
export const TERMS_PRODUCT_ACCESS_KEYS = [
  TERMS_ACCEPTANCE_KEY,
  '2026-09-21-v5',
  '2026-09-21-v4',
] as const;

export const DPA_VERSION = '1.1';
export const DPA_EFFECTIVE_DATE = '2026-09-21';
export const DPA_ACCEPTANCE_KEY = '2026-09-21-dpa-v2';
