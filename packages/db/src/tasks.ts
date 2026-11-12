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
import { type Envelope, type RelayOptions, startOutboxRelay } from "./outbox.js";
import { type Isolation, withTx } from "./tx.js";

/**
 * Liveness handle, structural twin of `@nearpay-internal/service` `Heartbeat` (KIT-4): `beat()` once per loop iteration
 * (failed ones included — an outage is readiness, not liveness), `idle()` while not responsible (a leader follower).
 */
export interface Heartbeat {
  beat(): void;
  idle(): void;
}

/** Structural twin of `@nearpay-internal/service` `BackgroundTask` (no dependency on the service package). */
export interface Task {
  readonly name: string;
  /** Liveness budget (KIT-4): the service hands `start` a heartbeat and fails `/healthz` after this much silence. */
  readonly maxSilenceMs?: number;
  start(heartbeat?: Heartbeat): { stop(): Promise<void> } | Promise<{ stop(): Promise<void> }>;
}

/** `maxSilenceMs` option of the kit's tasks: a number overrides the default, `false` opts out of liveness. */
export type SilenceBudget = number | false | undefined;

function budget(b: SilenceBudget, fallback: number): { maxSilenceMs?: number } {
  if (b === false) return {};
  return { maxSilenceMs: b ?? fallback };
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

/** Outbox relay as a background task; liveness budget 120 s by default (beats per batch and per published row). */
export function outboxRelayTask<DB>(o: Omit<RelayOptions<DB>, "heartbeat"> & { maxSilenceMs?: SilenceBudget }): Task {
  const b = budget(o.maxSilenceMs, 120_000);
  return {
    name: "outbox-relay",
    ...b,
    start: (heartbeat) => startOutboxRelay({ ...o, ...(heartbeat && b.maxSilenceMs ? { heartbeat } : {}) }),
  };
}

/**
 * Job worker as a background task; liveness budget max(3 × lease, 120 s) by default. A handler that hangs without
 * `extendLease` blocks its batch (`Promise.all`) and goes silent.
 */
export function jobWorkerTask<DB>(o: Omit<WorkerOptions<DB>, "heartbeat"> & { maxSilenceMs?: SilenceBudget }): Task {
  const b = budget(o.maxSilenceMs, Math.max(3 * (o.leaseSeconds ?? 60) * 1000, 120_000));
  return {
    name: "job-worker",
    ...b,
    start: (heartbeat) => startJobWorker({ ...o, ...(heartbeat && b.maxSilenceMs ? { heartbeat } : {}) }),
  };
}

/**
 * Leader-elected loop as a background task. Followers are idle (never fail `/healthz`); the leader's budget defaults to
 * max(6 × heartbeatMs, 30 s) with `livenessFrom: "leadership"`. With `livenessFrom: "run"`, `run` must call its `beat`
 * at least every `maxSilenceMs` while leading.
 */
export function leaderTask(o: Omit<LeaderOptions, "heartbeat"> & { maxSilenceMs?: SilenceBudget }): Task {
  const b = budget(o.maxSilenceMs, Math.max(6 * (o.heartbeatMs ?? 5_000), 30_000));
  return {
    name: `leader:${o.name}`,
    ...b,
    start: (heartbeat) => advisoryLeader({ ...o, ...(heartbeat && b.maxSilenceMs ? { heartbeat } : {}) }),
  };
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
  /** Liveness budget of the leader's tick loop (default max(3 × tickMs, 60 s)); `false` opts out. */
  maxSilenceMs?: SilenceBudget;
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
    livenessFrom: "run",
    maxSilenceMs: o.maxSilenceMs === false ? false : (o.maxSilenceMs ?? Math.max(3 * (o.tickMs ?? 30_000), 60_000)),
    run: async (signal, beat) => {
      while (!signal.aborted) {
        try {
          await tick();
        } catch (e) {
          o.onError?.(e);
        }
        beat();
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
