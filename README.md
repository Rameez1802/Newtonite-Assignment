# Newtonite Ops — operational work coordination (React + Vite + Tailwind)

## Run
```bash
npm install
npm run dev     
```
Node 18+. No backend setup needed: `src/server.js` is an in-process server (rules, RBAC, versioning, audit, outbox) behind an async JSON API facade with latency. Data resets on reload.

## Try this
1. Pick a work item → **Take ownership**. Click *"Simulate a colleague claiming this"* first, then take ownership: you get a conflict, the optimistic UI rolls back, the latest state loads.
2. Tick **Simulate flaky network** and act repeatedly: requests/responses get lost; retries reuse an idempotency key, so nothing is applied twice.
3. Switch **Acting as** to *Dev Roy (viewer)*: controls disappear AND the server rejects calls (see tests). Switch to *Eva (exec)* (lead everywhere) to approve `needs approval` items.
4. Notifications are produced by an async at-least-once outbox worker (every 4s) with deduplication; failures retry.

## Roles (per team)
viewer: read · member: create, comment, claim, work own items · lead: also assign, change any item, approve (`needs_approval → resolved`).

## Known limitations
- Server is simulated in the browser (no real DB/network/auth); state is in memory. A real build would use Postgres (row `version` column, `UNIQUE(idempotency_key)`, GIN/tsvector search, keyset pagination) and a queue/worker.
- List pagination is offset-based and computes attention reasons per request; at scale use indexed/materialised attention flags and keyset cursors.
- Detail view polls every 5s; production should use SSE/WebSockets. No real login. No edit of title/description, attachments, SLA configuration, or notification preferences. Tests cover server rules only, not UI.
