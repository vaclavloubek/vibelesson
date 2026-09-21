import { readFile } from 'node:fs/promises';
import { billingRouteForCountry } from '../lib/billing-region.ts';
import { INDIVIDUAL_PLAN_ALLOWANCES } from '../lib/individual-billing-catalog.ts';
import {
  billingLifecycleNotification,
  renderBillingLifecycleEmail,
} from '../lib/billing-email-core.ts';
import { normalizeStripeSubscriptionEvent } from '../lib/stripe-webhook.ts';

function assert(condition, message) {
  if (!condition) throw new Error(`Billing lifecycle email regression: ${message}`);
}

async function source(path) {
  return readFile(new URL(`../${path}`, import.meta.url), 'utf8');
}

function subscriptionEvent({
  id,
  type = 'customer.subscription.updated',
  livemode = true,
  status = 'active',
  cancelAtPeriodEnd = false,
  previousAttributes,
}) {
  return {
    id,
    type,
    livemode,
    data: {
      ...(previousAttributes ? { previous_attributes: previousAttributes } : {}),
      object: {
        id: 'sub_email001',
        object: 'subscription',
        customer: 'cus_email001',
        metadata: {
          syllonaut_user_id: '123e4567-e89b-42d3-a456-426614174000',
          syllonaut_billing_country: 'CZ',
        },
        managed_payments: { enabled: false },
        status,
        cancel_at_period_end: cancelAtPeriodEnd,
        canceled_at: status === 'canceled' ? 1_800_000_000 : null,
        items: {
          data: [{
            price: { id: 'price_email001', currency: 'czk' },
            current_period_start: 1_799_900_000,
            current_period_end: 1_802_500_000,
          }],
        },
      },
    },
  };
}

const activated = normalizeStripeSubscriptionEvent(
  subscriptionEvent({ id: 'evt_email_activate', type: 'customer.subscription.created' }),
  billingRouteForCountry,
);
assert(activated, 'active created subscription must normalize');
assert(
  billingLifecycleNotification(activated) === 'subscription_activated',
  'active LIVE subscription creation must trigger activation email',
);

const scheduled = normalizeStripeSubscriptionEvent(
  subscriptionEvent({
    id: 'evt_email_cancel_scheduled',
    cancelAtPeriodEnd: true,
    previousAttributes: { cancel_at_period_end: false },
  }),
  billingRouteForCountry,
);
assert(scheduled?.previousCancelAtPeriodEnd === false, 'previous cancel state must be preserved');
assert(
  scheduled && billingLifecycleNotification(scheduled) === 'cancellation_scheduled',
  'false → true cancel_at_period_end must trigger scheduled cancellation email',
);

const revoked = normalizeStripeSubscriptionEvent(
  subscriptionEvent({
    id: 'evt_email_cancel_revoked',
    cancelAtPeriodEnd: false,
    previousAttributes: { cancel_at_period_end: true },
  }),
  billingRouteForCountry,
);
assert(
  revoked && billingLifecycleNotification(revoked) === 'cancellation_revoked',
  'true → false cancel_at_period_end must trigger cancellation-revoked email',
);

const ended = normalizeStripeSubscriptionEvent(
  subscriptionEvent({
    id: 'evt_email_ended',
    type: 'customer.subscription.deleted',
    status: 'canceled',
  }),
  billingRouteForCountry,
);
assert(
  ended && billingLifecycleNotification(ended) === 'subscription_ended',
  'deleted LIVE subscription must trigger ended email',
);

const sandbox = normalizeStripeSubscriptionEvent(
  subscriptionEvent({
    id: 'evt_email_sandbox',
    type: 'customer.subscription.created',
    livemode: false,
  }),
  billingRouteForCountry,
);
assert(sandbox && billingLifecycleNotification(sandbox) === null, 'sandbox billing must never send lifecycle email');

const unrelated = normalizeStripeSubscriptionEvent(
  subscriptionEvent({
    id: 'evt_email_unrelated',
    previousAttributes: { metadata: { changed: true } },
  }),
  billingRouteForCountry,
);
assert(unrelated && billingLifecycleNotification(unrelated) === null, 'unrelated subscription update must not email');

const canceledMetadataUpdate = normalizeStripeSubscriptionEvent(
  subscriptionEvent({
    id: 'evt_email_canceled_metadata',
    status: 'canceled',
    previousAttributes: { metadata: { changed: true } },
  }),
  billingRouteForCountry,
);
assert(
  canceledMetadataUpdate && billingLifecycleNotification(canceledMetadataUpdate) === null,
  'metadata-only update on an already canceled subscription must not send another ended email',
);

const cs = renderBillingLifecycleEmail({
  notification: 'subscription_activated',
  locale: 'cs',
  planCode: 'teacher',
  currentPeriodEnd: '2026-10-19T12:00:00.000Z',
  allowance: INDIVIDUAL_PLAN_ALLOWANCES.teacher,
});
assert(cs.subject.includes('Teacher je aktivní'), 'Czech activation subject must be localized');
assert(cs.html.includes('#5b57e8'), 'email HTML must use the Syllonaut accent');
assert(cs.html.includes('Nejde o marketingové sdělení'), 'transactional nature must be explicit');

assert(
  cs.text.includes(`${INDIVIDUAL_PLAN_ALLOWANCES.teacher.lessonGenerations} nových AI lekcí a ${INDIVIDUAL_PLAN_ALLOWANCES.teacher.aiEdits} AI úprav`),
  'Teacher activation email must use the shared current AI allowance',
);

const csPro = renderBillingLifecycleEmail({
  notification: 'subscription_activated',
  locale: 'cs',
  planCode: 'teacher_pro',
  currentPeriodEnd: '2026-10-19T12:00:00.000Z',
  allowance: INDIVIDUAL_PLAN_ALLOWANCES.teacher_pro,
});
assert(
  csPro.text.includes(`${INDIVIDUAL_PLAN_ALLOWANCES.teacher_pro.lessonGenerations} nových AI lekcí a ${INDIVIDUAL_PLAN_ALLOWANCES.teacher_pro.aiEdits} AI úprav`),
  'Teacher Pro activation email must use the shared current AI allowance',
);

const en = renderBillingLifecycleEmail({
  notification: 'cancellation_scheduled',
  locale: 'en',
  planCode: 'teacher_pro',
  currentPeriodEnd: '2026-10-19T12:00:00.000Z',
  allowance: INDIVIDUAL_PLAN_ALLOWANCES.teacher_pro,
});
assert(en.subject.includes('cancellation is scheduled'), 'English cancellation subject must be localized');
assert(en.text.includes('Teacher Pro'), 'plan name must be included');

const [emailSource, emailCoreSource, pricingSource, routeSource, localeSource, authSource, migrationSource, envSource] = await Promise.all([
  source('lib/billing-email.ts'),
  source('lib/billing-email-core.ts'),
  source('components/PricingPage.tsx'),
  source('app/api/billing/stripe/webhook/route.ts'),
  source('components/LocaleSwitcher.tsx'),
  source('components/AuthControls.tsx'),
  source('supabase/migrations/20260919080000_add_billing_lifecycle_email_delivery.sql'),
  source('.env.example'),
]);

assert(emailSource.includes('RESEND_API_KEY'), 'Resend credential must remain server-only');
assert(!emailSource.includes('NEXT_PUBLIC_RESEND'), 'Resend secret must never be public');
assert(emailSource.includes('Idempotency-Key'), 'Resend sends must use an idempotency key');
assert(emailSource.includes('billing_email_deliveries'), 'delivery ledger must guard retries');
assert(!emailSource.includes('marketing_email_consent'), 'transactional billing email must not depend on marketing consent');
assert(emailSource.includes('INDIVIDUAL_PLAN_ALLOWANCES'), 'billing delivery must feed the shared AI allowance into the activation email');
assert(pricingSource.includes('INDIVIDUAL_PLAN_ALLOWANCES'), 'Pricing must read individual AI allowances from the shared catalog');
assert(!emailCoreSource.includes('60 new AI lessons and 250 AI edits'), 'stale Teacher Pro activation allowance must not return');
assert(!emailCoreSource.includes('25 new AI lessons and 100 AI edits'), 'stale Teacher activation allowance must not return');
assert(routeSource.includes('billingLifecycleNotification(sync)'), 'Stripe webhook must derive lifecycle transition after billing sync');
assert(routeSource.includes('billing_email_delivery_failed'), 'email delivery failures must request a Stripe webhook retry');
assert(localeSource.includes("supabase.rpc('set_ui_locale'"), 'explicit locale switch must persist user language');
assert(authSource.includes('ui_locale: locale'), 'signup must persist the initial UI locale');
assert(migrationSource.includes('enable row level security'), 'delivery ledger must use RLS');
assert(migrationSource.includes('revoke all on table public.billing_email_deliveries'), 'delivery ledger must not be client-readable');
const indexMigrationSource = await source('supabase/migrations/20260919081500_index_billing_email_deliveries_user.sql');
assert(indexMigrationSource.includes('billing_email_deliveries_user_id_idx'), 'delivery ledger user foreign key must have a covering index');
assert(envSource.includes('BILLING_EMAIL_FROM'), 'sender configuration must be documented');

console.log('Billing lifecycle email checks passed.');
