# Syllonaut Live Resilience

This runbook describes the fault-tolerant live lesson architecture.

## Failure model

A running lesson should continue through:

- transient failures of the primary database or auth (Neon Postgres, Neon Auth) behind the Vercel API;
- transient Vercel API failures after the live page is already loaded;
- Wi-Fi/mobile connectivity loss on an individual student device;
- a browser refresh while the previously loaded live shell is cached;
- Cloudflare Live Control failure while the primary Vercel/Neon path is healthy.

A total loss of all network connectivity cannot synchronize different devices. In that case Syllonaut keeps the last known lesson state and durable local drafts/outbox until connectivity returns.

## P0 — bounded primary path

- Clients follow the live state by polling the primary Vercel API; when P2 is enabled, the Cloudflare Live Control WebSocket pushes changes sooner. There is no database Realtime subscription (Supabase Realtime was retired with the move to Neon on 2026-09-23).
- Teacher navigation uses compare-and-set protection.
- Live requests have bounded timeouts.
- Student and teacher refreshes are single-flight.

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
- transactional reconciliation back to the primary database (Neon);
- Cloudflare is optional and feature-flagged: missing configuration leaves the primary architecture unchanged.

### Cloudflare account

Use Workers Paid.

The Worker is intentionally independent from Vercel and Neon so an outage of the primary provider does not also remove the fallback control plane.

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

If any of these three variables is absent, P2 stays disabled and the normal Vercel/Neon path continues to operate.

### Activation order

1. Merge and deploy P0/P1/P2 code with the P2 environment variables absent.
2. Deploy the Cloudflare Worker.
3. Verify `GET /health`.
4. Add the two secrets and Worker URL to Vercel Preview.
5. Run the chaos test matrix below in Preview.
6. Add the same integration variables to Vercel Production.
7. Start a new test session; existing sessions created before activation may not have a bootstrapped Durable Object.

### Data reconciliation

The primary database (Neon) contains:

- `sessions.live_control_revision`;
- `reconcile_live_control_snapshot(session_id, snapshot)` and its internal `reconcile_live_control_snapshot_impl`.

The teacher control room periodically calls `POST /api/sessions/<id>/live-control/reconcile` after the primary service recovers. The route fetches the Worker snapshot and calls `reconcile_live_control_snapshot` with the teacher's own Data API token. The function is `SECURITY DEFINER`, executable only by `authenticated`, checks that `auth.uid()` owns the session and serializes reconciliation with a transaction-scoped advisory lock (neon/migrations/0009 lets the live-write triggers through only for that path).

The older event-based `reconcile_live_control_events(session_id, events)` from the Supabase era had no callers and was dropped by neon/migrations/0020 on 2026-09-25.

Snapshot reconciliation (`reconcile_live_control_snapshot`) copies the Worker's timer into `sessions.timer_*`, so the Worker must mirror the primary API's timer semantics exactly. Since Worker 0.8.16, `session.start` and navigation onto a `timer` block set the snapshot timer to `{ status: 'idle', startedAt: null, remainingSeconds: durationMinutes * 60 }` (`idleTimerFor`); only non-timer blocks get `timer: null`. Before 0.8.16 the Worker set `null` for every block, reconciliation wrote `timer_remaining_seconds = NULL`, and teacher and students saw 0:00 on the timer block (live lesson on 2026-09-24, block 8). `verify-live-resilience` guards both call sites.

### Privacy

P2 temporarily processes participant display names, lesson content and student/team answers in Cloudflare Durable Objects. Since Worker 0.8.15 every `LiveSession` stub is obtained from `env.LIVE_SESSION.jurisdiction('eu')`, so the objects run and store data only in the Cloudflare EU jurisdiction. The stateless entry Worker still handles requests in the nearest Cloudflare data centre, and Cloudflare logs object IDs outside the EU for billing and debugging. Objects created before 0.8.15 outside the EU were not migrated; they are deleted by their retention alarm 7 days after the session's last activity (`LIVE_RETENTION_MS`). The same name maps to a different ID in the EU jurisdiction, so a session active during the switch must be re-bootstrapped from the primary database (the teacher `/api/sessions/<id>/live-control` route does this). The Privacy Notice (section 8) and the DPA sub-processor list describe this processing, the EU jurisdiction and the 7-day retention.

Since Worker 0.8.17 a student capability reads only its own projection of the snapshot: `GET /state` returns the student's own participant row and answers, their own team's answer (without teammates' participant IDs), the blocks up to the active one (none in the lobby), `lessonSnapshot.totalBlocks`, team `memberCount` and an empty `events` array. The WebSocket sends student sockets only `{ type: 'wake', revision }`; the student client re-reads `/state` on any message. Teacher and presenter capabilities keep the full snapshot, event replay and event messages. `scripts/verify-live-student-projection.mjs` runs the real Worker against node:sqlite and guards this.

## Chaos test matrix

Run on a disposable Preview session, never by load-testing production.

### A. Live Control push channel (WebSocket) unavailable

Expected:

- teacher can advance blocks;
- students update through polling;
- no save operation waits for the push channel.

### B. Primary student API (`/api/student/*`) unavailable

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

- normal Vercel/Neon path continues;
- Cloudflare failures never block a successful primary operation.

### G. Primary returns after Cloudflare fallback

Expected:

- reconciliation processes fallback events in revision order;
- `next/previous` do not execute twice;
- fallback individual/team answers appear in the primary database (Neon);
- submitted answers are queued for normal grading;
- subsequent polling returns the reconciled primary state.

## Release gate

Do not call P2 production-ready until A–G pass with a real teacher browser plus multiple student browsers/devices.
