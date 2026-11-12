/**
 * Durable jobs on Postgres (ADR-0004, foundations §7): due jobs are leased with
 * `FOR UPDATE SKIP LOCKED` (60 s); failures back off min(2^attempts × 5 s, 1 h) ± 20 %; after
 * `max_attempts` the job goes to `dead_letters` and stops. `dedupe_key` must start with `<kind>:`.
 */
import { uuidv7 } from "@nearpay-internal/ids";
import { type Kysely, sql, type Transaction } from "kysely";
import type { KitTables } from "./tables.js";

export interface EnqueueInput {
  kind: string;
  payload: unknown;
  runAt?: Date;
  dedupeKey?: string;
  maxAttempts?: number;
}

/** Enqueues a job in `tx`. With a dedupe key, an existing job wins (inserted = false). */
export async function enqueueJob<DB>(
  txIn: Transaction<DB> | Kysely<DB>,
  j: EnqueueInput,
): Promise<{ id: string; inserted: boolean }> {
  const tx = txIn as unknown as Kysely<KitTables>;
  if (!/^[a-z][a-z0-9_.]*$/.test(j.kind)) throw new RangeError(`invalid job kind: ${j.kind}`);
  if (j.dedupeKey !== undefined && !j.dedupeKey.startsWith(`${j.kind}:`))
    throw new RangeError(`dedupe_key must start with "${j.kind}:"`);
  const id = uuidv7();
  const r = await tx
    .insertInto("jobs")
    .values({
      id,
      kind: j.kind,
      payload: JSON.stringify(j.payload ?? null),
      run_at: j.runAt ?? (sql`now()` as never),
      dedupe_key: j.dedupeKey ?? null,
      ...(j.maxAttempts ? { max_attempts: j.maxAttempts } : {}),
    })
    .onConflict((oc) => oc.column("dedupe_key").doNothing())
    .executeTakeFirst();
  if (Number(r.numInsertedOrUpdatedRows ?? 0n) === 1) return { id, inserted: true };
  const existing = await tx
    .selectFrom("jobs")
    .select("id")
    .where("dedupe_key", "=", j.dedupeKey as string)
    .executeTakeFirstOrThrow();
  return { id: existing.id, inserted: false };
}

/** Delay before retry number `attempts` (1-based), ms, with ±20 % jitter. */
export function jobBackoffMs(attempts: number, random: () => number = Math.random): number {
  const base = Math.min(2 ** attempts * 5_000, 3_600_000);
  return Math.round(base * (0.8 + 0.4 * random()));
}

export interface JobContext {
  readonly id: string;
  readonly kind: string;
  readonly attempt: number;
  /** Extends the lease for long-running work. */
  extendLease(seconds?: number): Promise<void>;
}

export type JobHandler = (payload: unknown, ctx: JobContext) => Promise<void>;

export interface WorkerOptions<DB> {
  db: Kysely<DB>;
  handlers: Record<string, JobHandler>;
  workerId: string;
  concurrency?: number;
  pollMs?: number;
  leaseSeconds?: number;
  onError?: (e: unknown, job?: { id: string; kind: string }) => void;
  onDeadLetter?: (job: { id: string; kind: string; error: string }) => void;
  random?: () => number;
  /** Liveness (KIT-4): beaten after every poll (failed ones included) and on every `extendLease`. */
  heartbeat?: { beat(): void; idle(): void };
}

/** Claims and runs one batch of due jobs. Returns the number of jobs processed. */
export async function runDueJobs<DB>(o: WorkerOptions<DB>): Promise<number> {
  const db = o.db as unknown as Kysely<KitTables>;
  const kinds = Object.keys(o.handlers);
  if (kinds.length === 0) return 0;
  const lease = o.leaseSeconds ?? 60;
  const claimed = await sql<{ id: string; kind: string; payload: unknown; attempts: number; max_attempts: number }>`
    update jobs set locked_by = ${o.workerId}, locked_until = now() + make_interval(secs => ${lease})
    where id in (
      select id from jobs
      where done_at is null and run_at <= now() and (locked_until is null or locked_until < now())
        and kind = any(${kinds}::text[])
      order by run_at limit ${o.concurrency ?? 4}
      for update skip locked)
    returning id, kind, payload, attempts, max_attempts`.execute(db);

  await Promise.all(
    claimed.rows.map(async (job) => {
      const ctx: JobContext = {
        id: job.id,
        kind: job.kind,
        attempt: job.attempts + 1,
        extendLease: async (s = lease) => {
          o.heartbeat?.beat();
          await sql`update jobs set locked_until = now() + make_interval(secs => ${s}) where id = ${job.id} and locked_by = ${o.workerId}`.execute(
            db,
          );
        },
      };
      try {
        await (o.handlers[job.kind] as JobHandler)(job.payload, ctx);
        await sql`update jobs set done_at = now(), locked_by = null, locked_until = null, last_error = null where id = ${job.id} and locked_by = ${o.workerId}`.execute(
          db,
        );
      } catch (e) {
        const error = (e as Error)?.message ?? String(e);
        o.onError?.(e, job);
        const attempts = job.attempts + 1;
        if (attempts >= job.max_attempts) {
          await db.transaction().execute(async (tx) => {
            await tx
              .insertInto("dead_letters")
              .values({
                id: uuidv7(),
                source: `job:${job.kind}`,
                subject: null,
                payload: JSON.stringify({ job_id: job.id, payload: job.payload }),
                error,
              })
              .execute();
            await sql`update jobs set attempts = ${attempts}, done_at = now(), locked_by = null, locked_until = null, last_error = ${error} where id = ${job.id}`.execute(
              tx,
            );
          });
          o.onDeadLetter?.({ id: job.id, kind: job.kind, error });
        } else {
          const delay = jobBackoffMs(attempts, o.random);
          await sql`update jobs set attempts = ${attempts}, run_at = now() + make_interval(secs => ${delay / 1000}), locked_by = null, locked_until = null, last_error = ${error} where id = ${job.id}`.execute(
            db,
          );
        }
      }
    }),
  );
  return claimed.rows.length;
}

/** Polls for due jobs until stopped. */
export function startJobWorker<DB>(o: WorkerOptions<DB>): { stop(): Promise<void> } {
  let stopped = false;
  let wake: (() => void) | null = null;
  const loop = (async () => {
    while (!stopped) {
      let n = 0;
      try {
        n = await runDueJobs(o);
      } catch (e) {
        o.onError?.(e);
      }
      o.heartbeat?.beat();
      if (n > 0 || stopped) continue;
      await new Promise<void>((r) => {
        const t = setTimeout(r, o.pollMs ?? 500);
        wake = () => {
          clearTimeout(t);
          r();
        };
      });
    }
  })();
  return {
    async stop() {
      stopped = true;
      (wake as (() => void) | null)?.();
      await loop;
    },
  };
}

/** Number of due jobs per kind (metric `jobs_due{kind}`). */
export async function jobsDue<DB>(dbIn: Kysely<DB>): Promise<Record<string, number>> {
  const db = dbIn as unknown as Kysely<KitTables>;
  const r = await sql<{
    kind: string;
    n: string;
  }>`select kind, count(*)::text as n from jobs where done_at is null and run_at <= now() group by kind`.execute(db);
  return Object.fromEntries(r.rows.map((x) => [x.kind, Number(x.n)]));
}
