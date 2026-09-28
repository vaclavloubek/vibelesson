// Referral program constants. The source of truth is the single row of
// private.referral_program_settings (neon/migrations/0027); these values mirror
// it for texts and must stay equal (scripts/verify-referral-program.mjs).
export const REFERRAL_PROGRAM = {
  rewardUnits: 3,
  rewardValidMonths: 12,
  qualifyWindowDays: 60,
  minSubmittingParticipants: 5,
  monthlyCap: 3,
  totalCap: 10,
} as const;

// 8 characters without 0/O, 1/I/L.
export const REFERRAL_CODE_PATTERN = /^[23456789ABCDEFGHJKMNPQRSTUVWXYZ]{8}$/;
export const REFERRAL_CODE_MAX_INPUT_LENGTH = 32;

export function normalizeReferralCodeInput(value: unknown) {
  if (typeof value !== 'string' || value.length > REFERRAL_CODE_MAX_INPUT_LENGTH) return null;
  const code = value.replace(/\s+/g, '').toUpperCase();
  return REFERRAL_CODE_PATTERN.test(code) ? code : null;
}
