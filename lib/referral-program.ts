import 'server-only';

import { assertApprovedNeonCutover, getDatabaseBackend } from '@/lib/neon/config';
import { createNeonSql } from '@/lib/neon/server';
import { isDisposableEmailDomain } from '@/lib/referral-disposable-email-domains';
import { normalizeReferralCodeInput } from '@/lib/referral-program-config';

// Server flag for the whole referral program (phase 1). Off unless set to
// exactly "true": nothing is shown, written or evaluated. The program never
// sends anything; teachers share their own link.
export function isReferralsEnabled() {
  return process.env.REFERRALS_ENABLED === 'true';
}

function referralDatabaseAvailable() {
  if (!isReferralsEnabled() || getDatabaseBackend() !== 'neon') return false;
  assertApprovedNeonCutover();
  return true;
}

export type ReferralSection = {
  code: string;
  pendingCount: number;
  rewardedCount: number;
  bonusRemaining: number;
  bonusNextExpiry: string | null;
};

// Creates the code on first view. Null when the flag is off or the account does
// not take part (admin, organization member).
export async function getReferralSection(userId: string): Promise<ReferralSection | null> {
  if (!referralDatabaseAvailable()) return null;
  const sql = createNeonSql();
  const [codeRow] = await sql`select private.get_or_create_referral_code_server(${userId}::uuid) as code`;
  const code = typeof codeRow?.code === 'string' ? codeRow.code : null;
  if (!code) return null;
  const [summary] = await sql`select * from private.get_referral_summary_server(${userId}::uuid)`;
  const expiry = summary?.bonus_next_expiry;
  return {
    code,
    pendingCount: Number(summary?.pending_count ?? 0),
    rewardedCount: Number(summary?.rewarded_count ?? 0),
    bonusRemaining: Math.max(0, Number(summary?.bonus_remaining ?? 0)),
    bonusNextExpiry: expiry instanceof Date ? expiry.toISOString() : typeof expiry === 'string' ? expiry : null,
  };
}

// Called once at signup, after the device cookie exists. Never throws and never
// reveals whether the code exists: the signup response is the same either way.
export async function recordReferralAttributionSafely(input: {
  inviteeUserId: string;
  referralCode: unknown;
  signupDeviceHash: string | null;
  email: string;
}) {
  try {
    if (!referralDatabaseAvailable()) return;
    const code = normalizeReferralCodeInput(input.referralCode);
    if (!code) return;
    const sql = createNeonSql();
    await sql`
      select private.record_referral_attribution_server(
        ${input.inviteeUserId}::uuid,
        ${code}::text,
        ${input.signupDeviceHash}::text,
        ${isDisposableEmailDomain(input.email)}::boolean
      ) as status
    `;
  } catch (error) {
    console.warn('referral attribution failed', {
      code: error instanceof Error ? error.message : 'unknown',
    });
  }
}

// Retention (Privacy Notice 1.12), hourly even with the flag off, so data from
// a program that was switched off is still deleted on time. Skipped until
// migration 0027 exists in the database.
export async function purgeReferralData() {
  if (getDatabaseBackend() !== 'neon') return null;
  assertApprovedNeonCutover();
  const sql = createNeonSql();
  const [ready] = await sql`select to_regprocedure('private.purge_referral_data()') is not null as ready`;
  if (!ready?.ready) return null;
  const [row] = await sql`select private.purge_referral_data() as result`;
  return (row?.result ?? null) as Record<string, number> | null;
}

// Hourly from /api/cron/neon-grading. Records outcomes only; notifies nobody.
export async function processReferralQualifications() {
  if (!referralDatabaseAvailable()) return null;
  const sql = createNeonSql();
  const [row] = await sql`select private.process_referral_qualifications() as result`;
  return (row?.result ?? null) as Record<string, number> | null;
}
