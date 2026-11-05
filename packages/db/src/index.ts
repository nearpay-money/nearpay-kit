/** @nearpay-internal/db — Postgres helpers (lld/00-foundations.md §4, §7). */

/** Kysely, re-exported so services build queries with the same copy the kit uses. */
export {
  type ColumnType,
  type Generated,
  type Insertable,
  Kysely,
  type Selectable,
  sql,
  type Transaction,
  type Updateable,
} from "kysely";
export { createDb, type Database, type DbOptions } from "./connect.js";
export { createEnvelopeCipher, type EnvelopeCipher, loadKek, parseKek } from "./crypto.js";
export {
  canonicalJson,
  IdempotencyConflict,
  type IdempotencyContext,
  type IdempotencyStoreScope,
  idempotencyStore,
  requestHash,
  type StoredResponse,
  withIdempotency,
} from "./idempotency.js";
export { consume } from "./inbox.js";
export {
  type EnqueueInput,
  enqueueJob,
  type JobContext,
  type JobHandler,
  jobBackoffMs,
  jobsDue,
  runDueJobs,
  startJobWorker,
  type WorkerOptions,
} from "./jobs.js";
export { advisoryLeader, type LeaderOptions } from "./leader.js";
export { deadLettersOpen, purgeKitTables, RETENTION, recordDeadLetter } from "./maintenance.js";
export { type MigrationStatus, migrate, migrationStatus } from "./migrate.js";
export {
  type EmitInput,
  type Envelope,
  emit,
  outboxLagSeconds,
  type Publish,
  relayOnce,
  startOutboxRelay,
} from "./outbox.js";
export { KIT_MIGRATIONS, type KitTables } from "./tables.js";
export {
  deadLetterSink,
  inboxHandler,
  jobWorkerTask,
  leaderTask,
  outboxRelayTask,
  type RecurringJob,
  recurringJobsTask,
  recurringSlot,
  type Task,
} from "./tasks.js";
export { type Isolation, withTx } from "./tx.js";
