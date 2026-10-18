# Engineering decisions

**1. Rules live in a server module, behind an API boundary.** All authorization, workflow and conflict rules are in `server.js`; the UI only renders the `can` flags the server computes per item and is never trusted. The facade serialises through JSON with latency so the UI can't share references or assume instant success. *Trade-off:* simulated, not a real backend, to fit a one-day frontend-stack brief; the module's functions map 1:1 to REST endpoints and SQL transactions.

**2. Concurrency: optimistic versioning + atomic claim.** Every item has a `version`; mutations send the version they saw and get `409 conflict` with the current state otherwise. "Claim" is first-writer-wins: a second claimer is rejected even though their version was fresh. Comments never conflict (append-only, no version bump). The UI applies optimistic updates then reconciles: on conflict it rolls back and shows the server's state. A background poll shows a "someone changed this" banner rather than silently overwriting what you're reading.

**3. Idempotency keys per user intent.** The client generates one key per intent (create form open, a given action+args) and reuses it on retry. The server stores the first result and returns it for repeats, so a lost response + retry never duplicates items or audit events. *Trade-off:* keys are kept in memory forever here; production needs TTL storage scoped by user.

**4. Audit log + transactional outbox, async notifications.** Each state change appends an immutable event and an outbox row in the same step. A worker delivers notifications at-least-once; deliveries are deduped by `(event, recipient)` so retries/duplicates are harmless, and failures stay pending for retry. Primary actions never wait on notifications. *Not built:* dead-letter queue, backoff.

**5. Resource-level RBAC per team, and non-members can't even see items (404).** Roles are per user per team (viewer/member/lead), checked on every operation against the item's team, plus ownership rules (only owner or lead moves/edit; only leads approve or reassign). Workflow is an explicit state machine; illegal jumps are rejected server-side.

**Scale design:** list is server-side filtered, sorted by an "attention" score and paginated (20/page); the browser never holds the dataset. Search is debounced and out-of-order responses are discarded. **Intentionally not built:** real auth, DB, WebSockets, attachments, SLA config. **With another week:** Postgres + keyset pagination + FTS, SSE for live updates, Playwright tests, per-team SLA rules.
