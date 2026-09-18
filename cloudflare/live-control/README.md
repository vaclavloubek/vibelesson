# Syllonaut Live Control Plane

Independent Cloudflare Workers + Durable Objects control plane for fault-tolerant live lessons.

## Goals

- a running lesson must not depend synchronously on Vercel, Supabase Realtime, or Supabase API availability;
- one SQLite-backed Durable Object coordinates one live session;
- every mutation carries an idempotency `operationId`;
- every accepted event receives a monotonic `revision`;
- reconnecting clients can request events after their last known revision;
- WebSocket Hibernation keeps realtime wake-ups inexpensive;
- Supabase remains the long-term source of record after reconciliation.

## Secrets

Set with Wrangler, never commit their values:

```sh
npx wrangler secret put LIVE_BOOTSTRAP_SECRET
npx wrangler secret put LIVE_CAPABILITY_SECRET
```

The Next.js application must use the same capability signing secret when minting short-lived session-scoped teacher/student capabilities.

## Endpoints

- `GET /health`
- `POST /v1/sessions/:id/bootstrap` — server-only, bootstrap/update durable snapshot
- `GET /v1/sessions/:id/state?after=<revision>` — capability-authenticated snapshot + replay
- `POST /v1/sessions/:id/events` — capability-authenticated idempotent event
- `GET /v1/sessions/:id/ws` — capability-authenticated Hibernation WebSocket

This directory is intentionally deployable independently from Vercel.
