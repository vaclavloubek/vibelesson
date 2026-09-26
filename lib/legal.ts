export const TERMS_VERSION = '1.13';
export const TERMS_EFFECTIVE_DATE = '2026-09-26';
export const TERMS_ACCEPTANCE_KEY = '2026-09-26-v14';

// Terms 1.13 adds to article 6 that a full refund of the current period, made
// at the user's request, ends an individual subscription and the account moves
// to Free, except for a refunded duplicate payment (LEGAL-024, owner decision
// on 2026-09-26; existing 1.12 acceptances stay sufficient). Terms 1.12 adds article 5a on AI grading suggestion packs (LEGAL-023,
// approved by the lawyer and the project owner on 2026-09-25). 1.11 extended
// the DPA to individual accounts used in teaching and set the minimum
// teacher-account age (LEGAL-022), 1.10 states the intended purpose of AI
// point suggestions (LEGAL-021), 1.9 the statutory online-withdrawal notice
// (LEGAL-020), 1.8 the technical requirements (LEGAL-018), 1.7 the complaint
// process (LEGAL-017) and 1.6 the renewal-safe account deletion (LEGAL-016).
// Existing 1.12 to 1.3 acceptances remain sufficient for ordinary product use
// (owner decision: article 5a only concerns the voluntary pack purchase, where
// Terms 1.12 is accepted in the pack checkout); every new signup and order
// records the complete 1.12 document instead.
export const TERMS_PRODUCT_ACCESS_KEYS = [
  TERMS_ACCEPTANCE_KEY,
  '2026-09-25-v13',
  '2026-09-24-v12',
  '2026-09-23-v11',
  '2026-09-23-v10',
  '2026-09-23-v9',
  '2026-09-23-v8',
  '2026-09-23-v7',
  '2026-09-21-v6',
  '2026-09-21-v5',
  '2026-09-21-v4',
] as const;

// Article 5a (AI grading suggestion packs) is part of the current Terms since
// 1.12. The pack purchase itself stays behind AI_GRADING_TOPUPS_ENABLED.
export const TERMS_AI_GRADING_TOPUP_ARTICLE_ACTIVE: boolean = true;
export const TERMS_AI_GRADING_TOPUP_TERMS_VERSION = '1.12';

export const DPA_VERSION = '1.4';
export const DPA_EFFECTIVE_DATE = '2026-09-25';
export const DPA_ACCEPTANCE_KEY = '2026-09-25-dpa-v5';
