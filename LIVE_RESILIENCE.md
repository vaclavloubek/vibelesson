# Syllonaut Live Resilience

This runbook describes the fault-tolerant live lesson architecture.

## Failure model

A running lesson should continue through:

- Supabase Realtime degradation;
- transient Supabase Edge Function/API failures;
- transient Vercel API failures after the live page is already loaded;
- Wi-Fi/mobile connectivity loss on an individual student device;
- a browser refresh while the previously loaded live shell is cached;
- Cloudflare Live Control failure while the primary Vercel/Supabase path is healthy.

A total loss of all network connectivity cannot synchronize different devices. In that case Syllonaut keeps the last known lesson state and durable local drafts/outbox until connectivity returns.

## P0 — bounded primary path

- Realtime invalidation is non-blocking.
- Teacher navigation uses compare-and-set protection.
- Live requests have bounded timeouts.
- Student and teacher refreshes are single-flight.
- Realtime is an accelerator; polling remains a fallback.

## P1 — local-first browser resilience

- Service Worker caches previously loaded live pages and Next.js static assets.
- IndexedDB stores the last student state.
- IndexedDB outbox stores unsent individual responses.
- Team drafts are mirrored to IndexedDB.
- The primary UI remains usable with the last known state while reconnecting.

## P2 — independent Cloudflare Live Control Plane

Location: `cloudflare/live-control`.

One SQLite-backed Durable Object coordinates one live session.

Properties:

- HMAC-signed short-lived teacher/student capabilities;
- monotonic event revisions;
- idempotent operation IDs;
- event replay after reconnect;
- WebSocket Hibernation wake-ups;
- durable fallback student/team answers;
- transactional reconciliation back to Supabase;
- Cloudflare is optional and feature-flagged: missing configuration leaves the primary architecture unchanged.

### Cloudflare account

Use Workers Paid.

The Worker is intentionally independent from Vercel and Supabase so an outage of the primary provider does not also remove the fallback control plane.

### Required Cloudflare secrets

Set in the Worker:

```sh
cd cloudflare/live-control
npm install
npx wrangler secret put LIVE_BOOTSTRAP_SECRET
npx wrangler secret put LIVE_CAPABILITY_SECRET
npx wrangler deploy
```

Use cryptographically random values. Never commit them.

### Required Vercel environment variables

Set for Production and the intended Preview environment:

- `SYLLONAUT_LIVE_CONTROL_URL` — deployed Worker URL, preferably a dedicated hostname such as `https://live.syllonaut.com`;
- `LIVE_BOOTSTRAP_SECRET` — exactly the same value as the Worker secret;
- `LIVE_CAPABILITY_SECRET` — exactly the same value as the Worker secret.

Browser capabilities default to 8 hours so they cover the product's maximum six-hour lesson plus recovery margin.

If any of these three variables is absent, P2 stays disabled and the normal Vercel/Supabase path continues to operate.

### Activation order

1. Merge and deploy P0/P1/P2 code with the P2 environment variables absent.
2. Deploy the Cloudflare Worker.
3. Verify `GET /health`.
4. Add the two secrets and Worker URL to Vercel Preview.
5. Run the chaos test matrix below in Preview.
6. Add the same integration variables to Vercel Production.
7. Start a new test session; existing sessions created before activation may not have a bootstrapped Durable Object.

### Data reconciliation

Supabase contains:

- `sessions.live_control_revision`;
- `reconcile_live_control_events(session_id, events)`.

The reconciliation RPC is executable only by `authenticated`, checks that `auth.uid()` owns the session, processes monotonically contiguous event revisions in one transaction, ignores primary-mirrored events, and applies fallback events.

The teacher control room calls reconciliation periodically after the primary service recovers.

### Privacy

P2 temporarily processes participant display names, lesson content and student/team answers in Cloudflare Durable Objects. Before public production activation, confirm that privacy documentation and processor/subprocessor records accurately describe this processing and its retention.

## Chaos test matrix

Run on a disposable Preview session, never by load-testing production.

### A. Realtime unavailable

Expected:

- teacher can advance blocks;
- students update through polling;
- no save operation waits indefinitely for Realtime.

### B. Supabase student Edge Function unavailable

Expected:

- already connected student remains in the lesson;
- individual answer is stored in IndexedDB and, if Cloudflare is reachable, in Live Control;
- team answer is stored in Live Control or durable local draft;
- UI reports degraded mode rather than a crash.

### C. Primary Vercel live API unavailable after pages are loaded

Expected:

- teacher controls continue through Cloudflare;
- student state continues through Cloudflare;
- answers continue through Cloudflare;
- operation IDs prevent double navigation when the primary request had an unknown outcome.

### D. Student device offline

Expected:

- last lesson state remains visible;
- individual response is queued locally;
- team draft survives refresh/reopen through IndexedDB;
- reconnect flushes the outbox.

### E. Refresh during primary outage

Expected:

- previously loaded live page is served by Service Worker;
- existing session-scoped Cloudflare capability in sessionStorage restores teacher/student live state;
- a brand-new tab/device during a total Vercel outage is not guaranteed to join.

### F. Cloudflare unavailable

Expected:

- normal Vercel/Supabase path continues;
- Cloudflare failures never block a successful primary operation.

### G. Primary returns after Cloudflare fallback

Expected:

- reconciliation processes fallback events in revision order;
- `next/previous` do not execute twice;
- fallback individual/team answers appear in Supabase;
- submitted answers are queued for normal grading;
- subsequent polling returns the reconciled primary state.

## Release gate

Do not call P2 production-ready until A–G pass with a real teacher browser plus multiple student browsers/devices.
