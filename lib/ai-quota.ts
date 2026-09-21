export type AiQuotaSnapshot = {
  lesson_used: number;
  lesson_limit: number | null;
  lesson_remaining: number | null;
  revision_used: number;
  revision_limit: number | null;
  revision_remaining: number | null;
  lesson_unlimited: boolean;
  revision_unlimited: boolean;
  quota_window_start: string | null;
  quota_window_end: string | null;
  quota_source: string | null;
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
