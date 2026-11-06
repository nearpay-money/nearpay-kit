/**
 * Background-task wrappers and consumer glue (foundations §4: "consumers and jobs run as `background`
 * tasks"; §7–§8). Each `*Task` returns the `{name, start}` shape `@nearpay-internal/service` runs after
 * the listener is up and stops (in reverse) during the drain.
 */
import type { Kysely, Transaction } from "kysely";
import type pg from "pg";
import { consume } from "./inbox.js";
import { enqueueJob, type JobHandler, startJobWorker, type WorkerOptions } from "./jobs.js";
import { advisoryLeader, type LeaderOptions } from "./leader.js";
import { recordDeadLetter } from "./maintenance.js";
import { type Envelope, type Publish, startOutboxRelay } from "./outbox.js";
import { type Isolation, withTx } from "./tx.js";

/** Structural twin of `@nearpay-internal/service` `BackgroundTask` (no dependency on the service package). */
export interface Task {
  readonly name: string;
  start(): { stop(): Promise<void> } | Promise<{ stop(): Promise<void> }>;
}

/**
 * Consumer handler contract (foundations §8): in ONE transaction, record the event id in the inbox
 * (skip when seen), then apply. A thrown error rolls the inbox row back, so the redelivery runs again.
 */
export function inboxHandler<DB>(
  db: Kysely<DB>,
  fn: (tx: Transaction<DB>, envelope: Envelope) => Promise<void>,
  opts: { isolation?: Isolation } = {},
): (envelope: Envelope) => Promise<void> {
  return (envelope) =>
    withTx(
      db,
      async (tx) => {
        if (!(await consume(tx, envelope.id, envelope.subject))) return;
        await fn(tx, envelope);
      },
      opts,
    );
}

/** `onDeadLetter` for bus subscriptions: writes `dead_letters` (source `consumer:<durable or name>`). */
export function deadLetterSink<DB>(
  db: Kysely<DB>,
  source: string,
): (raw: unknown, error: string, subject: string) => Promise<void> {
  return async (raw, error, subject) => {
    await recordDeadLetter(db, { source, subject, payload: raw, error });
  };
}

export function outboxRelayTask<DB>(o: {
  db: Kysely<DB>;
  pool: pg.Pool;
  publish: Publish;
  onError?: (e: unknown) => void;
  pollMs?: number;
}): Task {
  return { name: "outbox-relay", start: () => startOutboxRelay(o) };
}

export function jobWorkerTask<DB>(o: WorkerOptions<DB>): Task {
  return { name: "job-worker", start: () => startJobWorker(o) };
}

export function leaderTask(o: LeaderOptions): Task {
  return { name: `leader:${o.name}`, start: () => advisoryLeader(o) };
}

export interface RecurringJob {
  /** Job kind (must have a handler in the job worker). */
  readonly kind: string;
  /** Period, ms. The job for slot `floor(now / everyMs)` is enqueued once (dedupe key `<kind>:<slot>`). */
  readonly everyMs: number;
  /** Delay within the slot (e.g. 02:00 UTC for a daily job), ms. Default 0. */
  readonly offsetMs?: number;
  readonly payload?: unknown;
}

/** Slot start (epoch ms) of `now` for a recurring job. */
export function recurringSlot(j: Pick<RecurringJob, "everyMs" | "offsetMs">, now: number): number {
  const off = j.offsetMs ?? 0;
  return Math.floor((now - off) / j.everyMs) * j.everyMs + off;
}

/**
 * Enqueues recurring jobs (hourly purges, daily jobs) from a leader-elected loop: every `tickMs` the
 * job of the current slot is enqueued with dedupe key `<kind>:<ISO slot>`, so restarts, several
 * replicas and missed ticks never duplicate or skip a slot that is still current.
 */
export function recurringJobsTask<DB>(o: {
  db: Kysely<DB>;
  pool: pg.Pool;
  /** Leadership name `<svc>:recurring-jobs`. */
  name: string;
  jobs: readonly RecurringJob[];
  tickMs?: number;
  now?: () => number;
  onError?: (e: unknown) => void;
}): Task {
  for (const j of o.jobs) {
    if (!(j.everyMs >= 1_000)) throw new RangeError(`${j.kind}: everyMs must be at least 1000`);
  }
  const now = o.now ?? Date.now;
  const tick = async () => {
    for (const j of o.jobs) {
      const slot = recurringSlot(j, now());
      await enqueueJob(o.db, {
        kind: j.kind,
        payload: { slot: new Date(slot).toISOString(), ...(j.payload ? { data: j.payload } : {}) },
        dedupeKey: `${j.kind}:${new Date(slot).toISOString()}`,
        runAt: new Date(slot),
      });
    }
  };
  return leaderTask({
    pool: o.pool,
    name: o.name,
    ...(o.onError ? { onError: o.onError } : {}),
    run: async (signal) => {
      while (!signal.aborted) {
        try {
          await tick();
        } catch (e) {
          o.onError?.(e);
        }
        await new Promise<void>((r) => {
          const t = setTimeout(r, o.tickMs ?? 30_000);
          signal.addEventListener(
            "abort",
            () => {
              clearTimeout(t);
              r();
            },
            { once: true },
          );
        });
      }
    },
  });
}

export type { JobHandler };
