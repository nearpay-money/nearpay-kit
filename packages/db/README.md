# @nearpay-internal/db

Postgres helpers on Kysely + pg: exact numeric types, transactions with retry, migrations, transactional outbox and relay, inbox, idempotency keys, jobs, advisory-lock leadership, envelope encryption, retention.

- `createDb({url | urlFile})` (int8 → bigint, numeric → string), `withTx(db, fn, {isolation})`
- `migrate(db, dir)` (kit tables first, advisory lock, checksums, drift), `migrationStatus`
- Outbox: `emit(tx, event)` (spec-validated), `startOutboxRelay`, `relayOnce`, `outboxLagSeconds`; inbox `consume(tx, eventId)`
- `withIdempotency`, `idempotencyStore(db, cipher)` (for `@nearpay-internal/service`), `requestHash`
- Jobs: `enqueueJob`, `startJobWorker`, `runDueJobs`, `jobsDue`; `advisoryLeader`; `createEnvelopeCipher`, `loadKek`; `purgeKitTables`, `recordDeadLetter`, `deadLettersOpen`
- Consumers and background tasks: `inboxHandler(db, fn)`, `deadLetterSink`, `outboxRelayTask`, `jobWorkerTask`, `leaderTask`, `recurringJobsTask` (hourly/daily jobs, one per slot)
- **0.6.0 (backend audit 2026-11-12):**
  - KIT-5: the pool has a 5 s connect / pool-wait timeout, TCP keepalive and a 60 s server-side
    `idle_in_transaction_session_timeout` (`connectionTimeoutMs`, `keepAlive`, `idleInTransactionTimeoutMs`); the
    leadership heartbeat must answer within `heartbeatTimeoutMs` (default 2 × heartbeat) or leadership is given up; a term
    shorter than `retryMs` is followed by `retryMs` (+ jitter) before competing again.
  - KIT-4: `outboxRelayTask` (120 s), `jobWorkerTask` (max(3 × lease, 120 s)), `leaderTask` (max(12 × heartbeat, 60 s),
    followers idle) and `recurringJobsTask` (max(3 × tick, 60 s), `livenessFrom: "run"`) declare `maxSilenceMs` and beat the
    heartbeat the service hands to `start`; `maxSilenceMs: false` opts out. `advisoryLeader` passes `beat` to `run`.
  - KIT-6: kit migration `0000_kit_outbox_attempts` adds `outbox.attempts/last_error/first_failed_at`; `relayOnce` counts
    failures per row and moves a `poison` row (payload too large, invalid subject) after `maxAttempts` (5), or an
    `unroutable` one (no stream) after 5 attempts _and_ 5 min of failing, to `dead_letters` (source `outbox`) and carries on;
    transient errors never dead-letter. `classifyPublishError`, `deadLetter` policy, `onDeadLetter` (default
    `ALERT outbox_dead_lettered` through `onError`).
  - KIT-7: `listDeadLetters`, `getDeadLetter`, `replayDeadLetter` (consumer → handler through the inbox; outbox → requeue
    under the event id; job → re-arm; custom `sources`), `dropDeadLetter`, `pendingOutbox`, `skipOutboxRow`,
    `requeueOutboxEnvelope`, and the CLI building block `runKitOps(db, "dead-letters" | "outbox", args, {actor, handlers})`
    with `DEAD_LETTER_USAGE`. `dead_letters` gains `resolution`, `resolved_by`, `resolution_note`.
- Re-exports `sql`, `Kysely` and its table types so services use the kit's copy

Design: `nearpay-brain/lld/00-foundations.md` (foundations §7). Part of `nearpay-kit`; no domain rules (ADR-0001).
