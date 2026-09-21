# Service change runbook

This runbook governs changes to continuously supplied Syllonaut digital services under the LEGAL-010 hybrid policy (`hybrid-v1`). It applies before a change is enabled for any paying user.

## 1. Classify the change

Record one valid reason: security, legal obligation, compatibility, supplier or infrastructure change, capacity, or demonstrable product improvement. Write the concrete user impact in Czech and English. A vague commercial preference is not sufficient.

Classify the change as one of:

- `conformity_or_security`: necessary to keep the service secure or conforming;
- `beneficial_or_minor`: beneficial, or adverse only in a minor way;
- `material_adverse`: negatively affects access to or use of the service in more than a minor way.

The change must not add a charge. Preserve the written classification, reason, impact, target plans, effective time, policy version and content hash in the release record.

## 2. Choose the delivery strategy

- `apply`: used for conformity, security, beneficial and minor changes.
- `grandfather`: the default for a material adverse change when the unchanged conforming version can remain safe. Preserve it at least through every affected user's current paid period without extra cost. The entitlement implementation must read and enforce `legacy_preserved_until` before the new behavior is enabled.
- `durable_notice`: used only when the unchanged version cannot safely and technically be maintained. Schedule the effective time at least 30 full days after publication.

Legal review is required if a material adverse change cannot meet either the grandfather or 30-day durable-notice path. An emergency security fix may still be applied to keep the service conforming, but it must not be mislabeled to avoid the material-change workflow.

## 3. Publish the release record

Use the authenticated superadmin endpoint `POST /api/admin/service-changes` from the production origin. Supply a unique lowercase `changeKey`, classification, reason code, bilingual reason and impact, offset-qualified effective timestamp, whether the legacy version is available, and the affected plan codes.

The server derives the strategy, hashes the canonical record, rejects an invalid combination, and creates one immutable delivery row for every affected live subscription or active organization. Do not enable the product change yet.

## 4. Deliver and verify notice

The daily `/api/cron/service-changes` job claims pending deliveries with a lease and sends bilingual email with a stable provider idempotency key. It stores hashes of the destination and complete notice, the provider message ID and the send time. For a material adverse change using durable notice, the termination deadline is 30 days after the later of delivery or implementation.

Before rollout, verify that all intended deliveries are `sent`. Investigate `failed` deliveries; the retry limit is five. Do not treat an email queued with the provider as legal evidence until the sent evidence was recorded in the database.

## 5. Roll out the product change

Enable the change no earlier than `effective_at`. For `grandfather`, keep routing affected users to the preserved version through `legacy_preserved_until`. For `durable_notice`, keep the notice and termination control visible on the Subscription page without requiring acceptance of new Terms.

Organizations receive the same operational notice standard. Their contract questions follow the organization support process; the statutory consumer termination action is offered only to individual consumers.

## 6. Termination and reimbursement

The consumer must explicitly confirm that paid access ends immediately. The server records the request before contacting Stripe, binds it to the delivered notice and live subscription, and calculates the unused prepaid share from the current paid invoice and exact paid-period timestamps. The retained amount is rounded down to the smallest currency unit; earlier refunds reduce the new refund. Usage and AI consumption never affect the amount.

The Stripe refund uses the original payment intent and a request-specific idempotency key. The subscription is then cancelled immediately. Signed Stripe refund events reconcile pending or final status. Any mismatch, unsupported subscription history, external refund, failed refund or failed cancellation is preserved as `needs_attention` for individual review; never edit the stored evidence manually.

## 7. Close the release

Retain the immutable release, recipient snapshot, notice hashes, provider message IDs, calculation evidence, Stripe refund ID and cancellation time. Confirm there are no overdue pending or failed deliveries and no unresolved `needs_attention` requests. Record the verified production commit and deployment in `PROJECT.md` only after database migration, CI, preview and production checks all pass.
