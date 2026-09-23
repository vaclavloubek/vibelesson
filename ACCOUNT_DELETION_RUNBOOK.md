# Account deletion runbook

This runbook implements Terms article 11 (Terms 1.6, LEGAL-016). The app has no self-service account deletion; every deletion request is handled manually by the provider. Never delete an account while a paid renewal for it can still charge the user.

## 1. Verify the request

Accept the request only from the account's own email address, or confirm it from that address before acting. Record the request date and the account ID. Do not delete anything yet.

## 2. Check paid plans and organisations

On the production Neon database (read-only queries):

```sql
select plan_code, status, cancel_at_period_end, current_period_end, livemode, external_subscription_id
from public.billing_subscriptions
where user_id = '<account-id>' and status not in ('canceled', 'incomplete_expired');

select m.organization_id, m.role, o.status, o.renewal_mode, o.current_period_end
from public.organization_memberships m
join public.organizations o on o.id = m.organization_id
where m.user_id = '<account-id>' and m.status = 'active';
```

## 3. Inform the user and offer to keep the account

If a paid period is still running, reply before deleting: deleting the account also ends access to the rest of the paid period, and the user may instead keep the account until `current_period_end`. Mention that statutory rights are unaffected: withdrawal within 14 days (`WITHDRAWAL.md`) and the service-change rights in article 10. Wait for the user's answer.

## 4. End automatic renewal before deletion

- **Individual subscription:** in Stripe (matching `livemode`), cancel the subscription `external_subscription_id` so that no further invoice can be created. If the user keeps access until the period end, set cancel at period end and schedule the deletion for after `current_period_end`. Do not refund unless a withdrawal or an article 10 claim applies; handle those through their own workflows.
- **Organisation owner:** transfer ownership to another active administrator (`/api/organizations/owner`). If there is none, ask the organisation and, at its request, turn off automatic renewal of the school licence (card) or do not issue further renewal invoices (invoice).
- Re-run the queries from step 2. Continue only when no active subscription with automatic renewal remains and the account owns no active organisation.

## 5. Delete the account

Delete the account data according to the Privacy Notice. Legal evidence stays as described there: Terms acceptance audit, contract snapshots, withdrawal and refund records are not cascade-deleted and are retained only as long as the Privacy Notice allows.

## 6. Confirm by email

From the support mailbox, confirm to the user that the account was deleted, and state whether and when automatic renewal was ended. Keep the confirmation with the request record.
