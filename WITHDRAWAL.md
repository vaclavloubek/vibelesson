# Consumer withdrawal — LEGAL-008

Method: `time-pro-rata-v1`. The dispatch time from the retained original notice determines whether the consumer exercised the right within 14 days. The receipt time is when the notice reaches the provider, never when an administrator processes it, and it determines how much service was supplied. Both timestamps and the notice SHA-256 are immutable evidence. Consumer status and statutory exceptions still require review. An absent snapshot or an unusual payment history does not reject the legal withdrawal.

## Monetary calculation

Retained amount = floor(total agreed price in minor units × elapsed supplied time / actual paid-period duration). Refund entitlement = agreed price minus retained amount. Additional refund = max(0, entitlement minus previous refunds). Calculation uses integer milliseconds and integer arithmetic; no started-day minimum, flat 30-day month, 365-day annual assumption, or AI-usage adjustment. No evidenced immediate-start request or prior disclosure means zero retained amount.

The original contract amount is compared to the original paid invoice, server payment ledger and canonical Stripe Charge. Price differences, multiple payments, upgrades, schedules, pending updates and incomplete records require individual review. They must not silently substitute the current plan or most recent invoice. For a tariff change, reconstruct the agreed periods and credit/debit allocations first; do not add the full upgraded price to the original price. No automatic rejection of the withdrawal or AI-usage surcharge is permitted.

The activation email's server ledger entry is created after entitlement provisioning. Using the later of this entry, payment confirmation and paid-period start deliberately waives any preceding time in the consumer's favour. The event ID and timestamp used are retained in the calculation. Missing activation evidence requires review.

## Operations

Use `/admin/withdrawals` as the existing superadmin. Preserve the original notice in the legal case archive, calculate its SHA-256, record its evidenced dispatch and receipt times, verify the account and contract snapshot, and confirm consumer/withdrawal eligibility. Register the receipt, prepare the calculation, review the displayed amount, then execute. Consumers can withdraw online within the 14-day period from subscription management or `/withdrawal` (LEGAL-012, LEGAL-020). The system atomically records the notice with its exact content and server time as the receipt and immediately sends a durable confirmation email; the operator then continues from the calculation step. Notices sent by email are still registered manually. `/admin/withdrawals` is the internal processing interface for both.

Receipt registration and preparation never move money. Execution requests and reconciles the refund against the original payment, then cancels the specific subscription immediately without another Stripe invoice or Stripe proration. Cancellation and refund webhooks retain their existing authority over entitlements and payment state. `pending` is not a completed refund. Signed refund lifecycle events re-fetch the canonical refund and reconcile its status with the stored payment, amount, currency and withdrawal identity. Failed/canceled/requires_action refunds require attention.

A single immutable receipt exists per contract snapshot. A separate immutable calculation preserves the original inputs. A service-only execution lease excludes concurrent workers. Retries use the same Stripe idempotency key and amount, and first look for an existing refund carrying the withdrawal ID. Automated retry stops after 23 hours from the first attempt: investigate the original Stripe operation before any manual recovery; do not generate a fresh key. Never separately refund the same case through Stripe while it is processing. Previously issued refunds must be reconciled before resuming.

## Verification / rollout

Run `npm run check`, `npm run build`, accessibility and security-header checks. `scripts/verify-withdrawal-database.mjs` accepts the path to a locally installed PGlite module for isolated PostgreSQL checks; it never connects to production.

Apply the additive evidence migration and backward-compatible VOP 1.2 migration before deploying the new build. Old v1/v2 acceptance keys remain supported during rollout; prior evidence is not rewritten. Check actual function grants and RLS after migration (production database: Neon; `scripts/neon/security-audit.mjs`). Verify Preview before merge and the exact Production commit afterwards. No live refund or synthetic paid purchase is needed for regression checks.

Status: LEGAL-008 is RESOLVED (0.9.88) and the online withdrawal function LEGAL-020 is RESOLVED (0.9.103); see the legal audit in PROJECT.md. After the Czech § 1830a of the Civil Code is adopted, compare the online function with its final wording.
