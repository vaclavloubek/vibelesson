# Syllonaut Live Control Plane

Independent continuity plane for already-running lessons.

Cloudflare setup:
1. Enable Workers Paid.
2. Run `npx wrangler@4.133.0 login`.
3. Set `BOOTSTRAP_SECRET` and `CAPABILITY_SECRET` with `wrangler secret put`.
4. Deploy with `npx wrangler@4.133.0 deploy`.
5. Route `live.syllonaut.com` to this Worker.
6. Set matching Vercel Production variables:
   - `LIVE_CONTROL_PLANE_URL=https://live.syllonaut.com`
   - `LIVE_CONTROL_PLANE_BOOTSTRAP_SECRET`
   - `LIVE_CONTROL_PLANE_CAPABILITY_SECRET`

Until all three Vercel variables exist, Cloudflare failover is dormant and the current Supabase/Vercel live path remains primary.
