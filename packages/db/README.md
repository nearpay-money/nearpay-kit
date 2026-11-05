# @nearpay-internal/db

Postgres helpers on Kysely + pg: exact numeric types, transactions with retry, migrations, transactional outbox and relay, inbox, idempotency keys, jobs, advisory-lock leadership, envelope encryption, retention.

- `createDb({url | urlFile})` (int8 → bigint, numeric → string), `withTx(db, fn, {isolation})`
- `migrate(db, dir)` (kit tables first, advisory lock, checksums, drift), `migrationStatus`
- Outbox: `emit(tx, event)` (spec-validated), `startOutboxRelay`, `relayOnce`, `outboxLagSeconds`; inbox `consume(tx, eventId)`
- `withIdempotency`, `idempotencyStore(db, cipher)` (for `@nearpay-internal/service`), `requestHash`
- Jobs: `enqueueJob`, `startJobWorker`, `runDueJobs`, `jobsDue`; `advisoryLeader`; `createEnvelopeCipher`, `loadKek`; `purgeKitTables`, `recordDeadLetter`, `deadLettersOpen`
- Re-exports `sql`, `Kysely` and its table types so services use the kit's copy

Design: `nearpay-brain/lld/00-foundations.md` (foundations §7). Part of `nearpay-kit`; no domain rules (ADR-0001).
