import fs from 'node:fs';

const migration = fs.readFileSync(
  'supabase/migrations/20260920080000_anchor_individual_ai_quotas_to_billing_period.sql',
  'utf8',
);

const requireText = (needle, label) => {
  if (!migration.includes(needle)) {
    throw new Error('Missing billing-anchored AI quota safeguard: ' + label);
  }
};

for (const [needle, label] of [
  ['private.individual_ai_quota_window', 'private quota-window helper'],
  ["'calendar_utc'", 'Free/calendar quota source'],
  ["'stripe_monthly'", 'monthly Stripe quota source'],
  ["'stripe_annual_month'", 'annual monthly subwindow source'],
  ["generate_series(0, 11)", 'annual plan uses twelve anchor-derived subwindows'],
  ['current_period_start', 'Stripe period start is authoritative'],
  ['current_period_end', 'Stripe period end is authoritative'],
  ["paid_quota_period_unavailable", 'paid quota fails closed without billing period'],
  ["paid_quota_period_out_of_range", 'stale paid quota period fails closed'],
  ['from private.individual_ai_quota_window(p_user_id, now())', 'lesson reservation uses helper'],
  ['from private.individual_ai_quota_window(p_user_id, now()) q', 'revision reservation uses helper'],
  ['from private.individual_ai_quota_window(v_user_id, now()) q', 'quota read uses helper'],
  ['revoke execute on function public.reserve_lesson_generation()', 'legacy lesson reservation wrapper retired'],
  ['revoke execute on function public.reserve_revision_operation(text)', 'legacy revision reservation wrapper retired'],
]) requireText(needle, label);

if (!migration.includes("v_window_start := v_calendar_start;")
    || !migration.includes("v_window_end := v_calendar_end;")) {
  throw new Error('Organization shared quota must remain UTC-calendar based.');
}

console.log('Billing-anchored individual AI quota safeguards verified.');
