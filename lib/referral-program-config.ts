// Referral program constants. The source of truth is the single row of
// private.referral_program_settings (neon/migrations/0027); these values mirror
// it for texts and must stay equal (scripts/verify-referral-program.mjs).
export const REFERRAL_PROGRAM = {
  // Owner decision 2026-09-28: one bonus lesson (three could tempt misuse).
  rewardUnits: 1,
  rewardValidMonths: 12,
  qualifyWindowDays: 60,
  minSubmittingParticipants: 5,
  monthlyCap: 3,
  totalCap: 10,
  // Privacy Notice 1.12: months an attribution is kept after it closed (after
  // the reward expired for a rewarded one).
  retentionMonths: 12,
} as const;

// "N bonus lessons" in the accusative ("získáš 1 bonusovou lekci").
export function bonusLessonsCs(count: number) {
  if (count === 1) return '1 bonusovou lekci';
  if (count >= 2 && count <= 4) return `${count} bonusové lekce`;
  return `${count} bonusových lekcí`;
}

export function bonusLessonsEn(count: number) {
  return `${count} bonus ${count === 1 ? 'lesson' : 'lessons'}`;
}

// 8 characters without 0/O, 1/I/L.
export const REFERRAL_CODE_PATTERN = /^[23456789ABCDEFGHJKMNPQRSTUVWXYZ]{8}$/;
export const REFERRAL_CODE_MAX_INPUT_LENGTH = 32;

export function normalizeReferralCodeInput(value: unknown) {
  if (typeof value !== 'string' || value.length > REFERRAL_CODE_MAX_INPUT_LENGTH) return null;
  const code = value.replace(/\s+/g, '').toUpperCase();
  return REFERRAL_CODE_PATTERN.test(code) ? code : null;
}
