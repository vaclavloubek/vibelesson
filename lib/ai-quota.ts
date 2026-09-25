export type AiQuotaSnapshot = {
  lesson_used: number;
  lesson_limit: number | null;
  lesson_remaining: number | null;
  revision_used: number;
  revision_limit: number | null;
  revision_remaining: number | null;
  lesson_unlimited: boolean;
  revision_unlimited: boolean;
  grading_used: number;
  grading_limit: number | null;
  grading_remaining: number | null;
  grading_unlimited: boolean;
  grading_enabled: boolean;
  quota_window_start: string | null;
  quota_window_end: string | null;
  quota_source: string | null;
  // Added in neon/migrations/0016. Optional so a response from a database
  // without the migration still type-checks at the call sites.
  plan_code?: string | null;
  quota_scope?: 'individual' | 'organization' | null;
  // Added in neon/migrations/0019: purchased AI grading suggestions (LIVE,
  // valid, not revoked) and the earliest expiry among packs with units left.
  grading_credit_remaining?: number | null;
  grading_credit_next_expiry?: string | null;
};

export function quotaSourceLabel(source: string | null | undefined, english: boolean) {
  if (source === 'calendar_utc') {
    return english ? 'calendar month' : 'kalendářní měsíc';
  }
  if (source === 'stripe_monthly' || source === 'stripe_annual_month') {
    return english ? 'billing cycle' : 'fakturační cyklus';
  }
  return null;
}
