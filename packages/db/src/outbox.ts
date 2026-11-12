/**
 * Transactional outbox (ADR-0004, foundations §7–§8). `emit` writes the event in the same
 * transaction as the state change; the relay publishes pending rows in order and marks them.
 * Every envelope is validated against the spec at emit time (typed per subject when the subject
 * is in the catalogue), so a producer can never put a contract-violating event on the bus.
 */
import { toUuid, uuidv7 } from "@nearpay-internal/ids";
import { EventEnvelope, envelopeOf, SUBJECTS, type Subject } from "@nearpay-internal/spec";
import { type Kysely, sql, type Transaction } from "kysely";
import type pg from "pg";
import { type HeldClient, hold } from "./pooled.js";
import type { KitTables } from "./tables.js";

export type Envelope = ReturnType<typeof EventEnvelope.parse>;

export interface EmitInput {
  subject: string;
  aggregate: { type: string; id: string; version: number };
  /** Merchant account UUID (not the `acct_` id), or null for platform events. */
  accountId: string | null;
  livemode: boolean | null;
  data: { object: unknown; previous?: Record<string, unknown> };
  request?: { id: string | null; idempotency_key: string | null };
  traceparent?: string;
  /** Override for tests; defaults to a fresh UUIDv7. */
  id?: string;
  occurredAt?: Date;
}

const CHANNEL = "nearpay_outbox";

/** Writes an event to the outbox inside `tx`. Returns the envelope that will be published. */
export async function emit<DB>(txIn: Transaction<DB>, input: EmitInput): Promise<Envelope> {
  const tx = txIn as unknown as Transaction<KitTables>;
  const envelope = {
    id: input.id ?? uuidv7(),
    subject: input.subject,
    occurred_at: (input.occurredAt ?? new Date()).toISOString(),
    account_id: input.accountId,
    livemode: input.livemode,
    aggregate: input.aggregate,
    data: input.data,
    ...(input.request ? { request: input.request } : {}),
    ...(input.traceparent ? { trace: { traceparent: input.traceparent } } : {}),
  };
  if (input.subject in SUBJECTS) envelopeOf(input.subject as Subject).parse(envelope);
  const parsed = EventEnvelope.parse(envelope);
  await tx
    .insertInto("outbox")
    .values({
      id: parsed.id,
      subject: parsed.subject,
      aggregate_type: parsed.aggregate.type,
      aggregate_id: toUuid(parsed.aggregate.id),
      aggregate_version: parsed.aggregate.version,
      account_id: parsed.account_id,
      livemode: parsed.livemode,
      payload: JSON.stringify(parsed),
      trace: parsed.trace ? JSON.stringify(parsed.trace) : null,
      created_at: parsed.occurred_at,
    })
    .execute();
  await sql`select pg_notify(${CHANNEL}, '')`.execute(tx);
  return parsed;
}

export type Publish = (subject: string, envelope: Envelope, msgId: string) => Promise<void>;

/**
 * How a publish failure is treated (KIT-6):
 * - `retry` — transient (bus down, timeout): retried forever, the row keeps its place (OutboxBacklog alerts);
 * - `poison` — deterministic for this row (payload over the bus limit, invalid subject or envelope): dead-lettered
 *   after `maxAttempts`;
 * - `unroutable` — no stream takes the subject (catalogue change, stream lost): dead-lettered after `maxAttempts` *and*
 *   `unroutableAfterMs` of failing, so a JetStream restart never dead-letters a backlog.
 */
export type PublishFailureClass = "retry" | "poison" | "unroutable";

/** Default classification of NATS JetStream publish errors (`@nats-io/*` 3.x names and messages). */
export function classifyPublishError(e: unknown): PublishFailureClass {
  const name = (e as Error)?.name ?? "";
  const msg = (e as Error)?.message ?? String(e);
  if (/max_payload|payload.*(too large|exceeded)|maximum payload/i.test(msg)) return "poison";
  if (name === "InvalidSubjectError" || /illegal subject|subject mismatch/i.test(msg)) return "poison";
  if (name === "ZodError") return "poison";
  if (name === "JetStreamNotEnabled" || /jetstream is not enabled|no responders|no stream|stream not found/i.test(msg))
    return "unroutable";
  return "retry";
}

export interface DeadLetterPolicy {
  /** Failed attempts before a poison/unroutable row is moved aside (default 5). */
  maxAttempts?: number;
  /** Minimum time an unroutable row must have been failing, ms (default 300 000). */
  unroutableAfterMs?: number;
  classify?: (e: unknown) => PublishFailureClass;
}

/** A row the relay moved to `dead_letters` (source `outbox`). */
export interface OutboxDeadLetter {
  outboxId: string;
  deadLetterId: string;
  subject: string;
  attempts: number;
  error: string;
  class: PublishFailureClass;
}

export interface RelayOptions<DB> {
  db: Kysely<DB>;
  pool: pg.Pool;
  publish: Publish;
  batchSize?: number;
  pollMs?: number;
  onError?: (e: unknown) => void;
  /** Poison-row handling (KIT-6). */
  deadLetter?: DeadLetterPolicy;
  /**
   * Called for every row moved to `dead_letters` (metrics, alerts). Without it the relay reports
   * `ALERT outbox_dead_lettered …` through `onError`.
   */
  onDeadLetter?: (d: OutboxDeadLetter) => void;
  /** Liveness (KIT-4): beaten after every batch (failed ones included) and every published row. */
  heartbeat?: { beat(): void; idle(): void };
}

/** Seconds since the oldest unpublished event was written (metric `outbox_lag_seconds`). */
export async function outboxLagSeconds<DB>(dbIn: Kysely<DB>): Promise<number> {
  const db = dbIn as unknown as Kysely<KitTables>;
  const r = await sql<{
    lag: string | null;
  }>`select extract(epoch from now() - min(created_at))::text as lag from outbox where published_at is null`.execute(
    db,
  );
  return r.rows[0]?.lag ? Math.max(0, Number(r.rows[0].lag)) : 0;
}

const errorText = (e: unknown) => (e instanceof Error ? `${e.name}: ${e.message}` : String(e)).slice(0, 2_000);

export interface RelayBatchOptions {
  batchSize?: number;
  deadLetter?: DeadLetterPolicy;
  onDeadLetter?: (d: OutboxDeadLetter) => void;
}

/**
 * Publishes one batch in order; stops at the first failure so ordering holds. Returns rows published.
 *
 * A failure is counted on its row (`attempts`, `last_error`, `first_failed_at`). A row whose failure is `poison` (or
 * `unroutable` for long enough) and has reached `maxAttempts` is moved to `dead_letters` (source `outbox`, payload
 * `{outbox_id, envelope}`) and the batch continues with the next row, so one permanently failing event never holds back
 * every later one (KIT-6). Consumers already ignore stale `aggregate.version`s; `replayDeadLetter` puts it back.
 */
export async function relayOnce<DB>(
  dbIn: Kysely<DB>,
  publish: Publish,
  batchSizeOrOptions: number | RelayBatchOptions = 100,
): Promise<number> {
  const db = dbIn as unknown as Kysely<KitTables>;
  const o: RelayBatchOptions =
    typeof batchSizeOrOptions === "number" ? { batchSize: batchSizeOrOptions } : batchSizeOrOptions;
  const maxAttempts = o.deadLetter?.maxAttempts ?? 5;
  const unroutableAfterMs = o.deadLetter?.unroutableAfterMs ?? 300_000;
  const classify = o.deadLetter?.classify ?? classifyPublishError;
  const moved: OutboxDeadLetter[] = [];
  const { published, failure } = await db.transaction().execute(async (tx) => {
    const rows = await tx
      .selectFrom("outbox")
      .select([
        "id",
        "subject",
        "payload",
        "attempts",
        sql<number>`(extract(epoch from now() - coalesce(first_failed_at, now())) * 1000)::float8`.as("failing_ms"),
      ])
      .where("published_at", "is", null)
      .orderBy("created_at")
      .orderBy("id")
      .limit(o.batchSize ?? 100)
      .forUpdate()
      .skipLocked()
      .execute();
    const done: string[] = [];
    let failure: unknown = null;
    for (const r of rows) {
      try {
        await publish(r.subject, r.payload as Envelope, r.id);
        done.push(r.id);
      } catch (e) {
        const cls = classify(e);
        const attempts = r.attempts + 1;
        const error = errorText(e);
        const deadLetter =
          attempts >= maxAttempts &&
          (cls === "poison" || (cls === "unroutable" && Number(r.failing_ms) >= unroutableAfterMs));
        if (deadLetter) {
          const deadLetterId = uuidv7();
          await tx
            .insertInto("dead_letters")
            .values({
              id: deadLetterId,
              source: "outbox",
              subject: r.subject,
              payload: JSON.stringify({ outbox_id: r.id, envelope: r.payload }),
              error: `${cls} after ${attempts} attempts: ${error}`,
            })
            .execute();
          await tx.deleteFrom("outbox").where("id", "=", r.id).execute();
          moved.push({ outboxId: r.id, deadLetterId, subject: r.subject, attempts, error, class: cls });
          continue; // the next row is not held back
        }
        await tx
          .updateTable("outbox")
          .set({ attempts, last_error: error, first_failed_at: sql`coalesce(first_failed_at, now())` })
          .where("id", "=", r.id)
          .execute();
        failure = e;
        break;
      }
    }
    if (done.length) await tx.updateTable("outbox").set({ published_at: sql`now()` }).where("id", "in", done).execute();
    return { published: done.length, failure };
  });
  for (const d of moved) {
    try {
      o.onDeadLetter?.(d);
    } catch {
      // an observer must not break the relay
    }
  }
  // The failure count is committed above; report the failure only when nothing moved.
  if (failure && published === 0 && moved.length === 0) throw failure;
  return published;
}

/** Runs the relay until stopped: wakes on NOTIFY from `emit`, polls every `pollMs` as a fallback. */
export function startOutboxRelay<DB>(opts: RelayOptions<DB>): { stop(): Promise<void> } {
  const pollMs = opts.pollMs ?? 500;
  const report = (e: unknown) => {
    try {
      opts.onError?.(e);
    } catch {
      // an error reporter must not stop the relay
    }
  };
  let stopped = false;
  let wake: (() => void) | null = null;
  let listener: HeldClient | null = null;
  const sleep = () =>
    new Promise<void>((r) => {
      const t = setTimeout(r, pollMs);
      wake = () => {
        clearTimeout(t);
        r();
      };
    });

  const listen = async () => {
    let held: HeldClient | null = null;
    try {
      held = hold(await opts.pool.connect());
      const h = held;
      h.on("notification", () => wake?.());
      h.on("error", () => {
        h.destroy();
        if (listener === h) listener = null;
      });
      await h.client.query(`listen ${CHANNEL}`);
      if (h.destroyed) return;
      listener = h;
    } catch (e) {
      held?.destroy();
      report(e);
    }
  };

  const beat = () => opts.heartbeat?.beat();
  const publish: Publish = (subject, envelope, msgId) => opts.publish(subject, envelope, msgId).finally(beat);
  const onDeadLetter =
    opts.onDeadLetter ??
    ((d: OutboxDeadLetter) =>
      report(
        new Error(
          `ALERT outbox_dead_lettered: ${d.subject} (outbox ${d.outboxId}, dead letter ${d.deadLetterId}) after ${d.attempts} attempts: ${d.error}`,
        ),
      ));
  const batchSize = opts.batchSize ?? 100;

  const loop = (async () => {
    await listen();
    while (!stopped) {
      try {
        const n = await relayOnce(opts.db, publish, {
          batchSize,
          ...(opts.deadLetter ? { deadLetter: opts.deadLetter } : {}),
          onDeadLetter,
        });
        beat();
        if (n === batchSize) continue;
      } catch (e) {
        report(e);
        beat(); // a failed batch (DB or bus down) is still a live loop
      }
      if (!listener && !stopped) await listen();
      if (!stopped) await sleep();
    }
  })();

  return {
    async stop() {
      stopped = true;
      (wake as (() => void) | null)?.();
      await loop;
      // A LISTEN session is never returned to the pool.
      listener?.destroy();
      listener = null;
    },
  };
}
