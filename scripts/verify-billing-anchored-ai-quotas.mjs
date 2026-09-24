import fs from 'node:fs';

const migration = fs.readFileSync(
  'supabase/migrations/20260920080000_anchor_individual_ai_quotas_to_billing_period.sql',
  'utf8',
);
const quotaMetadataMigration = fs.readFileSync(
  'supabase/migrations/20260921040634_expose_ai_quota_window_on_primary_rpc.sql',
  'utf8',
);
const pricing = fs.readFileSync('components/PricingPage.tsx', 'utf8');
const accountMenu = fs.readFileSync('components/PublicHeaderAccountMenu.tsx', 'utf8');
const subscriptionPage = fs.readFileSync('app/subscription/page.tsx', 'utf8');
const subscriptionManagement = fs.readFileSync('components/SubscriptionManagement.tsx', 'utf8');

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

for (const [needle, label] of [
  ['quota_window_start timestamptz', 'quota RPC exposes authoritative window start'],
  ['quota_window_end timestamptz', 'quota RPC exposes authoritative window end'],
  ['quota_source text', 'quota RPC exposes authoritative reset source'],
  ["v_quota_source := 'calendar_utc'", 'organization quota identifies calendar-month source'],
  ['q.window_start, q.window_end, q.quota_source', 'individual quota metadata comes from the same private window helper'],
  ['grant execute on function public.get_ai_quota() to authenticated, service_role', 'primary quota RPC retains explicit authenticated access'],
  ['drop function public.get_ai_quota_v2()', 'temporary extra RPC is removed after primary RPC migration'],
]) {
  if (!quotaMetadataMigration.includes(needle)) {
    throw new Error('Missing quota reset metadata safeguard: ' + label);
  }
}

if (pricing.includes('Limity se obnovují každý kalendářní měsíc.')
    || pricing.includes('Allowances reset every calendar month.')) {
  throw new Error('Pricing must not claim that every plan resets on a calendar month.');
}

for (const [needle, label] of [
  ['U Free se limity tvorby obnovují na začátku kalendářního měsíce', 'Pricing identifies Free calendar-month reset'],
  ['u Teacher a Teacher Pro podle fakturačního cyklu', 'Pricing identifies paid individual billing-cycle reset'],
  ['u ročního předplatného po měsíčních intervalech od data začátku předplatného', 'Pricing explains annual monthly subwindows'],
  ['U Team, School a Campus se společné AI kvóty pracovního prostoru školy / organizace obnovují na začátku každého kalendářního měsíce.', 'Pricing identifies organization calendar-month reset'],
]) {
  if (!pricing.includes(needle)) throw new Error('Missing Pricing reset copy: ' + label);
}

for (const [source, needle, label] of [
  [accountMenu, 'quota_window_end', 'account menu reads authoritative reset date'],
  [accountMenu, 'Obnova AI limitu:', 'account menu displays Czech reset label'],
  [accountMenu, 'AI allowance resets:', 'account menu displays English reset label'],
  [subscriptionPage, "supabase.rpc('get_ai_quota')", 'Subscription page loads the authoritative quota RPC'],
  [subscriptionPage, 'quotaWindow={quotaWindow}', 'Subscription page passes the quota reset to management UI'],
  [subscriptionManagement, "ui('Obnovení AI limitu', 'AI allowance reset')", 'Subscription UI displays the next AI allowance reset'],
]) {
  if (!source.includes(needle)) throw new Error('Missing quota reset UI safeguard: ' + label);
}

const planOverrides = fs.readFileSync('neon/migrations/0013_expiring_plan_overrides.sql', 'utf8');
const hourlyCron = fs.readFileSync('app/api/cron/neon-grading/route.ts', 'utf8');
for (const [source, needle, label] of [
  [planOverrides, 'add column if not exists plan_code text references public.billing_plans(code)', 'override can grant an individual plan'],
  [planOverrides, 'meo.expires_at is null or meo.expires_at > now()', 'expired override plan is ignored'],
  [planOverrides, 'v_override_plan.access_rank > v_plan.access_rank', 'override plan never downgrades a paid plan'],
  [planOverrides, 'private.effective_billing_plan(p.id, true)', 'recompute starts from the live billing plan, not a stale override plan'],
  [planOverrides, "refusing to patch", 'quota-window patch aborts on catalog drift'],
  [planOverrides, 'delete from public.manual_entitlement_overrides', 'expired overrides are removed'],
  [hourlyCron, 'private.expire_manual_entitlement_overrides()', 'hourly cron ends expired plan overrides'],
]) {
  if (!source.includes(needle)) throw new Error('Missing expiring plan override safeguard: ' + label);
}

console.log('Billing-anchored individual AI quota safeguards and customer-facing reset timing verified.');
